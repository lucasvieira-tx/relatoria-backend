// aiClient.js
// Wrapper unificado: usa ENV AI_PROVIDER = 'deepseek' | 'openai'
// Exporta: getAIResponse(prompt, {model, timeoutMs})
// Retorna: { parsed, raw, text, usage }
// Se parsed === null, é responsabilidade do chamador acionar fallback.

import * as deepseek from "./deepseekClient.js";
import * as openai from "./openaiClient.js";

import Ajv from "ajv";
import addFormats from "ajv-formats";

// -------------------------
// Schema AJV (mesmo schema que definimos antes)
// -------------------------
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const aiSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          confidence: { type: "string", nullable: true },
        },
        required: ["text"],
        additionalProperties: true,
      },
    },
    charts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          columns: {
            type: "array",
            items: { type: "string" },
          },
          data_rows: {
            type: "array",
            items: {
              type: "array",
              items: { type: ["string", "number"] },
            },
          },
          description: { type: "string", nullable: true },
          config: {
            type: "object",
            nullable: true,
            additionalProperties: true,
          },
        },
        required: ["type", "title", "columns", "data_rows"],
      },
    },
    kpis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: ["number", "string", "null"] },
          unit: { type: "string", nullable: true },
        },
        required: ["label", "value"],
      },
    },
    meta: {
      type: "object",
      properties: {
        rows_sampled: { type: "number" },
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, type: { type: "string" } },
            required: ["name", "type"],
          },
        },
        warnings: { type: "array", items: { type: "string" }, nullable: true },
      },
      required: ["rows_sampled"],
    },
  },
  required: ["summary", "insights", "charts", "kpis", "meta"],
  additionalProperties: true,
};

const validate = ajv.compile(aiSchema);

const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

export async function getAIResponse(prompt, opts = {}) {
  const provider = PROVIDER === "deepseek" ? "deepseek" : "openai";
  const timeoutMs = Number(opts.timeoutMs) || 30000;

  // Seleciona modelo conforme provider para evitar "Model Not Exist"
  const model =
    provider === "deepseek"
      ? process.env.DEEPSEEK_MODEL || opts.model || "deepseek-chat"
      : opts.model || process.env.AI_MODEL || "gpt-4o-mini";

  let resp = null;
  if (provider === "deepseek") {
    resp = await deepseek.callResponsesAndParseJSON({
      model,
      input: prompt,
      timeoutMs,
    });
  } else {
    resp = await openai.callResponsesAndParseJSON({
      model,
      input: prompt,
      timeoutMs,
    });
  }

  // resp: { parsed, raw, text, usage? }
  const { parsed, raw, text, usage } = resp;

  if (parsed) {
    const ok = validate(parsed);
    if (!ok) {
      // validacao AJV falhou. retornamos parsed=null e raw para caller decidir fallback
      return {
        parsed: null,
        raw,
        text,
        usage,
        validationErrors: validate.errors,
      };
    }
    return { parsed, raw, text, usage };
  }

  // parsed === null -> nao foi possivel parsear JSON
  return { parsed: null, raw, text, usage, validationErrors: null };
}

export const validateSchema = (obj) => validate(obj);
