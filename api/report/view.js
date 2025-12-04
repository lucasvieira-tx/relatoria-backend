// api/report/view.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("📥 - [Report View] Request received");

  if (req.method !== "GET") {
    console.error("❌ - [Report View] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { id } = req.query;
  console.log("📦 - [Report View] Report ID:", id);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Report View] Missing Authorization header");
    return res.status(401).json({ error: "Missing auth" });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Report View] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }
  const user = userData.user;
  console.log("✅ - [Report View] User authenticated:", user.id);

  const { data: arr, error } = await supabaseAdmin
    .from("report_requests")
    .select("*, datasets(columns, filename, owner_id)")
    .eq("id", id)
    .limit(1);

  console.log("🔍 - [Report View] Fetching report from database...", arr);

  if (error) {
    console.error("❌ - [Report View] Database error:", error.message);
    return res.status(500).json({ error: error.message });
  }
  const rr = arr?.[0];
  if (!rr) {
    console.warn("⚠️ - [Report View] Report not found:", id);
    return res.status(404).json({ error: "Report not found" });
  }

  // Ensure owner
  if (rr.owner_id !== user.id) {
    console.warn("⚠️ - [Report View] User unauthorized to access report:", {
      userId: user.id,
      ownerId: rr.owner_id,
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  console.log("✅ - [Report View] Report found and authorized");

  // If pdf_path exists, create signed URL (short lived)
  let pdf_url = null;
  if (rr.pdf_path) {
    console.log("🔗 - [Report View] Creating signed URL for PDF...");
    console.log("📁 - [Report View] PDF path:", rr.pdf_path);

    try {
      // Extrair bucket e path do pdf_path
      // Se pdf_path = "reports_pdf/folder/file.pdf", separar em bucket e path
      const pathParts = rr.pdf_path.split("/");
      let bucketName = "reports_pdf"; // default
      let filePath = rr.pdf_path;

      // Se o primeiro segmento parece ser um bucket (contém "report" ou "pdf")
      if (
        pathParts.length > 1 &&
        (pathParts[0].includes("report") || pathParts[0].includes("pdf"))
      ) {
        bucketName = pathParts[0];
        filePath = pathParts.slice(1).join("/");
      }

      console.log(
        "🗂️ - [Report View] Bucket:",
        bucketName,
        "| File path:",
        filePath
      );

      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from(bucketName)
        .createSignedUrl(filePath, 60);
      console.log("🔍 - [Report View] Signed response:", {
        signed,
        error: sErr,
      });
      if (!sErr && signed?.signedUrl) {
        pdf_url = signed.signedUrl;
        console.log("✅ - [Report View] Signed URL created successfully");
      } else {
        console.error(
          "❌ - [Report View] Failed to create signed URL:",
          sErr?.message
        );
      }
    } catch (e) {
      console.error("❌ - [Report View] Signed URL exception:", e.message);
    }
  } else {
    console.log("ℹ️ - [Report View] No PDF path available");
  }

  return res.status(200).json({
    id: rr.id,
    status: rr.status,
    created_at: rr.created_at,
    ai_response: rr.ai_response || null,
    pdf_url,
    pdf_path: rr.pdf_path || null,
    dataset: rr.datasets || null,
  });

  console.log("✅ - [Report View] Response sent successfully for report:", id);
}
