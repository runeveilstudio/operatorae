/** Strict SRT parser (docs/03 §5 captions seed: idempotent re-sync lands Phase 3). */

export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SrtResult {
  ok: boolean;
  cues: SrtCue[];
  errors: string[];
}

const TIME = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;

function toMs(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000 + Number(ms);
}

export function parseSrt(text: string): SrtResult {
  const cues: SrtCue[] = [];
  const errors: string[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const blocks = normalized.split(/\n{2,}/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed === "") continue;
    const lines = trimmed.split("\n");
    let cursor = 0;
    let index = 0;
    if (/^\d+$/.test(lines[0])) {
      index = Number(lines[0]);
      cursor = 1;
    }
    const timeMatch = lines[cursor]?.match(TIME);
    if (!timeMatch) {
      errors.push(`Block ${cues.length + 1}: missing or malformed timestamp line`);
      continue;
    }
    const startMs = toMs(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const endMs = toMs(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
    if (endMs <= startMs) {
      errors.push(`Block ${cues.length + 1}: end time must be after start`);
      continue;
    }
    const text2 = lines.slice(cursor + 1).join("\n");
    if (text2.trim() === "") {
      errors.push(`Block ${cues.length + 1}: empty cue text`);
      continue;
    }
    cues.push({ index, startMs, endMs, text: text2 });
  }
  return { ok: errors.length === 0, cues, errors };
}
