// =============================================================================
// Minimal ambient declaration for `posthog-js`.
//
// This fallback shim keeps `tsc` happy in environments where `posthog-js` is
// not yet installed (CI sandboxes, fresh clones before `npm install`, etc).
//
// Once the real package is resolved from `node_modules`, TypeScript module
// resolution picks the official `.d.ts` over this ambient declaration. Only
// the API surface actually consumed by `src/lib/analytics.ts` is declared.
// =============================================================================

declare module "posthog-js" {
  export interface PostHogConfig {
    api_host?: string;
    autocapture?: boolean;
    capture_pageview?: boolean;
    capture_pageleave?: boolean;
    disable_session_recording?: boolean;
    persistence?: "localStorage" | "cookie" | "memory" | "sessionStorage" | "localStorage+cookie";
    respect_dnt?: boolean;
    mask_all_element_attributes?: boolean;
    mask_all_text?: boolean;
    loaded?: (instance: PostHogInstance) => void;
    opt_out_capturing_by_default?: boolean;
    secure_cookie?: boolean;
  }

  export interface PostHogInstance {
    init: (apiKey: string, config?: PostHogConfig) => PostHogInstance;
    capture: (eventName: string, properties?: Record<string, unknown>) => void;
    identify: (distinctId: string, properties?: Record<string, unknown>) => void;
    reset: () => void;
    register: (properties: Record<string, unknown>) => void;
    unregister: (property: string) => void;
    people: {
      set: (properties: Record<string, unknown>) => void;
    };
    opt_in_capturing: () => void;
    opt_out_capturing: () => void;
    has_opted_out_capturing: () => boolean;
  }

  const posthog: PostHogInstance;
  export default posthog;
}
