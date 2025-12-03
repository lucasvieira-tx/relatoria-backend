import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  console.log("📥 - [Save Mapping] Request received");

  if (req.method !== "POST") {
    console.error("❌ - [Save Mapping] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Save Mapping] Missing Authorization header");
    return res.status(401).json({ error: "Missing auth" });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Save Mapping] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }
  const user = userData.user;
  console.log("✅ - [Save Mapping] User authenticated:", user.id);

  const { datasetId, mappings } = req.body;
  console.log("📦 - [Save Mapping] Payload received:", {
    datasetId,
    mappingsCount: mappings?.length,
  });

  if (!datasetId || !Array.isArray(mappings)) {
    console.error("❌ - [Save Mapping] Invalid payload:", {
      datasetId,
      mappings,
    });
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { data: dsArr, error: dsErr } = await supabaseAdmin
    .from("datasets")
    .select("owner_id, columns")
    .eq("id", datasetId)
    .limit(1);
  if (dsErr) {
    console.error(
      "❌ - [Save Mapping] Database error fetching dataset:",
      dsErr.message
    );
    return res.status(500).json({ error: dsErr.message });
  }
  const ds = dsArr?.[0];
  if (!ds) {
    console.warn("⚠️ - [Save Mapping] Dataset not found:", datasetId);
    return res.status(404).json({ error: "Dataset not found" });
  }
  if (ds.owner_id !== user.id) {
    console.warn("⚠️ - [Save Mapping] User unauthorized to access dataset:", {
      userId: user.id,
      ownerId: ds.owner_id,
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  const currentCols = ds.columns || [];
  console.log("🔄 - [Save Mapping] Merging mappings with current columns:", {
    currentColsCount: currentCols.length,
    mappingsCount: mappings.length,
  });

  const merged = currentCols.map((col) => {
    const m = mappings.find((x) => x.name === col.name);
    if (!m) return col;
    return {
      ...col,
      user_type: m.type ?? col.type,
      user_subtype: m.subtype ?? col.subtype,
      is_time: !!m.is_time,
      is_index: !!m.is_index,
    };
  });

  console.log("✅ - [Save Mapping] Columns merged successfully:", {
    mergedCount: merged.length,
  });

  console.log("💾 - [Save Mapping] Updating dataset in database...");

  const { error: updErr } = await supabaseAdmin
    .from("datasets")
    .update({ columns: merged })
    .eq("id", datasetId);

  if (updErr) {
    console.error("❌ - [Save Mapping] Database update error:", updErr.message);
    return res.status(500).json({ error: updErr.message });
  }

  console.log(
    "✅ - [Save Mapping] Mapping saved successfully for dataset:",
    datasetId
  );
  return res.status(200).json({ ok: true, columns: merged });
}
