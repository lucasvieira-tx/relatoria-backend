import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("📥 - [Business Info Status] Request received");

  if (req.method !== "GET") {
    console.error(
      "❌ - [Business Info Status] Method not allowed:",
      req.method
    );
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Business Info Status] Missing Authorization header");
    return res.status(401).json({ error: "Missing auth header" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Business Info Status] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }

  const user = userData.user;
  const ownerId = req.query?.owner_id || req.query?.ownerId || user.id;

  if (!ownerId) {
    console.error("❌ - [Business Info Status] Missing owner_id");
    return res.status(400).json({ error: "owner_id is required" });
  }

  if (ownerId !== user.id) {
    console.warn(
      "⚠️ - [Business Info Status] owner_id does not match authenticated user",
      { ownerId, userId: user.id }
    );
    return res.status(403).json({ error: "Forbidden" });
  }

  console.log(
    "🔍 - [Business Info Status] Checking records for owner:",
    ownerId
  );
  const { data: records, error: fetchErr } = await supabaseAdmin
    .from("bussiness_info")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (fetchErr) {
    console.error(
      "❌ - [Business Info Status] Database fetch error:",
      fetchErr.message
    );
    return res.status(500).json({ error: fetchErr.message });
  }

  const exists = Array.isArray(records) && records.length > 0;

  return res.status(200).json({
    exists: exists,
  });
}
