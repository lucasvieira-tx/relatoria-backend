import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing auth" });
  const token = authHeader.replace("Bearer ", "");

  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return res.status(401).json({ error: "Invalid token" });

  const { data: arr, error } = await supabaseAdmin
    .from("report_requests")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error) return res.status(500).json({ error: error.message });
  const reqRow = arr?.[0];
  if (!reqRow) return res.status(404).json({ error: "Report not found" });
  if (reqRow.owner_id !== user.id)
    return res.status(403).json({ error: "Forbidden" });

  return res.status(200).json({
    status: reqRow.status,
    pdf_url: reqRow.pdf_path ? `FILE:${reqRow.pdf_path}` : null,
    error_message: reqRow.error_message || null,
    updated_at: reqRow.updated_at,
  });
}
