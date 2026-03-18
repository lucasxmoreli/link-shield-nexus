import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function CampaignRedirect() {
  const { hash } = useParams<{ hash: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hash) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!backendUrl) {
        throw new Error("Missing backend URL");
      }

      const redirectUrl = new URL(`${backendUrl}/functions/v1/filter`);
      redirectUrl.searchParams.set("campaign_hash", hash);

      const visitorParams = new URLSearchParams(window.location.search);
      visitorParams.forEach((value, key) => {
        redirectUrl.searchParams.append(key, value);
      });

      window.location.replace(redirectUrl.toString());
    } catch {
      setError(true);
      setTimeout(() => navigate("/", { replace: true }), 2000);
    }
  }, [hash, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      {error ? (
        <>
          <p className="font-medium text-destructive">Campaign not found or inactive.</p>
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
