/** RFC-4180-ish CSV (docs/03 §9 seed: shared by panel + sidecar, host-agnostic). */

export interface CsvResult {
  ok: boolean;
  rows: string[][];
  errors: string[];
}

export function parseCsv(text: string): CsvResult {
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (inQuotes) errors.push("Unterminated quoted field at end of input");
  return { ok: errors.length === 0, rows, errors };
}

export interface CsvObjectsResult {
  ok: boolean;
  headers: string[];
  objects: Record<string, string>[];
  errors: string[];
}

export function parseCsvObjects(text: string, opts?: { trimHeaders?: boolean }): CsvObjectsResult {
  const base = parseCsv(text);
  if (!base.ok) return { ok: false, headers: [], objects: [], errors: base.errors };
  if (base.rows.length === 0) return { ok: true, headers: [], objects: [], errors: [] };
  const headers = base.rows[0].map((h) => (opts?.trimHeaders ? h.trim() : h));
  const objects: Record<string, string>[] = [];
  for (let r = 1; r < base.rows.length; r++) {
    const row = base.rows[r];
    if (row.length !== headers.length) {
      return {
        ok: false,
        headers,
        objects,
        errors: [`Row ${r + 1} has ${row.length} fields, expected ${headers.length}`]
      };
    }
    const obj: Record<string, string> = {};
    for (let cIdx = 0; cIdx < headers.length; cIdx++) obj[headers[cIdx]] = row[cIdx];
    objects.push(obj);
  }
  return { ok: true, headers, objects, errors: [] };
}
