// Row -> API JSON. NUMERIC columns (pg type 1700) arrive as exact decimal text
// and leave as JSON numbers: Number() of a <=2 (or 3) dp decimal string is the
// nearest double, which prints back to the same text. No arithmetic happens here.
const NUMERIC = 1700;
const HIDDEN = new Set(['auth_user_id']);

export function serializeRows(rows, fields) {
  const numeric = new Set(fields.filter((f) => f.dataTypeID === NUMERIC).map((f) => f.name));
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (HIDDEN.has(k)) continue;
      if (v instanceof Date) out[k] = v.toISOString();
      else if (v !== null && numeric.has(k)) out[k] = Number(v);
      else out[k] = v;
    }
    return out;
  });
}

export const serializeResult = (result) => serializeRows(result.rows, result.fields);
export const serializeOne = (result) => serializeResult(result)[0] ?? null;
