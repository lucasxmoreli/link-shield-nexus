import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function CampaignRedirect() {
  const { hash } = useParams<{ hash: string }>();
  const [status, setStatus] = useState<"loading" | "not_found">("loading");

  useEffect(() => {
    if (!hash) {
      setStatus("not_found");
      return;
    }

    const resolve = async () => {
      try {
        const { data: rawData, error } = await supabase.rpc("get_campaign_redirect", {
          p_hash: hash,
        });

        const data = rawData as { offer_url: string; safe_url: string; is_active: boolean } | null;

        if (error || !data || !data.is_active) {
          setStatus("not_found");
          return;
        }

        const destination = data.offer_url || data.safe_url;
        if (destination) {
          window.location.replace(destination);
        } else {
          setStatus("not_found");
        }
      } catch {
        setStatus("not_found");
      }
    };

    resolve();
  }, [hash]);

  if (status === "not_found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground">Campaign Not Found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This campaign link is inactive or doesn't exist. Please check the URL and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  );
}
