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
        // Call the filter edge function — IP is extracted server-side from headers
        // Pass URL query params so the filter can check fbclid, gclid, etc.
        const urlParams = Object.fromEntries(new URLSearchParams(window.location.search));
        const { data, error: fnError } = await supabase.functions.invoke("filter", {
          body: {
            campaign_hash: hash,
            user_agent: navigator.userAgent,
            referer: document.referrer || null,
            query_params: urlParams,
          },
        });

        if (fnError || !data?.url) {
          setError(true);
          setTimeout(() => navigate("/", { replace: true }), 2000);
          return;
        }

        // FIX: Ensure URL format is correct for redirection
        let finalUrl = data.url;
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
          finalUrl = "https://" + finalUrl;
        }

        // Redirect to the destination decided by the cloaking engine
        window.location.replace(finalUrl);
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
          <p className="text-destructive font-medium">Campaign not found or inactive.</p>
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </>
      )}
    </div>
  );
}
