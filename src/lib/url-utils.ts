/**
 * URL Utilities — funções puras para normalização e validação de URLs.
 * Extraídas do CampaignEdit para reutilização em qualquer formulário.
 */

/** Remove espaços e barras iniciais */
export const normalizeUrlInput = (url: string): string =>
  url.trim().replace(/^\/+/, "");

/** Garante que a URL tem protocolo http(s):// */
export const ensureAbsoluteUrl = (url: string): string => {
  const cleaned = normalizeUrlInput(url);
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
};

/** Valida se a URL é absoluta e tem hostname válido */
export const isValidAbsoluteUrl = (url: string): boolean => {
  const normalized = ensureAbsoluteUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return /^https?:$/i.test(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

/** Cria um handler de onBlur que normaliza a URL via setter */
export const createUrlNormalizer = (setter: (value: string) => void) =>
  (value: string) => { setter(ensureAbsoluteUrl(value)); };

/** Verifica se alguma URL de destino conflita com o domínio da campanha */
export const checkDomainConflict = (
  domain: string,
  urls: string[]
): boolean => {
  const selectedDomain = domain
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .replace(/\/+$/, "");

  return urls.some((u) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      return host === selectedDomain || host.endsWith(`.${selectedDomain}`);
    } catch {
      return false;
    }
  });
};
