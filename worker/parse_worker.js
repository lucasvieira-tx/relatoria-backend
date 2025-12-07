import fs from "fs";
import os from "os";
import path from "path";
import { supabaseAdmin } from "./helpers/supabaseAdmin.js";
import { extractFromCSV, extractFromXLSX } from "./schemaExtractor.js";

const POLL_INTERVAL = 30000; // 24horas - 24 * 60 * 60 * 1000
const MAX_SAMPLE_SIZE = 100;

/**
 * Seleciona um dataset com status 'uploaded', marca-o como 'processing' e retorna o dataset atualizado.
 * Utiliza uma transação SQL para garantir atomicidade.
 *
 * @returns {Promise<object | null>} O dataset processado se a operação for bem-sucedida, ou `null` em caso de erro ou se nenhum dataset for encontrado.
 */
/**
 * Seleciona um dataset com status 'uploaded', marca-o como 'processing' e retorna o dataset atualizado.
 * Utiliza uma transação implícita (seleção seguida de atualização) para tentar garantir que apenas um worker processe um dataset por vez.
 *
 * @returns {Promise<object | null>} O dataset processado se a operação for bem-sucedida, ou `null` em caso de erro ou se nenhum dataset for encontrado.
 */
async function pickSimple() {
  const { data } = await supabaseAdmin
    .from("datasets")
    .select("*")
    .eq("status", "uploaded")
    .order("created_at", { ascending: true })
    .limit(1);
  if (!data || data.length === 0) return null;

  const ds = data[0];
  const { error } = await supabaseAdmin
    .from("datasets")
    .update({ status: "processing" })
    .eq("id", ds.id)
    .eq("status", "uploaded");
  if (error) {
    console.warn(
      "⚠️ [Worker] Could not mark dataset as processing:",
      error.message
    );
    return null;
  }

  console.log("✅ [Worker] Dataset marked as processing:", ds.id);

  return ds;
}

/**
 * Processa um dataset completo: baixa o arquivo, extrai o esquema e uma amostra,
 * e atualiza o status do dataset no banco de dados.
 * Em caso de erro durante o download ou parsing, o status do dataset é marcado como 'invalid'.
 *
 * @param {object} ds - O objeto dataset a ser processado, contendo informações como id, storage_path, filename, etc.
 * @returns {Promise<void>} Não retorna diretamente um valor, mas atualiza o estado do dataset no banco de dados.
 */
async function processDataset(ds) {
  console.log("🌐 - [Worker] Processing", ds.id);

  // Download
  const { data: download, error: dlErr } = await supabaseAdmin.storage
    .from("datasets")
    .download(ds.storage_path);
  if (dlErr) {
    console.error("❌ - [Worker] Download error", dlErr.message);
    await supabaseAdmin
      .from("datasets")
      .update({ status: "invalid", error_message: dlErr.message })
      .eq("id", ds.id);
    return;
  }

  const buffer = Buffer.from(await download.arrayBuffer());
  // temp file if needed
  const ext = path.extname(ds.filename || ds.storage_path || "").toLowerCase();
  let result;
  try {
    if (ext === ".csv" || ext === "") {
      result = await extractFromCSV(buffer, {
        sampleRows: 30,
        maxInspect: 2000,
      });
      console.log("✅ - [Worker] CSV parsed successfully");
    } else {
      result = await extractFromXLSX(buffer, { sampleRows: 30 });
      console.log("✅ - [Worker] XLSX parsed successfully");
    }
  } catch (err) {
    console.error("❌ - [Worker] Parse error", err.message);
    await supabaseAdmin
      .from("datasets")
      .update({ status: "invalid", error_message: err.message })
      .eq("id", ds.id);
    return;
  }

  // save sample small -> DB or Storage
  const sampleJson = JSON.stringify({ sample: result.sample });
  console.log("✅ - [Worker] Sample extracted successfully");
  let sample_path = null;
  console.log("✅ - [Worker] Sample size: " + sampleJson.length);
  if (sampleJson.length > MAX_SAMPLE_SIZE) {
    sample_path = `datasets_samples/${ds.id}_sample.json`;
    console.log("✅ - [Worker] Sample saved to storage");
    const { error: sampleErr } = await supabaseAdmin.storage
      .from("datasets_sample")
      .upload(sample_path, Buffer.from(sampleJson), {
        contentType: "application/json",
      });
    if (sampleErr) {
      console.error("❌ - [Worker] Sample upload error", sampleErr.message);
      await supabaseAdmin
        .from("datasets")
        .update({ status: "invalid", error_message: sampleErr.message })
        .eq("id", ds.id);
      return;
    }
  }

  // update dataset
  const upd = {
    row_count: result.row_count,
    columns: result.columns,
    size_bytes: buffer.length,
    status: "parsed",
    parsed_at: new Date().toISOString(),
    sample_path: sample_path,
    sample_json: sampleJson,
  };
  const { error: updErr } = await supabaseAdmin
    .from("datasets")
    .update(upd)
    .eq("id", ds.id);
  if (updErr) {
    console.error("❌ - [Worker] Update error", updErr.message);
    await supabaseAdmin
      .from("datasets")
      .update({ status: "invalid", error_message: updErr.message })
      .eq("id", ds.id);
    return;
  }
  console.log("✅ - [Worker] Parsed successfully:", ds.id);
}

async function loop() {
  while (true) {
    console.log("🌐 - [Worker] Looping...");
    try {
      const ds = await pickSimple();
      if (ds) {
        await processDataset(ds);
      } else {
        // nothing to do
        console.log("🌐 - [Worker] No dataset to parse");
      }
    } catch (err) {
      console.error("🌐 - [Worker] Worker error", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

loop();
