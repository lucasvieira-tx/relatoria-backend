// openaiClient.js
// Client OpenAI em JS (usando package oficial 'openai').
// Exports: callResponsesAndParseJSON similar ao deepseekClient

import { OpenAI } from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
if (!OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY não encontrada.");

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

async function _callOpenAIResponses({
  model = "gpt-4o-mini",
  input,
  timeoutMs = 30000,
  retries = 2,
} = {}) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      // Usamos responses endpoint
      const resp = await client.responses.create({
        model,
        input,
        temperature: 0.2,
      });
      return resp;
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt > retries) break;
      const backoff = 200 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

export function extractTextFromOpenAIResponse(resp) {
  if (!resp) return null;
  if (resp.output_text) return resp.output_text;
  if (resp.output && Array.isArray(resp.output) && resp.output[0]) {
    const c0 = resp.output[0];
    if (c0?.content && Array.isArray(c0.content)) {
      for (const block of c0.content) {
        if (typeof block.text === "string") return block.text;
      }
      return c0.content.map((c) => c?.text || "").join("\n");
    }
  }
  if (resp.choices && Array.isArray(resp.choices)) {
    return resp.choices
      .map((c) => c.text || (c.message && c.message.content) || "")
      .join("\n");
  }
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

export async function callResponsesAndParseJSON(opts = {}) {
  const resp = await _callOpenAIResponses(opts);
  const text = extractTextFromOpenAIResponse(resp);
  if (!text) throw new Error("OpenAI returned empty text");
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
};
