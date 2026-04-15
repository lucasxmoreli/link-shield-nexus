// =============================================================================
// EDGE FUNCTION: delete-my-account
// =============================================================================
// Sprint Perfil Bloco B — soft-delete com grace period de 30 dias.
//
// Fluxo:
//   1. Valida JWT do user (precisa estar logado)
//   2. Valida texto de confirmação literal "DELETAR MINHA CONTA"
//   3. Busca profile + stripe_customer_id + stripe_subscription_id
//   4. Se tem subscription Stripe ativa: cancela imediatamente (prorate: false)
//   5. UPDATE profile: is_deleted=true, deleted_at=now(), is_suspended=true
//   6. Log de auditoria em admin_audit_log
//   7. signOut global (invalida todas as sessões do user)
//   8. Retorna sucesso
//
// IMPORTANTE: idempotente — se chamar 2x, não quebra (já deletado retorna 200).
// =============================================================================

// @deno-types="https://esm.sh/@supabase/supabase-js@2.45.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const CONFIRMATION_TEXT = "DELETAR MINHA CONTA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeleteRequest {
  confirmation: string;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_deleted: boolean;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // PASSO 1: Validar JWT do user
    // ─────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization" }, 401);
    }

    const userToken = authHeader.replace("Bearer ", "");

    // Cliente com JWT do user pra validar identidade
    const supabaseUserClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(userToken);

    if (userError || !user) {
      console.error("[delete-account] Invalid user token:", userError);
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 2: Validar texto de confirmação
    // ─────────────────────────────────────────────────────────────
    let body: DeleteRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (body.confirmation !== CONFIRMATION_TEXT) {
      return jsonResponse({
        error: `Confirmation text must be exactly: "${CONFIRMATION_TEXT}"`,
      }, 400);
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 3: Buscar profile (usando service_role pra bypassar RLS)
    // ─────────────────────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, stripe_customer_id, stripe_subscription_id, is_deleted")
      .eq("user_id", user.id)
      .single<ProfileRow>();

    if (profileError || !profile) {
      console.error("[delete-account] Profile not found:", profileError);
      return jsonResponse({ error: "Profile not found" }, 404);
    }

    // Idempotência: se já deletado, retorna sucesso
    if (profile.is_deleted) {
      console.log(`[delete-account] Already deleted, idempotent: ${user.id}`);
      return jsonResponse({
        success: true,
        message: "Account already deleted",
        already_deleted: true,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 4: Cancelar Stripe subscription (se existir)
    // ─────────────────────────────────────────────────────────────
    let stripeCanceledSubscription: string | null = null;
    let stripeCancelError: string | null = null;

    if (profile.stripe_subscription_id) {
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
          apiVersion: "2023-10-16",
          httpClient: Stripe.createFetchHttpClient(),
        });

        // prorate: false = cancela imediato sem reembolso
        const canceled = await stripe.subscriptions.cancel(
          profile.stripe_subscription_id,
          { prorate: false }
        );

        stripeCanceledSubscription = canceled.id;
        console.log(`[delete-account] Stripe subscription canceled: ${canceled.id}`);
      } catch (err: any) {
        // Não falha o delete se Stripe der erro — registra e continua
        stripeCancelError = err?.message || "Unknown Stripe error";
        console.error(`[delete-account] Stripe cancel failed (continuing anyway):`, err);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 5: Soft-delete no profile (via service_role pra bypassar trigger)
    // ─────────────────────────────────────────────────────────────
    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        is_deleted: true,
        deleted_at: now,
        is_suspended: true, // bloqueia motor cloaking imediatamente
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[delete-account] Profile update failed:", updateError);
      return jsonResponse({
        error: "Failed to mark account as deleted",
        details: updateError.message,
      }, 500);
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 6: Log de auditoria (best-effort) — schema admin_audit_log
    // ─────────────────────────────────────────────────────────────
    try {
      const sourceIp = req.headers.get("CF-Connecting-IP") 
        || req.headers.get("X-Real-IP") 
        || null;
      
      await supabaseAdmin.from("admin_audit_log").insert({
        admin_user_id: user.id,           // user deletando ele mesmo
        admin_email: profile.email,
        action: "self_delete_account",
        target_table: "profiles",
        target_id: user.id,                // uuid como string
        payload: {
          stripe_customer_id: profile.stripe_customer_id,
          stripe_canceled_subscription: stripeCanceledSubscription,
          stripe_cancel_error: stripeCancelError,
          deleted_at: now,
          is_self_action: true,
        },
        source_ip: sourceIp,               // já é tipo inet, supabase converte
        user_agent: req.headers.get("User-Agent"),
      });
    } catch (err) {
      console.error("[delete-account] Audit log failed (non-critical):", err);
    }
    
    // ─────────────────────────────────────────────────────────────
    // PASSO 7: signOut global (invalida todas as sessões do user)
    // ─────────────────────────────────────────────────────────────
    try {
      await supabaseAdmin.auth.admin.signOut(user.id, "global");
      console.log(`[delete-account] Global signout completed: ${user.id}`);
    } catch (err) {
      // Não falha se signOut der erro — RLS já vai bloquear
      console.error("[delete-account] Global signout failed (RLS will catch):", err);
    }

    // ─────────────────────────────────────────────────────────────
    // PASSO 8: Sucesso
    // ─────────────────────────────────────────────────────────────
    console.log(`[delete-account] ✅ Soft-delete completed for user ${user.id} (${profile.email})`);

    return jsonResponse({
      success: true,
      message: "Account scheduled for deletion. Will be permanently removed in 30 days.",
      deleted_at: now,
      stripe_canceled: !!stripeCanceledSubscription,
      stripe_cancel_error: stripeCancelError,
    });

  } catch (err: any) {
    console.error("[delete-account] Unexpected error:", err);
    return jsonResponse({
      error: "Internal server error",
      details: err?.message || "Unknown",
    }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}