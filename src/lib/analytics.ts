// =============================================================================
// Analytics Wrapper (PostHog)
// -----------------------------------------------------------------------------
// Single entry point for product analytics. All call sites import from this
// module instead of `posthog-js` directly, so we can swap the provider later
// (Mixpanel, Amplitude, Segment) by editing only this file.
//
// Behavior:
//   - Gracefully no-ops when `VITE_POSTHOG_KEY` is not set (local dev, CI).
//   - Respects the browser's `Do Not Track` signal.
//   - Uses strict event taxonomy: `snake_case`, one event = one fact.
//
// Environment variables:
//   VITE_POSTHOG_KEY   — project API key (required to enable tracking)
//   VITE_POSTHOG_HOST  — ingestion host (defaults to EU cloud)
// =============================================================================

import type { PostHogInstance } from "posthog-js";

// ── Typed event taxonomy (activation + conversion funnels) ───────────────────
export type AnalyticsEvent =
  // Activation funnel
  | "signup_completed"
  | "onboarding_step_viewed"
  | "domain_added"
  | "domain_verified"
  | "campaign_created"
  | "first_click_received"
  // Conversion funnel
  | "paywall_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "subscription_canceled"
  // Generic
  | "page_viewed"
  | "cta_clicked";

export type AnalyticsProperties = Record<string, unknown>;

export interface AnalyticsUserTraits {
  email?: string;
  plan?: string;
  created_at?: string;
  role?: string;
  [key: string]: unknown;
}

// ── Internal state ───────────────────────────────────────────────────────────
let client: PostHogInstance | null = null;
let initialized = false;
let initializing: Promise<void> | null = null;

const DEFAULT_HOST = "https://eu.i.posthog.com";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isDoNotTrackEnabled(): boolean {
  if (!isBrowser()) return false;
  const nav = window.navigator as Navigator & { msDoNotTrack?: string; doNotTrack?: string };
  const dnt = nav.doNotTrack ?? nav.msDoNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
}

function getApiKey(): string | null {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  return key && key.trim().length > 0 ? key : null;
}

function getApiHost(): string {
  return import.meta.env.VITE_POSTHOG_HOST ?? DEFAULT_HOST;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether analytics is enabled in the current environment.
 * Returns false if the API key is missing or DNT is active.
 */
export function isAnalyticsEnabled(): boolean {
  return !!getApiKey() && !isDoNotTrackEnabled();
}

/**
 * Initialize PostHog. Safe to call multiple times — only the first call does work.
 * Lazy-loads `posthog-js` to keep it out of the initial bundle when disabled.
 */
export async function initAnalytics(): Promise<void> {
  if (initialized || initializing) {
    return initializing ?? Promise.resolve();
  }
  if (!isBrowser() || !isAnalyticsEnabled()) {
    initialized = true;
    return;
  }

  initializing = (async () => {
    try {
      const mod = await import("posthog-js");
      const posthog = (mod.default ?? (mod as unknown as PostHogInstance)) as PostHogInstance;

      posthog.init(getApiKey() as string, {
        api_host: getApiHost(),
        // Disable autocapture — we rely on explicit, curated events only.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        // Privacy defaults
        disable_session_recording: true,
        respect_dnt: true,
        mask_all_element_attributes: true,
        persistence: "localStorage+cookie",
        secure_cookie: true,
      });

      client = posthog;
      initialized = true;
    } catch (err) {
      // Never crash the app if analytics fails to boot.
      // eslint-disable-next-line no-console
      console.warn("[analytics] Failed to initialize PostHog:", err);
      initialized = true;
      client = null;
    } finally {
      initializing = null;
    }
  })();

  return initializing;
}

/**
 * Associate the current anonymous session with an authenticated user.
 * Call this right after login, and whenever user traits change.
 */
export function identify(distinctId: string, traits?: AnalyticsUserTraits): void {
  if (!client) return;
  try {
    client.identify(distinctId, traits);
    if (traits) client.people.set(traits);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[analytics] identify() failed:", err);
  }
}

/**
 * Capture a product event.
 * Use the `AnalyticsEvent` union type to prevent taxonomy drift.
 */
export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!client) return;
  try {
    client.capture(event, properties);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[analytics] track() failed:", err);
  }
}

/**
 * Clear the identified user from the current session.
 * Call this on logout so subsequent events are re-anonymized.
 */
export function reset(): void {
  if (!client) return;
  try {
    client.reset();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[analytics] reset() failed:", err);
  }
}

/**
 * Register properties that should be attached to every subsequent event
 * (super properties). Useful for `app_version`, `locale`, etc.
 */
export function registerSuperProperties(properties: AnalyticsProperties): void {
  if (!client) return;
  try {
    client.register(properties);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[analytics] registerSuperProperties() failed:", err);
  }
}
