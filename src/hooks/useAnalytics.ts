// =============================================================================
// useAnalytics — thin React hook wrapping the analytics module.
// -----------------------------------------------------------------------------
// Exposes a stable API for components to emit tracking events without
// importing the underlying provider. Returned callbacks are referentially
// stable, so they can be safely used in dependency arrays.
// =============================================================================

import { useCallback } from "react";
import {
  track,
  identify,
  reset,
  registerSuperProperties,
  isAnalyticsEnabled,
  type AnalyticsEvent,
  type AnalyticsProperties,
  type AnalyticsUserTraits,
} from "@/lib/analytics";

export interface UseAnalytics {
  track: (event: AnalyticsEvent, properties?: AnalyticsProperties) => void;
  identify: (distinctId: string, traits?: AnalyticsUserTraits) => void;
  reset: () => void;
  registerSuperProperties: (properties: AnalyticsProperties) => void;
  isEnabled: boolean;
}

export function useAnalytics(): UseAnalytics {
  const trackEvent = useCallback(
    (event: AnalyticsEvent, properties?: AnalyticsProperties) => track(event, properties),
    [],
  );

  const identifyUser = useCallback(
    (distinctId: string, traits?: AnalyticsUserTraits) => identify(distinctId, traits),
    [],
  );

  const resetSession = useCallback(() => reset(), []);

  const registerSuper = useCallback(
    (properties: AnalyticsProperties) => registerSuperProperties(properties),
    [],
  );

  return {
    track: trackEvent,
    identify: identifyUser,
    reset: resetSession,
    registerSuperProperties: registerSuper,
    isEnabled: isAnalyticsEnabled(),
  };
}
