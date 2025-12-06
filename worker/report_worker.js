// TODO: Busca os report_requests com status 'pending' e processa cada um deles

// import { generatePdf } from "./pdf";
// import { callAI } from "./ai";
import {
  buildMainPrompt,
  buildPromptWithBusinessNiche,
} from "./src/promptBuilder.js";
import { detectPII, replacePII } from "./src/utils.js";
// import { buildHtml } from "./htmlBuilder";
// import { downloadFromStorage } from "./storage";
import { createClient } from "@supabase/supabase-js";

const MAX_RETRIES = 3;
const POLL_INTERVAL = 30000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AI_OUTPUT_SCHEMA = `
{
 "summary": "string",
 "insights": [{"text":"string","confidence":"low|medium|high"}],
 "charts":[
   {"type":"bar|line|pie|table|scatter","title":"string","columns":["string"],"description":"string","config":{}}
 ],
 "kpis":[{"label":"string","value":null|number|string,"unit":"string"}],
 "meta":{"rows_sampled": number,"schema":[{"name":"string","type":"string"}],"warnings":["string"]}
}
`;

async function getNextJob() {
  console.log("🔍 - [Report Worker] Checking for pending jobs...");
  const { data, error } = await supabase.rpc("fetch_next_report_job");

  if (error) {
    console.error(
      "❌ - [Report Worker] Error fetching next job:",
      error.message
    );
    return null;
  }

  const job = data?.[0] || null;
  if (job) {
    console.log("✅ - [Report Worker] Job found:", job.id);
  } else {
    console.log("ℹ️ - [Report Worker] No pending jobs");
  }

  return job;
}

// SQL da função fetch_next_report_job
// melhor performance que SELECT via JS
/*
create or replace function fetch_next_report_job()
returns setof report_requests
language sql
as $$
  select *
  from report_requests
  where status = 'pending'
  order by created_at
  limit 1
  for update skip locked;
$$;
*/

async function processJob(job) {
  const reportId = job.id;
  console.log("🚀 - [Report Worker] Starting job processing:", reportId);

  await log(reportId, "start", "Iniciando processamento");

  try {
    console.log("📝 - [Report Worker] Updating status to 'processing'...");
    await supabase
      .from("report_requests")
      .update({ status: "processing" })
      .eq("id", reportId);

    // load dataset
    console.log("🗂️ - [Report Worker] Loading dataset:", job.dataset_id);
    const { data: dsArr, error: dsErr } = await supabase
      .from("datasets")
      .select("*")
      .eq("id", job.dataset_id)
      .limit(1);

    if (dsErr) {
      throw new Error(`Erro carregando dataset: ${dsErr.message}`);
    }

    const dataset = Array.isArray(dsArr) ? dsArr[0] : dsArr;
    if (!dataset) {
      throw new Error("Dataset não encontrado ou inválido");
    }

    const columns = dataset.columns || [];
    const sampleRaw = dataset.sample_json;
    // load business niche
    const { data: businessInfo, error: businessInfoError } = await supabase
      .from("business_info")
      .select("*")
      .eq("owner_id", job.owner_id)
      .limit(1);

    console.log("🔍 - [Report Worker] Business info loaded:", businessInfo);

    if (businessInfoError) {
      console.error(
        "❌ - [Report Worker] Error loading business info:",
        businessInfoError.message
      );
    }

    const warnings = [];
    let sample = [];
    if (sampleRaw) {
      try {
        const parsed =
          typeof sampleRaw === "string" ? JSON.parse(sampleRaw) : sampleRaw;
        sample = parsed?.sample || parsed || [];
      } catch (err) {
        console.error(
          "❌ - [Report Worker] Erro ao parsear sample_json:",
          err.message
        );
        warnings.push("Não foi possível ler a amostra do dataset");
      }
    }

    const sanitizedSample = sample.map((row) => {
      if (detectPII(row)) {
        warnings.push("PII detectado e removido");
        return replacePII(row);
      }
      return row;
    });

    // build prompt
    console.log("🔨 - [Report Worker] Building AI prompt...");
    let prompt = null;
    if (businessInfo) {
      prompt = buildPromptWithBusinessNiche(
        businessInfo,
        columns,
        sanitizedSample,
        job.parameters,
        AI_OUTPUT_SCHEMA
      );
    } else {
      prompt = buildMainPrompt(
        columns,
        sanitizedSample,
        job.parameters,
        AI_OUTPUT_SCHEMA
      );
    }

    console.log("🔍 - [Report Worker] Prompt built successfully");

    // // call AI
    // console.log("🤖 - [Report Worker] Calling AI service...");
    // const ai_response = await callAI(prompt);
    // console.log("✅ - [Report Worker] AI response received");

    // // generate HTML
    // console.log("📄 - [Report Worker] Generating HTML...");
    // const html = buildHtml(ai_response);
    // console.log("✅ - [Report Worker] HTML generated");

    // // generate PDF
    // console.log("📑 - [Report Worker] Generating PDF...");
    // const pdfBuffer = await generatePdf(html);
    // console.log("✅ - [Report Worker] PDF generated successfully");

    // // upload to storage
    // console.log("☁️ - [Report Worker] Uploading PDF to storage...");
    // const path = `reports/${reportId}.pdf`;
    // await supabase.storage.from("reports").upload(path, pdfBuffer, {
    //   contentType: "application/pdf",
    //   upsert: true,
    // });
    // console.log("✅ - [Report Worker] PDF uploaded to:", path);

    // // update final status
    // console.log("💾 - [Report Worker] Updating final status...");
    // await supabase
    //   .from("report_requests")
    //   .update({
    //     status: "done",
    //     pdf_path: path,
    //     ai_response,
    //   })
    //   .eq("id", reportId);

    console.log("🎉 - [Report Worker] Job completed successfully:", reportId);
    await log(reportId, "done", "Relatório finalizado");
  } catch (err) {
    console.error("❌ - [Report Worker] Job failed:", reportId, err.message);
    await handleFailure(job, err);
  }
}

async function handleFailure(job, error) {
  console.log("⚠️ - [Report Worker] Handling failure for job:", job.id);
  const retries = job.retry_count + 1;
  const newStatus = retries >= MAX_RETRIES ? "failed" : "pending";

  await supabase
    .from("report_requests")
    .update({
      status: newStatus,
      retry_count: retries,
      last_error: error.message,
      updated_at: new Date(),
    })
    .eq("id", job.id);

  if (newStatus === "failed") {
    console.error(
      "💀 - [Report Worker] Job permanently failed after",
      retries,
      "retries:",
      job.id
    );
  } else {
    console.warn(
      "🔄 - [Report Worker] Job will retry (attempt",
      retries,
      "of",
      MAX_RETRIES,
      "):",
      job.id
    );
  }

  await log(job.id, "error", `Falha: ${error.message}, tentativa ${retries}`);
}

async function log(requestId, status, message) {
  await supabase.from("worker_logs").insert({
    request_id: requestId,
    status,
    message,
  });
}

async function mainLoop() {
  console.log("🚀 - [Report Worker] Worker started and running...");
  while (true) {
    const job = await getNextJob();
    if (!job) {
      console.log(
        "😴 - [Report Worker] No jobs found, sleeping for",
        POLL_INTERVAL / 1000,
        "seconds..."
      );
      await new Promise((res) => setTimeout(res, POLL_INTERVAL));
      continue;
    }
    await processJob(job);
  }
}

mainLoop();
