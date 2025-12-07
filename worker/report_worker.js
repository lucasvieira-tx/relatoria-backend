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
import { getAIResponse } from "./src/ai_clients/aiClient.js";

const MAX_RETRIES = 3;
const POLL_INTERVAL = 30000; // 24horas - 24 * 60 * 60 * 1000

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 30000;

const AI_OPTS = {
  model: AI_MODEL,
  timeoutMs: AI_TIMEOUT_MS,
};

const AI_OUTPUT_SCHEMA = `
{
    "summary": "Texto do resumo aqui...",
    "insights": [
      {"text": "Dica de negócio...", "confidence": "high"}
    ],
    "kpis": [
      {"label": "Faturamento Total", "value": 1500.50, "unit": "R$"}
    ],
    "charts": [
      {
        "type": "bar | line | pie | donut | area | table | multi-bar | multi-line | scatter",
        "title": "Título do Gráfico",
        "description": "Explicação curta do que estamos vendo",
        "columns": ["Nome da Categoria (Eixo X)", "Valor Numérico (Eixo Y)"],
        "data_rows": [
          ["Categoria A", 150],
          ["Categoria B", 300]
        ]
      }
    ],
    "meta": {
      "rows_sampled": 30,
      "warnings": ["Aviso se houver dados faltando"]
    }
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
    const { data: businessInfoArr, error: businessInfoError } = await supabase
      .from("business_info")
      .select("*")
      .eq("owner_id", job.owner_id)
      .limit(1);

    const businessInfo = Array.isArray(businessInfoArr)
      ? businessInfoArr[0]
      : businessInfoArr || null;

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

    // niche guidelines
    const nicheGuidelines = getNicheGuidelines(businessInfo.niche_bussiness);

    // build prompt
    console.log("🔨 - [Report Worker] Building AI prompt...");
    let prompt = null;
    if (businessInfo) {
      prompt = buildPromptWithBusinessNiche(
        businessInfo,
        columns,
        sanitizedSample,
        job.parameters,
        AI_OUTPUT_SCHEMA,
        nicheGuidelines
      );
    } else {
      prompt = buildMainPrompt(
        columns,
        sanitizedSample,
        job.parameters,
        AI_OUTPUT_SCHEMA
      );
    }

    console.log("🔍 - [Report Worker] Prompt built successfully", prompt);

    const { parsed, raw, text, usage, validationErrors } = await getAIResponse(
      prompt,
      AI_OPTS
    );
    if (!parsed) {
      console.warn(
        "❌ - [Report Worker] AI response not parsed",
        validationErrors
      );
      console.warn("❌ - [Report Worker] AI response raw", text);
      return;
    }

    // update final status
    console.log("💾 - [Report Worker] Updating final status...");
    // TODO: Validar qual é o valor medio de tokens por resposta do AI
    await supabase
      .from("report_requests")
      .update({
        status: "done",
        ai_response: parsed,
        usage_tokens: usage?.total_tokens || 100,
      })
      .eq("id", reportId);

    console.log("🎉 - [Report Worker] Job completed successfully:", reportId);
    await log(reportId, "done", "Relatório finalizado");
  } catch (err) {
    console.error("❌ - [Report Worker] Job failed:", reportId, err.message);
    await handleFailure(job, err);
  }
}

function getNicheGuidelines(nicheBusiness) {
  const nicheGuidelines = {
    estetica:
      "Para este nicho, foque em gráficos de Tratamentos Mais Vendidos (Bar), Faturamento por Dia da Semana (Bar) e Retenção de Clientes (Pie). Termos chave: Procedimentos, Pacientes, Ticket Médio.",
    roupas:
      "Foque em Vendas por Categoria (Pie/Donut), Tendência de Vendas Diárias (Line) e Top Produtos (Bar). Termos chave: Peças, Coleção, Estoque, Ticket Médio.",
    consultoria:
      "Foque em Receita por Cliente (Bar), Margem de Lucro (Line) e Status de Projetos. Termos chave: Honorários, Contratos, Projetos.",
    marketing:
      "Foque em Origem de Leads (Pie), Custo por Lead (Line) e Conversão de Campanhas (Bar). Termos chave: Leads, ROI, Tráfego, Campanhas.",
    financeiro:
      "Foque estritamente em Entradas vs Saídas (Multi-Bar/Line), Categorias de Despesas (Pie) e Lucratividade. Termos chave: Receita, Despesa, Saldo, Inadimplência.",
    educacao:
      "Foque em Alunos por Curso (Bar), Taxa de Evasão/Cancelamento (Line) e Receita por Turma. Termos chave: Matrículas, Alunos, Turmas, Mensalidades.",
    default:
      "Foque em Tendência Temporal (Line), Distribuição por Categoria (Pie) e Rankings de Performance (Bar).",
  };

  // Seleciona a guideline baseada no input do usuário
  const selectedGuideline =
    nicheGuidelines[nicheBusiness.toLowerCase()] || nicheGuidelines["default"];
  return selectedGuideline;
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
