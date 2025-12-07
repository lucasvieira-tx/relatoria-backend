import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    console.warn("⚠️ - [AI Report] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;
  if (!id) {
    console.error("❌ - [AI Report] Missing report id");
    return res.status(400).json({ error: "Missing report id" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [AI Report] Missing Authorization header");
    return res.status(401).json({ error: "Missing Authorization header" });
  }
  const token = authHeader.replace("Bearer ", "");

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  const user = userData?.user;
  if (userErr || !user) {
    console.error(
      "❌ - [AI Report] Invalid token",
      userErr?.message || "unknown error"
    );
    return res.status(401).json({ error: "Invalid token" });
  }

  const { data: arr, error } = await supabaseAdmin
    .from("report_requests")
    .select("ai_response, pdf_path")
    .eq("id", id)
    .limit(1);

  if (error) {
    console.error("❌ - [AI Report] DB error", error.message);
    return res.status(500).json({ error: error.message });
  }

  const reqRow = arr?.[0];
  if (!reqRow) {
    console.warn("⚠️ - [AI Report] Report not found", id);
    return res.status(404).json({ error: "Report not found" });
  }

  console.log("✅ - [AI Report] Report fetched", id);

  return res.status(200).json({
    ai_response: reqRow.ai_response ?? null,
    pdf_path: reqRow.pdf_path ?? null,
  });
}
