// =============================================================================
// EDGE FUNCTION: register (v2 — atomic redemption with inverse rollback)
// =============================================================================
// Creates a new user account and redeems an invite code atomically.
//
// v2 changes (vs v1):
//   - INVERSE ORDER: createUser FIRST, then redeem code. Previously the code
//     was consumed before user creation, leaving codes orphaned if createUser
//     failed mid-flight (and the rollback was best-effort UPDATE which itself
//     could fail). Now if redeem fails, we delete the recently-created user
//     (which is more reliable than rolling back a counter increment).
//   - Pre-validation: cheap RPC call to validate_invite_code BEFORE createUser
//     to fail fast on invalid/exhausted codes without polluting auth.users.
//   - Calls new redeem_invite_code(p_code, p_user_id, p_user_email) RPC.
//   - Maps specific Postgres error codes (invite_code_exhausted, etc) to
//     user-friendly messages WITHOUT leaking which one happened (anti-enum).
//   - Structured logging with [register] prefix.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Generic client-facing error — never leaks internal state.
const GENERIC_INVITE_ERROR = "Invalid or unavailable invite code.";
const GENERIC_REGISTER_ERROR = "Unable to create account. Please try again or contact support.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Parse and validate input ──
    let body: { email?: unknown; password?: unknown; invite_code?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid request body." });
    }

    const { email, password, invite_code } = body;

    if (!email || !password || !invite_code) {
      return json(400, { error: "Email, password, and invite code are required." });
    }

    if (typeof email !== "string" || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: "Invalid email address." });
    }

    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      return json(400, { error: "Password must be between 6 and 128 characters." });
    }

    if (typeof invite_code !== "string" || invite_code.length > 50) {
      return json(400, { error: "Invalid invite code." });
    }

    const code = invite_code.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();

    // ── Initialize admin client ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── PHASE 1: Pre-validation (read-only, no side effects) ──
    // Cheap check to fail fast before creating a user that will be rolled back.
    // Doesn't prevent races (someone could exhaust the code between validate and
    // redeem), but eliminates 95% of failure modes upfront.
    const { data: isValid, error: validateError } = await adminClient
      .rpc("validate_invite_code", { p_code: code });

    if (validateError) {
      console.error("[register] validate RPC failed:", validateError.message);
      return json(500, { error: GENERIC_REGISTER_ERROR });
    }

    if (!isValid) {
      console.warn(`[register] pre-validation rejected code (truncated)=${code.slice(0, 8)}...`);
      return json(400, { error: GENERIC_INVITE_ERROR });
    }

    // ── PHASE 2: Create user (Supabase Auth) ──
    // If this fails, no rollback needed — the code was never touched.
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false,
    });

    if (createError || !userData?.user?.id) {
      // Log the real error internally for debugging, but never echo it to the
      // client. Echoing Supabase Auth error messages enables account enumeration
      // (e.g. "A user with this email address has already been registered").
      console.error("[register] createUser failed:", createError?.message ?? "no user returned");
      return json(400, { error: GENERIC_REGISTER_ERROR });
    }

    const newUserId = userData.user.id;

    // ── PHASE 3: Redeem invite code (atomic, with inverse rollback on failure) ──
    // The user already exists at this point. If redeem fails (race condition,
    // code exhausted in the gap between phases 1 and 3), we MUST delete the
    // freshly-created user to maintain consistency.
    const { error: redeemError } = await adminClient.rpc("redeem_invite_code", {
      p_code: code,
      p_user_id: newUserId,
      p_user_email: normalizedEmail,
    });

    if (redeemError) {
      // INVERSE ROLLBACK: delete the user we just created.
      console.error(
        `[register] redeem failed for user_id=${newUserId} code_prefix=${code.slice(0, 8)} pg_message=${redeemError.message}`
      );

      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(newUserId);
      if (rollbackError) {
        // CRITICAL: orphaned user in auth.users with no profile and no redemption.
        // Logged loudly so admin can clean up manually.
        console.error(
          `[register] CRITICAL: rollback failed — orphaned user_id=${newUserId} email=${normalizedEmail} rollback_error=${rollbackError.message}`
        );
      } else {
        console.log(`[register] rollback successful — user_id=${newUserId} deleted after redeem failure`);
      }

      // Generic error to client — don't reveal whether it was race condition,
      // exhausted code, or something else.
      return json(400, { error: GENERIC_INVITE_ERROR });
    }

    // ── SUCCESS ──
    console.log(`[register] success user_id=${newUserId} code_prefix=${code.slice(0, 8)}`);
    return json(200, { success: true, user_id: newUserId });
  } catch (err) {
    console.error("[register] unexpected error:", err);
    return json(500, { error: "Internal server error." });
  }
});