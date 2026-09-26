/**
 * ES3-safe JSON (docs/02 §2.3: one JSON bridge, polyfilled in ExtendScript).
 * stringify mirrors JSON.stringify for the value shapes we cross the wire
 * with; parse is a strict recursive-descent parser — no eval, ever
 * (docs/02 §5).
 */

export function stringify(value: unknown): string {
  return encode(value);
}

export function parse(text: string): unknown {
  let i = 0;
  const src = text;
  function fail(message: string): never {
    throw new Error("JSON parse error at " + i + ": " + message);
  }
  function skipWs(): void {
    while (i < src.length) {
      const c = src.charAt(i);
      if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
      else break;
    }
  }
  function readString(): string {
    // caller consumed the opening quote
    let out = "";
    while (i < src.length) {
      const c = src.charAt(i);
      i++;
      if (c === '"') return out;
      if (c === "\\") {
        const e = src.charAt(i);
        i++;
        if (e === '"') out += '"';
        else if (e === "\\") out += "\\";
        else if (e === "/") out += "/";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "u") {
          if (i + 4 > src.length) fail("truncated unicode escape");
          const hex = src.substr(i, 4);
          i += 4;
          const code = parseInt(hex, 16);
          if (isNaN(code)) fail("bad unicode escape \\u" + hex);
          out += String.fromCharCode(code);
        } else fail("bad escape \\" + e);
      } else if (c.charCodeAt(0) < 32) {
        fail("unescaped control character");
      } else {
        out += c;
      }
    }
    fail("unterminated string");
  }
  function readNumber(): number {
    const start = i;
    if (src.charAt(i) === "-") i++;
    while (i < src.length) {
      const c = src.charAt(i);
      if (
        (c >= "0" && c <= "9") ||
        c === "." ||
        c === "e" ||
        c === "E" ||
        c === "+" ||
        c === "-"
      ) {
        i++;
      } else break;
    }
    const raw = src.substring(start, i);
    const n = Number(raw);
    if (raw === "" || isNaN(n)) fail("bad number '" + raw + "'");
    return n;
  }
  function expect(word: string): void {
    if (src.substr(i, word.length) !== word) fail("expected '" + word + "'");
    i += word.length;
  }
  function readValue(): unknown {
    skipWs();
    const c = src.charAt(i);
    if (c === "{") {
      i++;
      skipWs();
      const obj: Record<string, unknown> = {};
      if (src.charAt(i) === "}") {
        i++;
        return obj;
      }
      while (true) {
        skipWs();
        if (src.charAt(i) !== '"') fail("expected object key");
        i++;
        const key = readString();
        skipWs();
        if (src.charAt(i) !== ":") fail("expected ':'");
        i++;
        obj[key] = readValue();
        skipWs();
        const d = src.charAt(i);
        if (d === ",") {
          i++;
          continue;
        }
        if (d === "}") {
          i++;
          return obj;
        }
        fail("expected ',' or '}'");
      }
    }
    if (c === "[") {
      i++;
      skipWs();
      const arr: unknown[] = [];
      if (src.charAt(i) === "]") {
        i++;
        return arr;
      }
      while (true) {
        arr.push(readValue());
        skipWs();
        const d = src.charAt(i);
        if (d === ",") {
          i++;
          continue;
        }
        if (d === "]") {
          i++;
          return arr;
        }
        fail("expected ',' or ']'");
      }
    }
    if (c === '"') {
      i++;
      return readString();
    }
    if (c === "t") {
      expect("true");
      return true;
    }
    if (c === "f") {
      expect("false");
      return false;
    }
    if (c === "n") {
      expect("null");
      return null;
    }
    if (c === "-" || (c >= "0" && c <= "9")) return readNumber();
    fail("unexpected character '" + c + "'");
  }
  const value = readValue();
  skipWs();
  if (i !== src.length) fail("trailing characters");
  return value;
}

function encode(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "undefined") return "null";
  if (t === "number") return isFinite(value as number) ? String(value) : "null";
  if (t === "boolean") return value === true ? "true" : "false";
  if (t === "string") return quote(value as string);
  if (t === "object") {
    if (value instanceof Array) {
      let out = "[";
      for (let idx = 0; idx < value.length; idx++) {
        if (idx > 0) out += ",";
        const item = value[idx];
        const itemType = typeof item;
        out += itemType === "undefined" || itemType === "function" ? "null" : encode(item);
      }
      return out + "]";
    }
    const obj = value as Record<string, unknown>;
    let out = "{";
    let first = true;
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const v = obj[key];
      const vt = typeof v;
      if (vt === "undefined" || vt === "function") continue;
      if (!first) out += ",";
      out += quote(key) + ":" + encode(v);
      first = false;
    }
    return out + "}";
  }
  return "null";
}

function quote(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === '"') out += '\\"';
    else if (c === "\\") out += "\\\\";
    else if (c === "\b") out += "\\b";
    else if (c === "\f") out += "\\f";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (c === "\t") out += "\\t";
    else {
      const code = s.charCodeAt(i);
      if (code < 32) {
        let hex = code.toString(16);
        if (hex.length < 2) hex = "0" + hex;
        out += "\\u00" + hex;
      } else {
        out += c;
      }
    }
  }
  return out + '"';
}
