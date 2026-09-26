/**
 * Palette scorer — deliberately tiny for Phase 0 (docs/02 §2.2 promises a
 * prebuilt token index + streaming scorer at scale; this is the seed).
 * Ordering properties are pinned by tests: exact > word-start > subsequence.
 */
const SEPARATORS = /[\s._\-/:]/;

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0 || t.length === 0) return 0;

  let score = 0;
  const direct = t.indexOf(q);
  if (direct === 0) score += 10;
  else if (direct > 0) score += 5;

  let cursor = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, cursor);
    if (found === -1) return 0;
    if (found === 0 || SEPARATORS.test(t[found - 1])) score += 2;
    else if (found === cursor && streak > 0) score += 1.5;
    streak = found === cursor ? streak + 1 : 1;
    cursor = found + 1;
  }
  score -= t.length * 0.01;
  return Math.max(score, 0.001);
}
