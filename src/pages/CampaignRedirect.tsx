import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function CampaignRedirect() {
  const { hash } = useParams<{ hash: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hash) {
      navigate("/", { replace: true });
      return;
    }

    const resolve = async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("offer_url, safe_url, is_active")
        .eq("hash", hash)
        .maybeSingle();

      if (error || !data || !data.is_active) {
        navigate("/", { replace: true });
        return;
      }

      // Default: redirect to offer page; safe_url is fallback
      const destination = data.offer_url || data.safe_url;
      if (destination) {
        window.location.replace(destination);
      } else {
        navigate("/", { replace: true });
      }
    };

    resolve();
  }, [hash, navigate]);

  return null;
}
