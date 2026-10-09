import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import { useIsMobile } from "@/hooks/use-mobile";

declare global {
  interface Window {
    $crisp: unknown[];
    CRISP_WEBSITE_ID: string;
  }
}

const CRISP_WEBSITE_ID = "aeb5656c-acac-4770-8da2-60ce101dc724";

// On small screens the launcher sits on top of the form's save bar.
const FORM_ROUTE = /^\/campaigns\/(new|[^/]+\/(edit|clone))\/?$/;

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

  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const hideLauncher = isMobile && FORM_ROUTE.test(pathname);

  useEffect(() => {
    if (!window.$crisp) return;
    window.$crisp.push(["do", hideLauncher ? "chat:hide" : "chat:show"]);
  }, [hideLauncher]);

  return null;
}
