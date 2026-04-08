// =============================================================================
// EDGE FUNCTION: delete-domain
// =============================================================================
// Deleta dominio do banco E do Cloudflare for SaaS (custom hostname).
// Se a deletacao na CF falhar (ex: hostname ja nao existe la), NAO bloqueia
// a deletacao no banco — o importante e limpar o banco e liberar o slot do plano.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    // ── Parse input ──
    const { domain_id } = await req.json();
    if (!domain_id) return json(400, { error: "domain_id required" });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Fetch domain and verify ownership ──
    const { data: domain, error: fetchError } = await adminClient
      .from("domains")
      .select("id, url, user_id, cloudflare_hostname_id")
      .eq("id", domain_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error("[delete-domain] Fetch error:", fetchError);
      return json(500, { error: "Database error" });
    }

    if (!domain) {
      return json(404, { error: "Domain not found or access denied" });
    }

    // ── Delete from Cloudflare (best-effort, non-blocking) ──
    let cfDeleted = false;
    let cfWarning: string | null = null;

    if (domain.cloudflare_hostname_id) {
      const cfZoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
      const cfEmail = Deno.env.get("CLOUDFLARE_EMAIL");

      if (cfZoneId && cfToken && cfEmail) {
        try {
          const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/custom_hostnames/${domain.cloudflare_hostname_id}`,
            {
              method: "DELETE",
              headers: {
                "X-Auth-Key": cfToken,
                "X-Auth-Email": cfEmail,
                "Content-Type": "application/json",
              },
            }
          );
          const cfData = await cfResponse.json();
          if (cfData.success) {
            cfDeleted = true;
            console.log(`[delete-domain] CF hostname deleted: ${domain.cloudflare_hostname_id}`);
          } else {
            cfWarning = cfData.errors?.[0]?.message || "CF delete returned non-success";
            console.warn(`[delete-domain] CF delete warning: ${cfWarning}`);
          }
        } catch (err) {
          cfWarning = err instanceof Error ? err.message : "CF API unreachable";
          console.error("[delete-domain] CF delete failed:", err);
        }
      } else {
        cfWarning = "Cloudflare secrets not configured";
      }
    }

    // ── Delete from database (always proceed, even if CF failed) ──
    const { error: deleteError } = await adminClient
      .from("domains")
      .delete()
      .eq("id", domain_id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[delete-domain] DB delete failed:", deleteError);
      return json(500, { error: "Failed to delete from database" });
    }

    return json(200, {
      success: true,
      url: domain.url,
      cf_deleted: cfDeleted,
      cf_warning: cfWarning,
    });
  } catch (err) {
    console.error("[delete-domain] Unexpected error:", err);
    return json(500, { error: "Internal error" });
  }
});
