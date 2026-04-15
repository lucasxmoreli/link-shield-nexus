// =============================================================================
// EDGE FUNCTION: cleanup-deleted-accounts
// =============================================================================
// Sprint Perfil Bloco B — Cron diário que faz hard-delete de contas
// soft-deleted há mais de 30 dias.
//
// Trigger: pg_cron diariamente às 03:00 UTC
// Auth: Bearer token CRON_SECRET (mesmo padrão sync-usage-stripe)
//
// Fluxo:
//   1. Valida CRON_SECRET
//   2. Busca profiles com is_deleted=true E deleted_at < now() - 30 days
//   3. Pra cada profile:
//      - auth.admin.deleteUser() — cascade limpa profile (se FK ON DELETE CASCADE)
//      - Log no console
//   4. Retorna {deleted: N, errors: [...]}
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GRACE_PERIOD_DAYS = 30;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Auth via CRON_SECRET
  // ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const expectedSecret = `Bearer ${Deno.env.get("CRON_SECRET")}`;

  if (authHeader !== expectedSecret) {
    console.error("[cleanup] Unauthorized cron call");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // ─────────────────────────────────────────────────────────────
    // Buscar profiles deletados há mais de GRACE_PERIOD_DAYS dias
    // ─────────────────────────────────────────────────────────────
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - GRACE_PERIOD_DAYS);

    const { data: toDelete, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, deleted_at")
      .eq("is_deleted", true)
      .lt("deleted_at", cutoffDate.toISOString());

    if (fetchError) {
      console.error("[cleanup] Fetch failed:", fetchError);
      return new Response(JSON.stringify({ 
        error: "Fetch failed", 
        details: fetchError.message 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!toDelete || toDelete.length === 0) {
      console.log("[cleanup] No accounts to delete");
      return new Response(JSON.stringify({ 
        deleted: 0, 
        message: "No accounts past grace period" 
      }), { 
        headers: { "Content-Type": "application/json" }
      });
    }

    console.log(`[cleanup] Found ${toDelete.length} accounts to hard-delete`);

    // ─────────────────────────────────────────────────────────────
    // Hard-delete um por um (paralelizar é arriscado se algo der errado)
    // ─────────────────────────────────────────────────────────────
    const results = {
      deleted: 0,
      errors: [] as Array<{ user_id: string; error: string }>,
    };

    for (const profile of toDelete) {
      try {
        // Audit log antes de deletar (pra ter histórico)
        await supabaseAdmin.from("admin_audit_log").insert({
          actor_user_id: null, // sistema/cron
          action: "hard_delete_account_grace_expired",
          target_user_id: profile.user_id,
          details: {
            email: profile.email,
            deleted_at: profile.deleted_at,
            hard_deleted_at: new Date().toISOString(),
            grace_period_days: GRACE_PERIOD_DAYS,
          },
        });

        // auth.admin.deleteUser cascateia pra profiles SE FK tiver ON DELETE CASCADE
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
          profile.user_id
        );

        if (deleteError) {
          console.error(`[cleanup] Failed to delete ${profile.user_id}:`, deleteError);
          results.errors.push({
            user_id: profile.user_id,
            error: deleteError.message,
          });
          continue;
        }

        // Fallback: se FK não tem CASCADE, deleta profile manualmente
        // (não vai dar erro se já foi cascateado, vai retornar 0 rows)
        await supabaseAdmin
          .from("profiles")
          .delete()
          .eq("user_id", profile.user_id);

        console.log(`[cleanup] ✅ Hard-deleted: ${profile.user_id} (${profile.email})`);
        results.deleted++;

      } catch (err: any) {
        console.error(`[cleanup] Exception deleting ${profile.user_id}:`, err);
        results.errors.push({
          user_id: profile.user_id,
          error: err?.message || "Unknown error",
        });
      }
    }

    console.log(`[cleanup] Done. Deleted: ${results.deleted}, Errors: ${results.errors.length}`);

    return new Response(JSON.stringify({
      success: true,
      ...results,
      total_processed: toDelete.length,
    }), { 
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("[cleanup] Unexpected error:", err);
    return new Response(JSON.stringify({ 
      error: "Internal error", 
      details: err?.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});