// Exemplo de como usar a API do RelatorIA Backend

// 1. Exemplo básico com fetch (Browser ou Node.js com node-fetch)
async function exemploBasico() {
    const token = 'seu_token_aqui'; // Token do Supabase
    const fileName = 'dados.csv';

    try {
        const response = await fetch('http://localhost:3000/api/upload/create', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileName })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Upload URL criada com sucesso!');
            console.log('URL:', data.uploadUrl);
            console.log('Dataset ID:', data.datasetId);
            console.log('Path:', data.path);
        } else {
            console.error('❌ Erro:', data.error);
        }
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
    }
}

// 2. Exemplo com axios (mais comum em projetos React/Vue)
async function exemploComAxios() {
    const axios = require('axios');

    const token = 'seu_token_aqui';

    try {
        const { data } = await axios.post(
            'http://localhost:3000/api/upload/create',
            { fileName: 'dados.csv' },
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        console.log('Upload URL:', data.uploadUrl);
        return data;
    } catch (error) {
        console.error('Erro:', error.response?.data || error.message);
    }
}

// 3. Exemplo completo: criar URL e fazer upload
async function exemploCompleto() {
    const token = 'seu_token_aqui';
    const file = new File(['conteúdo'], 'dados.csv');

    // Passo 1: Criar URL de upload
    const createResponse = await fetch('http://localhost:3000/api/upload/create', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileName: file.name })
    });

    const { uploadUrl, datasetId } = await createResponse.json();

    // Passo 2: Fazer upload do arquivo
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': 'text/csv'
        }
    });

    if (uploadResponse.ok) {
        console.log('✅ Arquivo enviado com sucesso!');
        console.log('Dataset ID:', datasetId);
    }
}

// 4. Exemplo em React Component
function ComponenteReact() {
    const [loading, setLoading] = React.useState(false);

    const handleUpload = async (file) => {
        setLoading(true);

        try {
            // Pegar token do Supabase (exemplo)
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            // Criar URL de upload
            const response = await fetch('http://localhost:3000/api/upload/create', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fileName: file.name })
            });

            const { uploadUrl, datasetId } = await response.json();

            // Upload do arquivo
            await fetch(uploadUrl, {
                method: 'PUT',
                body: file
            });

            alert(`Arquivo enviado! Dataset ID: ${datasetId}`);
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao enviar arquivo');
        } finally {
            setLoading(false);
        }
    };

    return (
        <input
            type="file"
            onChange={(e) => handleUpload(e.target.files[0])}
            disabled={loading}
        />
    );
}

// Descomente para testar:
// exemploBasico();
