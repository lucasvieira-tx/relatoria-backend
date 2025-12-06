import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export default async function handler(req, res) {
  console.log("📥 - [Business Info] Request received");

  if (req.method !== "POST") {
    console.error("❌ - [Business Info] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Business Info] Missing Authorization header");
    return res.status(401).json({ error: "Missing auth header" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Business Info] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }

  const user = userData.user;
  console.log("✅ - [Business Info] User authenticated:", user.id);

  const {
    niche_bussiness,
    goal,
    analysis_period,
    info_priority,
    best_data_format,
  } = req.body || {};

  const payload = {
    niche_bussiness: niche_bussiness ?? null,
    goal: goal ?? null,
    analysis_period: analysis_period ?? null,
    info_priority: info_priority ?? null,
    best_data_format: best_data_format ?? null,
  };

  const hasContent = Object.values(payload).some((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  });

  if (!hasContent) {
    console.error("❌ - [Business Info] Payload vazio ou inválido:", payload);
    return res.status(400).json({ error: "Payload inválido" });
  }

  console.log("💾 - [Business Info] Saving business info...");
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("business_info")
    .insert({
      id: randomUUID(),
      ...payload,
      owner_id: user.id,
    })
    .select()
    .single();

  if (insertErr) {
    console.error(
      "❌ - [Business Info] Database insert error:",
      insertErr.message
    );
    return res.status(500).json({ error: insertErr.message });
  }

  console.log(
    "✅ - [Business Info] Business info saved successfully:",
    inserted.id
  );
  return res.status(201).json({ bussiness_info: inserted });
}
