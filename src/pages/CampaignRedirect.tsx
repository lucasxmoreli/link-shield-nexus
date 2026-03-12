import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function CampaignRedirect() {
  const { hash } = useParams<{ hash: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hash) {
      navigate("/", { replace: true });
      return;
    }

    const resolve = async () => {
      try {
        // Get real visitor IP via public API
        let visitorIP = "0.0.0.0";
        try {
          const ipRes = await fetch("https://api.ipify.org?format=json", {
            signal: AbortSignal.timeout(3000),
          });
          const ipData = await ipRes.json();
          visitorIP = ipData.ip;
        } catch {
          // fallback IP if service is down
        }

        const visitorUA = navigator.userAgent;

        // Call the same filter edge function used by Cloak Test
        const { data, error: fnError } = await supabase.functions.invoke("filter", {
          body: {
            campaign_hash: hash,
            ip: visitorIP,
            user_agent: visitorUA,
            referer: document.referrer || null,
          },
        });

        if (fnError || !data?.url) {
          setError(true);
          setTimeout(() => navigate("/", { replace: true }), 2000);
          return;
        }

        // Redirect to the destination decided by the cloaking engine
        window.location.replace(data.url);
      } catch {
        setError(true);
        setTimeout(() => navigate("/", { replace: true }), 2000);
      }
    };

    resolve();
  }, [hash, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
      {error ? (
        <>
          <p className="text-destructive font-medium">Campanha não encontrada ou inativa.</p>
          <p className="text-sm text-muted-foreground">Redirecionando...</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Redirecionando...</p>
        </>
      )}
    </div>
  );
}
