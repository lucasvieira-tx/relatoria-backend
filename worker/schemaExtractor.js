// worker/schemaExtractor.js
import Papa from "papaparse";
import ExcelJS from "exceljs";

function detectType(values) {
    const nonNull = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
    if (nonNull.length === 0) return "null";
    const sample = nonNull.slice(0, 50).map(String);

    // number?
    const numCount = sample.filter(s => !isNaN(Number(s.replace(",", ".")))).length;
    if (numCount / sample.length > 0.7) return "number";

    // date? quick check
    const dateCount = sample.filter(s => !isNaN(Date.parse(s))).length;
    if (dateCount / sample.length > 0.6) return "date";

    // email
    const emailCount = sample.filter(s => /.+@.+\..+/.test(s)).length;
    if (emailCount / sample.length > 0.6) return "email";

    // url
    const urlCount = sample.filter(s => /^https?:\/\//i.test(s)).length;
    if (urlCount / sample.length > 0.6) return "url";

    // phone
    const phoneCount = sample.filter(s => /[0-9\-\(\)\+ x]{7,}/.test(s)).length;
    if (phoneCount / sample.length > 0.6) return "phone";

    return "string";
}

export async function extractFromCSV(buffer, options = {}) {
    const text = buffer.toString("utf8");
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data;
    if (!rows || rows.length === 0) return { columns: [], sample: [], row_count: 0 };

    const headers = Object.keys(rows[0]);
    const inspectRows = rows.slice(0, Math.min(rows.length, options.maxInspect || 2000));

    const columns = headers.map(header => {
        const colValues = inspectRows.map(r => r[header]);
        const nonNull = colValues.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
        const unique = Array.from(new Set(nonNull.map(v => String(v))));
        const type = detectType(nonNull);
        const subtype = type === "number" ? (nonNull.every(v => Number.isInteger(Number(String(v).replace(",", ".")))) ? "integer" : "decimal") : (type === "date" ? "yyyy-mm-dd" : null);

        return {
            name: header,
            type,
            subtype,
            null_ratio: Number((1 - nonNull.length / colValues.length).toFixed(3)),
            unique_count: unique.length,
            cardinality: unique.length <= 20 ? "low" : (unique.length <= 200 ? "medium" : "high"),
            sample_values: unique.slice(0, 10)
        };
    });

    const sample = rows.slice(0, options.sampleRows || 30);

    return { columns, sample, row_count: rows.length };
}

export async function extractFromXLSX(buffer, options = {}) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0]; // primeira aba
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        rows.push(row.values.slice(1)); // row.values é 1-indexed
    });
    if (rows.length < 1) return { columns: [], sample: [], row_count: 0 };
    const headers = rows[0].map(h => String(h).trim());
    const dataRows = rows.slice(1).map(r => {
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? null;
        return obj;
    });

    // reutiliza a função CSV para análise usando o próprio import ES Module
    const csvText = Papa.unparse(dataRows);
    const fakeBuffer = Buffer.from(csvText);
    return extractFromCSV(fakeBuffer, options);
}
