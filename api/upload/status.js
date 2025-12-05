import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("📥 - [Upload Status] Request received");

  if (req.method !== "GET") {
    console.error("❌ - [Upload Status] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Upload Status] Missing Authorization header");
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Upload Status] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }
  const user = userData.user;

  const datasetId = req.query.id;
  if (!datasetId) {
    console.error("❌ - [Upload Status] Missing dataset id");
    return res.status(400).json({ error: "dataset id is required" });
  }

  try {
    const { data: rows, error: fetchErr } = await supabaseAdmin
      .from("datasets")
      .select("id, owner_id, status")
      .eq("id", datasetId)
      .limit(1);

    if (fetchErr) {
      console.error("❌ - [Upload Status] Fetch error:", fetchErr.message);
      return res.status(500).json({ error: "Failed to fetch dataset" });
    }

    const dataset = rows?.[0];
    if (!dataset) {
      console.warn("⚠️ - [Upload Status] Dataset not found:", datasetId);
      return res.status(404).json({ error: "Dataset not found" });
    }

    if (dataset.owner_id !== user.id) {
      console.warn("⚠️ - [Upload Status] Forbidden", {
        userId: user.id,
        ownerId: dataset.owner_id,
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    console.log("✅ - [Upload Status] Dataset status retrieved:", {
      id: dataset.id,
      status: dataset.status,
    });

    return res.status(200).json({
      id: dataset.id,
      status: dataset.status
    });
  } catch (err) {
    console.error("❌ - [Upload Status] Unexpected error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

