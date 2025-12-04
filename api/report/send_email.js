// api/report/send_email.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("📥 - [Send Email] Request received");

  if (req.method !== "POST") {
    console.error("❌ - [Send Email] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { id } = req.query;
  console.log("📦 - [Send Email] Report ID:", id);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Send Email] Missing Authorization header");
    return res.status(401).json({ error: "Missing auth" });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (!user) {
    console.error("❌ - [Send Email] Invalid token or user not found");
    return res.status(401).json({ error: "Invalid token" });
  }
  console.log("✅ - [Send Email] User authenticated:", user.id);

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const {
    to,
    subject = "Seu relatório",
    message = "Segue o relatório em anexo.",
  } = body || {};
  console.log("📧 - [Send Email] Email details:", { to, subject });

  if (!to) {
    console.error("❌ - [Send Email] Missing recipient email");
    return res.status(400).json({ error: "to (email) is required" });
  }

  // get report
  console.log("🔍 - [Send Email] Fetching report from database...");
  const { data: arr, error } = await supabaseAdmin
    .from("report_requests")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (error) {
    console.error("❌ - [Send Email] Database error:", error.message);
    return res.status(500).json({ error: error.message });
  }
  const rr = arr?.[0];
  if (!rr) {
    console.warn("⚠️ - [Send Email] Report not found:", id);
    return res.status(404).json({ error: "Report not found" });
  }
  if (rr.owner_id !== user.id) {
    console.warn("⚠️ - [Send Email] User unauthorized to access report:", {
      userId: user.id,
      ownerId: rr.owner_id,
    });
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!rr.pdf_path) {
    console.warn("⚠️ - [Send Email] PDF not available for report:", id);
    return res.status(400).json({ error: "PDF not available" });
  }

  console.log("✅ - [Send Email] Report found and validated");

  // create signed url for attachment or link
  console.log("🔗 - [Send Email] Creating signed URL for PDF...");
  console.log("📁 - [Send Email] PDF path:", rr.pdf_path);

  // Extrair bucket e path do pdf_path
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
    "🗂️ - [Send Email] Bucket:",
    bucketName,
    "| File path:",
    filePath
  );

  const { data: signed, error: sErr } = await supabaseAdmin.storage
    .from(bucketName)
    .createSignedUrl(filePath, 60 * 60); // 1 hour
  if (sErr) {
    console.error(
      "❌ - [Send Email] Failed to create signed URL:",
      sErr.message
    );
    return res.status(500).json({ error: sErr.message });
  }

  const pdf_url = signed.signedUrl;
  console.log("✅ - [Send Email] Signed URL created successfully");

  // Send using Resend (example). Replace with your provider and API key in env.
  console.log("📤 - [Send Email] Preparing to send email...");
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("❌ - [Send Email] Resend API key not configured");
      return res.status(500).json({ error: "Resend API key not configured" });
    }

    const emailPayload = {
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      html: `<p>${message}</p><p>Download do PDF: <a href="${pdf_url}">baixar relatório</a></p>`,
    };

    console.log("📨 - [Send Email] Sending email via Resend API...");

    // Usando fetch nativo do Node.js v18+
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error("❌ - [Send Email] Resend API error:", errText);
      return res.status(500).json({ error: "Failed to send email" });
    }

    console.log("✅ - [Send Email] Email sent successfully");

    // mark sent_via_email true
    console.log("💾 - [Send Email] Updating report status...");
    await supabaseAdmin
      .from("report_requests")
      .update({ sent_via_email: true })
      .eq("id", id);

    console.log("✅ - [Send Email] Report marked as sent via email");
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("❌ - [Send Email] Exception during email send:", e.message);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
