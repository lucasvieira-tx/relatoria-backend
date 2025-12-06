/**
 * promptBuilder.ts
 *
 * Este arquivo gera os prompts PT-BR que serão enviados à IA.
 * Ele recebe:
 *  - schema
 *  - sample (até 30 linhas)
 *  - parameters do usuário
 */

export function buildMainPrompt(schema, sample, parameters, schemaSpec) {
  return `
  Você é um assistente analítico em PT-BR. 
  IMPORTANTE: Retorne APENAS JSON válido. Não escreva nada fora de JSON.
  
  Contexto:
  - Schema das colunas: ${JSON.stringify(schema)}
  - Amostra (máx 30 linhas): ${JSON.stringify(sample)}
  - Parâmetros do usuário: ${JSON.stringify(parameters)}
  
  Tarefas:
  1) Produza um "summary" (máx 150 palavras) explicando o que está acontecendo nos dados.
  2) Gere até 5 insights acionáveis em frases curtas.
  3) Sugira até 4 gráficos (bar, line, pie, scatter, table).
  4) Gere até 6 KPIs com label, value, unit.
  5) Preencha meta com rows_sampled, schema e warnings.
  
  Regras essenciais:
  - Retorne somente JSON no formato abaixo.
  - Nunca escreva texto solto fora do JSON.
  - Se alguma coluna tiver PII, substitua por "<PII_DETECTED>" e adicione aviso em warnings.
  
  // Schema de saída esperado:
  ${schemaSpec}
  `;
}

export function buildFallbackPrompt(schema, sample) {
  return `
  Você é um assistente analítico em PT-BR. 
  Retorne APENAS o JSON abaixo, nada mais.
  
  Contexto:
  - Schema: ${JSON.stringify(schema)}
  - Sample: ${JSON.stringify(sample)}
  
  JSON esperado:
  {
    "summary": "string curta (máx 60 palavras)",
    "meta": {
      "rows_sampled": ${sample.length},
      "warnings": []
    }
  }
  
  Tarefa:
  - Produza summary curto com até 2 insights rápidos.
  - Não escreva nada fora do JSON.
  `;
}

// TODO: Implementar prompt com business niche
export function buildPromptWithBusinessNiche(
  businessInfo,
  schema,
  sample,
  parameters,
  schemaSpec
) {
// 1. Pré-processamento das variáveis para texto legível
const userGoals = [
  ...(businessInfo.goal?.selected || []), 
  businessInfo.goal?.other
].filter(Boolean).join(', '); // Ex: "Aumentar faturamento, Reduzir custos"

const userPriorities = (businessInfo.info_priority || []).join(', '); // Ex: "crescimento, produtos"

const formatPreference = businessInfo.best_data_format_to_view === 'graficos' 
  ? "Priorize visualizações gráficas (bar, line, pie, scatter). Evite tabelas simples, a menos que estritamente necessário." 
  : "Equilibre entre gráficos e tabelas detalhadas.";

// 2. O Prompt Montado
return `
  Você é um Consultor de Inteligência de Negócios Sênior, especialista no nicho: ${businessInfo.niche_bussiness}.
  
  Sua missão é analisar os dados brutos e fornecer clareza estratégica para um pequeno empreendedor brasileiro.
  IMPORTANTE: Retorne APENAS JSON válido. Não escreva nada fora de JSON.
  
  --- CONTEXTO DO USUÁRIO ---
  1. Nicho: ${businessInfo.niche_bussiness} (Adapte a linguagem e termos para este mercado).
  2. Objetivos do Usuário: ${userGoals || 'Análise geral de performance'}.
  3. Prioridade de Análise: ${userPriorities || 'Visão geral'}.
  4. Preferência Visual: ${businessInfo.best_data_format_to_view}.
  
  --- DADOS TÉCNICOS ---
  - Schema das colunas: ${JSON.stringify(schema)}
  - Amostra de dados (máx 30 linhas): ${JSON.stringify(sample)}
  
  --- TAREFAS DE ANÁLISE ---
  
  1) SUMMARY (Resumo Executivo):
     - Escreva um parágrafo (máx 150 palavras) em linguagem natural e direta.
     - Foque nos objetivos (${userGoals}) e nas prioridades (${userPriorities}).
     - Diga o "o quê", "por que" e "o que fazer".
  
  2) INSIGHTS (Dicas Acionáveis):
     - Gere até 5 insights curtos e práticos.
     - Conecte os insights diretamente ao nicho "${businessInfo.niche_bussiness}".
     - Exemplo ruim: "As vendas subiram". 
     - Exemplo bom (para estética): "O tratamento de Botox aumentou 20%, sugerindo alta demanda para procedimentos faciais neste mês".
  
  3) KPIS (Indicadores Chave):
     - Selecione até 6 métricas numéricas cruciais baseadas na prioridade: ${userPriorities}.
     - Defina labels amigáveis (Ex: "Faturamento Total" em vez de "sum_price").
  
  4) CHARTS (Sugestão Visual):
     - Sugira até 4 visualizações.
     - ${formatPreference}
     - Escolha o tipo de gráfico que melhor conta a história daquele dado (Ex: Linha para tempo, Pizza para distribuição).
  
  --- REGRAS DE SEGURANÇA E FORMATO ---
  - Retorne estritamente o JSON preenchendo o schema abaixo.
  - Se encontrar PII (CPF, RG, Email pessoal), ignore a coluna ou mascare o valor.
  - Se os dados estiverem vazios ou insuficientes, preencha o campo "warnings" explicando o motivo amigavelmente.
  
  // Schema de saída esperado:
  ${schemaSpec}
`;
}
