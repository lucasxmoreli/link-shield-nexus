import { useEffect } from "react";
import { useProfile } from "@/hooks/useProfile";

declare global {
  interface Window {
    $crisp: unknown[];
    CRISP_WEBSITE_ID: string;
  }
}

const CRISP_WEBSITE_ID = "aeb5656c-acac-4770-8da2-60ce101dc724";

export function CrispChat() {
  useEffect(() => {
    if (window.$crisp) return;
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
    const s = document.createElement("script");
    s.src = "https://client.crisp.chat/l.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  const { profile } = useProfile();

  useEffect(() => {
    if (!profile?.email || !window.$crisp) return;
    window.$crisp.push(["set", "user:email", [profile.email]]);
  }, [profile?.email]);

  return null;
}
