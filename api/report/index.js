import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/report
 * Body: { dataset_id: string, parameters?: object }
 * Header: Authorization: Bearer <jwt>
 *
 * Response:
 * { request_id: "<uuid>", status: "pending" }
 */

export default async function handler(req, res) {
  console.log("📥 - [Report Create] Request received");

  if (req.method !== "POST") {
    console.error("❌ - [Report Create] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // AUTH
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Report Create] Missing Authorization header");
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    console.error("❌ - [Report Create] Missing token");
    return res.status(401).json({ error: "Missing token" });
  }

  // get user from token (validate)
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Report Create] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }
  const user = userData.user;
  console.log("✅ - [Report Create] User authenticated:", user.id);

  // parse body
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    console.error("❌ - [Report Create] Invalid JSON body", e.message);
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { dataset_id: datasetId, parameters = {} } = body || {};
  console.log("📦 - [Report Create] Payload received:", {
    datasetId,
    parameters,
  });

  if (!datasetId) {
    console.error("❌ - [Report Create] Missing dataset_id");
    return res.status(400).json({ error: "dataset_id is required" });
  }

  // verify dataset ownership (security double-check)
  console.log("🔍 - [Report Create] Verifying dataset ownership...");
  let ds; // Declarar aqui para estar acessível em todo o handler
  try {
    const { data: dsArr, error: dsErr } = await supabaseAdmin
      .from("datasets")
      .select("id, owner_id, status")
      .eq("id", datasetId)
      .limit(1);

    if (dsErr) {
      console.error(
        "❌ - [Report Create] Database error fetching dataset:",
        dsErr.message
      );
      throw dsErr;
    }
    ds = dsArr?.[0];
    if (!ds) {
      console.warn("⚠️ - [Report Create] Dataset not found:", datasetId);
      return res.status(404).json({ error: "Dataset not found" });
    }
    if (ds.owner_id !== user.id) {
      console.warn(
        "⚠️ - [Report Create] User unauthorized to access dataset:",
        { userId: user.id, ownerId: ds.owner_id }
      );
      return res
        .status(403)
        .json({ error: "Forbidden: not the dataset owner" });
    }

    // Optionally warn if dataset not parsed
    if (ds.status !== "parsed") {
      console.warn(
        "⚠️ - [Report Create] Dataset status is not 'parsed':",
        ds.status
      );
      // we allow request, but we include a warning in response
      // alternatively you may block: return 400 ...
      // we'll include the warning in the response payload
    } else {
      console.log("✅ - [Report Create] Dataset verified and parsed");
    }
  } catch (err) {
    console.error("dataset lookup error", err);
    return res
      .status(500)
      .json({ error: "Internal error during dataset validation" });
  }

  // create report_request row
  console.log("💾 - [Report Create] Creating report request in database...");
  try {
    const payload = {
      owner_id: user.id,
      dataset_id: datasetId,
      status: "pending",
      parameters: parameters, // stored as jsonb
      ai_response: null,
      html_report_path: null,
      pdf_path: null,
      sent_via_email: false,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("report_requests")
      .insert(payload)
      .select() // return row
      .single();

    if (insertErr) {
      console.error(
        "❌ - [Report Create] Database insert error:",
        insertErr.message
      );
      return res.status(500).json({ error: insertErr.message });
    }

    console.log(
      "✅ - [Report Create] Report request created successfully:",
      inserted.id
    );

    // Return the id and status for frontend navigation
    return res.status(201).json({
      request_id: inserted.id,
      status: inserted.status,
      warning:
        ds?.status !== "parsed"
          ? `Dataset status is '${ds.status}'`
          : undefined,
    });
  } catch (err) {
    console.error("create report_request error", err);
    return res.status(500).json({ error: "Failed to create report request" });
  }
}
