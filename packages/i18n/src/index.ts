/**
 * i18n seed (docs/03 §13: framework from day 1; EN at Phase 0, DE/ES/JA at GA
 * per docs/07 #11). The pseudo-loc fixture feeds the CI truncation check
 * (docs/04 §8) once the panel grows real strings.
 */
import en from "../locales/en.json";
import pseudo from "../locales/pseudo.json";

export type LocaleTable = Record<string, string>;

export const LOCALES = {
  en: en as LocaleTable,
  pseudo: pseudo as LocaleTable
} as const;

export type LocaleName = keyof typeof LOCALES;

export function createT(table: LocaleTable) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = table[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    }
    return s;
  };
}
