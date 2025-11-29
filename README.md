# RelatorIA Backend API

Backend API para o sistema RelatorIA.

## 🚀 Como Rodar

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Certifique-se de que o arquivo `.env` existe na raiz do projeto com as seguintes variáveis:

```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_anonima
PORT=3000
```

### 3. Iniciar o Servidor

**Modo de Desenvolvimento (com auto-reload):**
```bash
npm run dev
```

**Modo de Produção:**
```bash
npm start
```

O servidor estará rodando em `http://localhost:3000`

## 📍 Endpoints Disponíveis

### Health Check
```
GET /
```
Retorna o status do servidor.

### Criar URL de Upload
```
POST /api/upload/create
```

**Headers:**
```
Authorization: Bearer <seu_token>
Content-Type: application/json
```

**Body:**
```json
{
  "fileName": "nome_do_arquivo.csv"
}
```

**Resposta de Sucesso (200):**
```json
{
  "uploadUrl": "https://...",
  "datasetId": "uuid",
  "path": "user_id/timestamp_filename"
}
```

## 🔧 Acessar de Outras Partes

### Frontend (JavaScript/React)

```javascript
const response = await fetch('http://localhost:3000/api/upload/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileName: 'meu_arquivo.csv'
  })
});

const data = await response.json();
console.log(data.uploadUrl);
```

### Outro Serviço Node.js

```javascript
import fetch from 'node-fetch';

async function createUpload(token, fileName) {
  const response = await fetch('http://localhost:3000/api/upload/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fileName })
  });
  
  return await response.json();
}
```

## 📦 Estrutura do Projeto

```
relatoria-backend/
├── api/
│   └── upload/
│       └── create.js      # Lógica de criação de upload
├── .env                   # Variáveis de ambiente
├── server.js              # Servidor Express
├── package.json           # Dependências e scripts
└── README.md              # Este arquivo
```

## 🔒 Autenticação

Todos os endpoints (exceto o health check) requerem autenticação via Bearer token no header `Authorization`.