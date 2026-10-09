import { enUS, es, ptBR, type Locale } from "date-fns/locale";

export function intlLocale(lang: string | undefined): string {
  if (lang?.startsWith("en")) return "en-US";
  if (lang?.startsWith("es")) return "es-ES";
  return "pt-BR";
}

export function dateFnsLocale(lang: string | undefined): Locale {
  if (lang?.startsWith("en")) return enUS;
  if (lang?.startsWith("es")) return es;
  return ptBR;
}

const regionNamesCache = new Map<string, Intl.DisplayNames | null>();

export function regionName(code: string | null | undefined, lang: string | undefined): string {
  if (!code) return "—";
  const upper = code.toUpperCase();
  const locale = intlLocale(lang);
  if (!regionNamesCache.has(locale)) {
    try {
      regionNamesCache.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    } catch {
      regionNamesCache.set(locale, null);
    }
  }
  try {
    return regionNamesCache.get(locale)?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}
