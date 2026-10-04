import { supabase } from "@/integrations/supabase/client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type CheckoutActivationResult = "ACTIVE" | "timeout";

/**
 * After Stripe Checkout redirects with ?checkout=success, the webhook may
 * lag. Never toast "activated" from the URL alone — wait until the gate says ACTIVE.
 */
export async function waitForCheckoutActivation(opts?: {
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<CheckoutActivationResult> {
  const timeoutMs = opts?.timeoutMs ?? 35_000;
  const signal = opts?.signal;
  const started = Date.now();
  // Immediate + backoff — webhook usually lands in 1–5s.
  const delaysMs = [0, 600, 1000, 1500, 2000, 3000, 4000, 5000, 6000];

  for (const delay of delaysMs) {
    if (signal?.aborted) return "timeout";
    if (delay > 0) await sleep(delay);
    if (signal?.aborted) return "timeout";
    if (Date.now() - started > timeoutMs) break;

    const { data, error } = await supabase.rpc("get_my_profile_gate").maybeSingle();
    if (error) continue;
    const row = data as { activation_status?: string | null } | null;
    if (row?.activation_status === "ACTIVE") return "ACTIVE";
  }

  if (signal?.aborted) return "timeout";
  const { data } = await supabase.rpc("get_my_profile_gate").maybeSingle();
  const row = data as { activation_status?: string | null } | null;
  return row?.activation_status === "ACTIVE" ? "ACTIVE" : "timeout";
}
