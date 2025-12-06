/**
 * utils.ts
 * 
 * Funções auxiliares para:
 * - parsear CSV/XLSX
 * - detectar PII
 * - amostrar 30 linhas
 * - construir schema detetado
 */

// ------------------------------
// Detectores de PII
// ------------------------------
export const REGEX_PII = {
  cpf: /\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b/,
  cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}\b/,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  phone: /\b\d{10,11}\b/,
  credit_card: /\b\d{16}\b/,
  rg: /\b\d{9}\b/
};

export function detectPII(row) {
  return Object.values(row).some((value) => {
    if (typeof value !== "string") return false;
    return (
      REGEX_PII.cpf.test(value) ||
      REGEX_PII.cnpj.test(value) ||
      REGEX_PII.email.test(value) ||
      REGEX_PII.phone.test(value) ||
      REGEX_PII.credit_card.test(value) ||
      REGEX_PII.rg.test(value)
    );
  });
}

export function replacePII(row) {
  const newRow = { ...row };
  for (const key in newRow) {
    if (typeof newRow[key] === "string") {
      if (
        REGEX_PII.cpf.test(newRow[key]) ||
        REGEX_PII.cnpj.test(newRow[key]) ||
        REGEX_PII.email.test(newRow[key]) ||
        REGEX_PII.phone.test(newRow[key]) ||
        REGEX_PII.credit_card.test(newRow[key]) ||
        REGEX_PII.rg.test(newRow[key])
      ) {
        newRow[key] = "<PII_DETECTED>";
      }
    }
  }
  return newRow;
}

