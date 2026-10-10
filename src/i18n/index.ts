import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en";
import pt from "./locales/pt";
import es from "./locales/es";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      pt: { translation: pt },
      es: { translation: es },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "pt", "es"],
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

const DOCUMENT_META: Record<string, { lang: string; title: string }> = {
  pt: { lang: "pt-BR", title: "CloakerX | Proteção de Tráfego de Alta Performance" },
  en: { lang: "en", title: "CloakerX | High-Performance Traffic Protection" },
  es: { lang: "es", title: "CloakerX | Protección de Tráfico de Alto Rendimiento" },
};

function syncDocumentMeta() {
  const meta = DOCUMENT_META[i18n.resolvedLanguage ?? "en"] ?? DOCUMENT_META.en;
  document.documentElement.lang = meta.lang;
  document.title = meta.title;
}

syncDocumentMeta();
i18n.on("languageChanged", syncDocumentMeta);

export default i18n;
