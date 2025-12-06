// deepseekClient.js
// Implementação usando o SDK oficial "openai" apontando para a base do DeepSeek.
// Aqui usamos chat completions (compatível com OpenAI) porque o endpoint /responses não está disponível no DeepSeek.

import { OpenAI } from "openai";

const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

if (!API_KEY) {
  console.warn("⚠️ DEEPSEEK_API_KEY não configurada.");
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// Extrai texto de chat completions
export function extractTextFromResponse(resp) {
  if (!resp) return null;
  const choice = resp.choices?.[0];
  const content = choice?.message?.content;
  if (Array.isArray(content)) {
    // content pode ser array de partes
    const textParts = content
      .map((c) => c?.text || c?.content || "")
      .filter(Boolean);
    if (textParts.length) return textParts.join("\n");
  }
  if (typeof content === "string") return content;
  if (choice?.text) return choice.text;
  return JSON.stringify(resp);
}

function sanitizeJsonText(text = "") {
  const fenced = text.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    text = fenced[1];
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end >= start) {
    return text.slice(start, end + 1).trim();
  }
  return text.trim();
}

export async function callResponsesAndParseJSON({
  model = DEFAULT_MODEL,
  input,
  temperature = 0.2,
  timeoutMs = 30000,
} = {}) {
  if (!API_KEY) throw new Error("DEEPSEEK_API_KEY not configured");

  const timeout = Number(timeoutMs) || 30000;

  // DeepSeek é compatível com chat completions (estilo OpenAI)
  // Transforma o input (string) em messages.
  const messages = [{ role: "user", content: input }];

  const resp = await client.chat.completions.create(
    {
      model,
      messages,
      temperature,
    },
    {
      timeout,
    }
  );

  const text = extractTextFromResponse(resp);
  if (!text) throw new Error("DeepSeek retornou texto vazio");
  const jsonText = sanitizeJsonText(text);
  try {
    const parsed = JSON.parse(jsonText);
    return { parsed, raw: resp, text, usage: resp.usage || null };
  } catch (e) {
    return { parsed: null, raw: resp, text, usage: resp.usage || null };
  }
}

export default {
  callResponsesAndParseJSON,
  extractTextFromResponse,
};
