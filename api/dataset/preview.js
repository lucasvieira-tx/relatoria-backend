import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );

  const { id } = req.query;
  console.log("📥 - [Worker Preview] Preview request for dataset", id);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Worker Preview] Missing Authorization header");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Worker Preview] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = userData.user;

  const { data: dsArr, error: dsErr } = await supabaseAdmin
    .from("datasets")
    .select(
      "id, owner_id, filename, storage_path, columns, sample_path, sample_json, row_count"
    )
    .eq("id", id)
    .limit(1);

  if (dsErr) {
    console.error(
      "❌ - [Worker Preview] Database error fetching dataset",
      dsErr.message
    );
    return res.status(500).json({ error: dsErr.message });
  }

  const ds = dsArr?.[0];
  if (!ds) {
    console.warn("⚠️ - [Worker Preview] Dataset not found for ID", id);
    return res.status(404).json({ error: "Data not found" });
  }
  if (ds.owner_id !== user.id) {
    console.warn(
      "⚠️ - [Worker Preview] User unauthorized to access dataset",
      id
    );
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (ds.sample_json) {
    try {
      const sampleObj = JSON.parse(ds.sample_json);
      console.log(
        "✅ - [Worker Preview -Sample_json] Sample downloaded successfully",
        sampleObj
      );
      return res.status(200).json({
        columns: ds.columns || [],
        sample_path: ds.sample_path,
        sample: sampleObj.sample || sampleObj,
        row_count: ds.row_count,
      });
    } catch (err) {
      console.error("❌ - [Worker Preview] Sample parse error", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (ds.sample_path) {
    const { data: download, error: dlErr } = await supabaseAdmin.storage
      .from("datasets")
      .download(ds.sample_path);
    if (!dlErr) {
      const txt = await download.text();
      const sampleObj = JSON.parse(txt);
      console.log("✅ - [Worker Preview] Sample downloaded successfully");
      console.log(
        "✅ - [Worker Preview -Sample_path] Sample downloaded successfully",
        ds.sample_path
      );

      return res.status(200).json({
        columns: ds.columns || [],
        sample_path: ds.sample_path,
        sample: sampleObj.sample || sampleObj,
        row_count: ds.row_count,
      });
    } else {
      // Se o download direto falhou, tenta criar uma URL assinada e fazer fetch
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from("datasets_sample")
        .createSignedUrl(ds.sample_path, 60);

      if (!sErr && signed?.signedUrl) {
        console.log("✅ - [Worker Preview] Signed URL created successfully");

        try {
          // Faz o fetch do arquivo usando a URL assinada
          const response = await fetch(signed.signedUrl);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const text = await response.text();
          const sampleObj = JSON.parse(text);

          console.log(
            "✅ - [Worker Preview] Sample fetched and parsed successfully"
          );

          return res.status(200).json({
            columns: ds.columns || [],
            sample_path: ds.sample_path,
            sample: sampleObj.sample || sampleObj,
            row_count: ds.row_count,
          });
        } catch (fetchErr) {
          console.error(
            "❌ - [Worker Preview] Failed to fetch or parse sample from signed URL",
            fetchErr.message
          );
          return res.status(500).json({
            error: `Failed to fetch sample: ${fetchErr.message}`,
          });
        }
      }

      console.error(
        "❌ - [Worker Preview] Failed to create signed URL",
        sErr?.message
      );
      return res.status(200).json({
        columns: ds.columns || [],
        sample: null,
        row_count: ds.row_count,
      });
    }
  }

  return res
    .status(200)
    .json({ columns: ds.columns || [], sample: [], row_count: ds.row_count });
}
