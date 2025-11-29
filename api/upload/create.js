import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    console.log("📥 [Upload] Nova requisição recebida");

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Token not found" })
    }

    // Initialize Supabase client with the user's token to respect RLS for database
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: authHeader,
                },
            },
        }
    );

    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, } = await supabase.auth.getUser(token);

    if (!user) {
        return res.status(401).json({ error: "User not found" })
    }

    console.log("👤 [Upload] Usuário autenticado:", user.id);

    const { filename } = req.body;
    if (!filename) {
        return res.status(400).json({ error: "File name is required" })
    }

    const datasetPath = `${user.id}/${Date.now()}_${filename}`;

    // CREATE THE DATA IN DATABASE
    const { data: dataset, error: datasetError } = await supabase.from("datasets").insert({
        owner_id: user.id,
        name: filename,
        filename: filename,
        storage_path: datasetPath,
        status: "uploaded",
    }).select().single();


    console.log("💾 [Upload] Dataset criado:", dataset);
    if (datasetError) {
        console.error("❌ [Upload] Erro ao criar dataset:", datasetError);
        return res.status(500).json({ error: "Failed to create dataset: " + datasetError.message })
    }

    console.log("⏳ [Upload] Tentando criar URL de upload para:", datasetPath);

    // Use Service Role Key for Storage operations to bypass RLS
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let storageClient = supabase; // Fallback to user client

    if (serviceRoleKey) {
        console.log("🔑 [Upload] Usando Service Role Key para gerar URL");
        storageClient = createClient(
            process.env.SUPABASE_URL,
            serviceRoleKey
        );
    } else {
        console.warn("⚠️ [Upload] SUPABASE_SERVICE_ROLE_KEY não encontrada. Usando cliente do usuário (pode falhar por RLS).");
    }

    const { data: urlData, error: urlError } = await storageClient.storage.from("datasets").createSignedUploadUrl(datasetPath);
    console.log("🌐 [Upload] URL gerada:", urlData);

    if (urlError) {
        console.error("❌ [Upload] Erro ao criar URL de upload:", urlError);
        return res.status(500).json({ error: "Failed to create upload url: " + urlError.message });
    }

    console.log("✅ [Upload] URL gerada com sucesso");

    return res.status(200).json({
        uploadUrl: urlData.signedUrl,
        datasetId: dataset.id,
        path: datasetPath
    })

}