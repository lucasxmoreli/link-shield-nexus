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
        const { data, error: dbError } = await supabase
          .from("campaigns")
          .select("offer_url, safe_url, is_active")
          .eq("hash", hash)
          .maybeSingle();

        if (dbError || !data || !data.is_active) {
          setError(true);
          setTimeout(() => navigate("/", { replace: true }), 2000);
          return;
        }

        const destination = data.offer_url || data.safe_url;
        if (destination) {
          window.location.href = destination;
        } else {
          setError(true);
          setTimeout(() => navigate("/", { replace: true }), 2000);
        }
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
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </>
      )}
    </div>
  );
}
