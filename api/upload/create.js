import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Token not found" })
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, } = await supabase.auth.getUser(token);

    if (!user) {
        return res.status(401).json({ error: "User not found" })
    }

    const { fileName } = req.body;
    if (!fileName) {
        return res.status(400).json({ error: "File name is required" })
    }

    const datasetPath = `${user.id}/${Date.now()}_${fileName}`;

    // CREATE THE DATA IN DATABASE
    const { data: dataset, error: datasetError } = await supabase.from("datasets").insert({
        owner_id: user.id,
        name: fileName,
        fileName: fileName,
        storage_path: datasetPath,
        status: "uploaded",
    }).select().single();

    if (datasetError) {
        return res.status(500).json({ error: "Failed to create dataset: " + datasetError.message })
    }

    const { data: urlData, error: urlError } = await supabase.storage.from("datasets").createSignedUploadUrl(datasetPath);

    if (urlError) {
        return res.status(500).json({ error: "Failed to create upload url: " + urlError.message })
    }

    return res.status(200).json({
        uploadUrl: urlData.signedUrl,
        datasetId: dataset.id,
        path: datasetPath
    })

}