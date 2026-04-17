import { useState, useEffect, useMemo, useCallback, KeyboardEvent } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useDomains } from "@/hooks/useDomains";
import { useCampaign } from "@/hooks/useCampaigns";
import { TRAFFIC_SOURCES, getAllowedSources } from "@/lib/plan-config";
import {
  ensureAbsoluteUrl,
  isValidAbsoluteUrl,
  createUrlNormalizer,
  checkDomainConflict,
} from "@/lib/url-utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { CampaignFinalLinkData } from "@/components/campaigns/CampaignFinalLinkModal";

// ── Types ──────────────────────────────────────────────

export interface OfferEntry {
  url: string;
  weight: number;
}

export interface PostbackParam {
  key: string;
  value: string;
  isCustom: boolean;
}

const POSTBACK_MACROS = ["{click_id}", "{campaign_id}", "{ip}", "{country}", "{device}", "{cost}", "{timestamp}"];

function generateHash(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomBytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(randomBytes, (b) => chars[b % chars.length]).join("");
}

// ── Hook ───────────────────────────────────────────────

export function useCampaignForm() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useTranslation();

  // ── Mode detection ──────────────────────────
  const isCloning = location.pathname.endsWith("/clone");
  const isEditing = !!id && !isCloning;

  // ── External data ───────────────────────────
  const { domains } = useDomains();
  const { planConfig: userPlan } = useProfile();
  const allowedSources = getAllowedSources(userPlan);
  const hasLockedSources = allowedSources.length < TRAFFIC_SOURCES.length;
  const { campaign } = useCampaign(id);

  // ── Form states ─────────────────────────────
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [trafficSource, setTrafficSource] = useState("");
  const [safeUrl, setSafeUrl] = useState("");
  const [offerMode, setOfferMode] = useState<"single" | "ab">("single");
  const [offerUrl, setOfferUrl] = useState("");
  const [offerPageB, setOfferPageB] = useState("");
  const [abStormEnabled, setAbStormEnabled] = useState(false);
  const [abOffers, setAbOffers] = useState<OfferEntry[]>([
    { url: "", weight: 50 },
    { url: "", weight: 50 },
  ]);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [targetDevices, setTargetDevices] = useState<string[]>([]);
  const [strictMode, setStrictMode] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);

  // ── Postback states ─────────────────────────
  const [postbackBaseUrl, setPostbackBaseUrl] = useState("");
  const [postbackParams, setPostbackParams] = useState<PostbackParam[]>([
    { key: "", value: "", isCustom: false },
  ]);
  const [postbackMethod, setPostbackMethod] = useState<"GET" | "POST">("GET");

  // ── Dialog / modal states ───────────────────
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [successModal, setSuccessModal] = useState<CampaignFinalLinkData | null>(null);
  const [pendingHash, setPendingHash] = useState("");

  // ── Load campaign data (edit + clone) ───────
  useEffect(() => {
    if (campaign) {
      setName(isCloning ? `${campaign.name} (cópia)` : campaign.name);
      setDomain(isCloning ? "" : (campaign.domain ?? ""));
      setTrafficSource(campaign.traffic_source);
      setSafeUrl(campaign.safe_url);
      setOfferUrl(campaign.offer_url);
      const bUrl = campaign.offer_page_b ?? "";
      setOfferPageB(bUrl);
      setAbStormEnabled(!!bUrl);
      setTargetCountries(campaign.target_countries ?? []);
      setTargetDevices(campaign.target_devices ?? []);
      setTags(campaign.tags ?? []);
      setStrictMode(campaign.strict_mode ?? true);

      const raw = campaign.postback_url ?? "";
      if (raw.includes("?")) {
        const [base, query] = raw.split("?");
        setPostbackBaseUrl(base);
        const params = query.split("&").map((p: string) => {
          const eqIdx = p.indexOf("=");
          const key = p.slice(0, eqIdx);
          const value = p.slice(eqIdx + 1);
          return { key, value, isCustom: !POSTBACK_MACROS.includes(value) };
        });
        setPostbackParams(params.length ? params : [{ key: "", value: "", isCustom: false }]);
      } else {
        setPostbackBaseUrl(raw);
        setPostbackParams([{ key: "", value: "", isCustom: false }]);
      }
      setPostbackMethod((campaign.postback_method as "GET" | "POST") ?? "GET");
    }
  }, [campaign, isCloning]);

  // ── URL normalizers (for onBlur) ────────────
  const normalizeSafeUrl = useMemo(() => createUrlNormalizer(setSafeUrl), []);
  const normalizeOfferUrl = useMemo(() => createUrlNormalizer(setOfferUrl), []);
  const normalizeOfferPageB = useMemo(() => createUrlNormalizer(setOfferPageB), []);

  // ── Validation (derived, no state) ──────────
  const areDestinationUrlsValid =
    isValidAbsoluteUrl(safeUrl) &&
    (offerMode === "single"
      ? isValidAbsoluteUrl(offerUrl)
      : abOffers.every((o) => isValidAbsoluteUrl(o.url))) &&
    (!abStormEnabled || !offerPageB.trim() || isValidAbsoluteUrl(offerPageB));

  const isFormValid = Boolean(
    name &&
    domain &&
    trafficSource &&
    safeUrl &&
    (offerMode === "single" ? offerUrl : abOffers.every((o) => o.url)) &&
    areDestinationUrlsValid
  );

  // ── Postback preview (derived) ──────────────
  const postbackPreview = useMemo(() => {
    if (!postbackBaseUrl.trim()) return "";
    const qs = postbackParams
      .filter((p) => p.key.trim())
      .map((p) => `${p.key}=${p.value || "..."}`)
      .join("&");
    return qs ? `${postbackBaseUrl.trim()}?${qs}` : postbackBaseUrl.trim();
  }, [postbackBaseUrl, postbackParams]);

  // ── Handlers ────────────────────────────────
  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && tagInput.trim()) {
        e.preventDefault();
        if (!tags.includes(tagInput.trim())) {
          setTags((prev) => [...prev, tagInput.trim()]);
        }
        setTagInput("");
      }
    },
    [tagInput, tags]
  );

  const removeTag = useCallback(
    (t: string) => setTags((prev) => prev.filter((x) => x !== t)),
    []
  );

  const addCountry = useCallback((code: string) => {
    setTargetCountries((prev) => [...prev, code]);
    setCountrySearch("");
    setCountryDropdownOpen(false);
  }, []);

  const removeCountry = useCallback(
    (code: string) => setTargetCountries((prev) => prev.filter((c) => c !== code)),
    []
  );

  const toggleDevice = useCallback(
    (d: string) => setTargetDevices((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]),
    []
  );

  const handleAbStormToggle = useCallback((checked: boolean) => {
    setAbStormEnabled(checked);
    if (!checked) setOfferPageB("");
  }, []);

  // ── Save mutation ───────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const qs = postbackParams
        .filter((p) => p.key.trim() !== "")
        .map((p) => `${p.key.trim()}=${p.value}`)
        .join("&");
      const finalPostbackUrl = qs ? `${postbackBaseUrl.trim()}?${qs}` : postbackBaseUrl.trim();

      const payload: Record<string, unknown> = {
        name,
        domain: domain || null,
        traffic_source: trafficSource,
        safe_url: ensureAbsoluteUrl(safeUrl),
        offer_url:
          offerMode === "single"
            ? ensureAbsoluteUrl(offerUrl)
            : abOffers.map((o) => ensureAbsoluteUrl(o.url)).join(","),
        offer_page_b: abStormEnabled && offerPageB.trim() ? ensureAbsoluteUrl(offerPageB.trim()) : null,
        // O engine agora opera exclusivamente via Redirect 302 — não enviamos
        // mais safe_page_method / offer_page_method no payload.
        target_countries: targetCountries,
        target_devices: targetDevices,
        tags,
        strict_mode: strictMode,
        postback_url: finalPostbackUrl || null,
        postback_method: postbackMethod,
      };

      if (isEditing) {
        const { error } = await supabase.from("campaigns").update(payload).eq("id", id!);
        if (error) throw error;
        const { data: existing } = await supabase
          .from("campaigns")
          .select("hash, domain")
          .eq("id", id!)
          .single();
        return { hash: existing?.hash || "", domain: existing?.domain || domain };
      } else {
        const hash = generateHash();
        setPendingHash(hash);
        payload.user_id = user!.id;
        payload.hash = hash;
        const { error } = await supabase.from("campaigns").insert(payload as any);
        if (error) throw error;
        return { hash, domain: payload.domain as string };
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setSuccessModal({
        name,
        hash: result.hash,
        domain: result.domain || domain || "",
        traffic_source: trafficSource,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── handleSave (validation + conflict check + mutate) ──
  const handleSave = useCallback(() => {
    // Normalize URLs before validation
    normalizeSafeUrl(safeUrl);
    normalizeOfferUrl(offerUrl);
    if (abStormEnabled && offerPageB.trim()) normalizeOfferPageB(offerPageB);

    if (!areDestinationUrlsValid) {
      toast.error(t("campaignEdit.invalidUrl"));
      return;
    }

    // Domain conflict check — como todas as URLs agora são servidas via
    // redirect 302, basta checar todas as URLs de destino contra o domínio.
    if (domain) {
      try {
        const urlsToCheck: string[] = [];
        const s = ensureAbsoluteUrl(safeUrl);
        if (s) urlsToCheck.push(s);
        const o = ensureAbsoluteUrl(offerUrl);
        if (o) urlsToCheck.push(o);
        if (abStormEnabled && offerPageB.trim()) {
          const b = ensureAbsoluteUrl(offerPageB);
          if (b) urlsToCheck.push(b);
        }
        if (checkDomainConflict(domain, urlsToCheck)) {
          setConflictDialogOpen(true);
          return;
        }
      } catch {
        toast.error(t("campaignEdit.invalidUrl"));
        return;
      }
    }

    saveMutation.mutate();
  }, [
    safeUrl, offerUrl, offerPageB, abStormEnabled, domain,
    areDestinationUrlsValid,
    normalizeSafeUrl, normalizeOfferUrl, normalizeOfferPageB,
    saveMutation, t,
  ]);

  const forceSave = useCallback(() => {
    setConflictDialogOpen(false);
    saveMutation.mutate();
  }, [saveMutation]);

  // ── Return ──────────────────────────────────
  return {
    // Meta
    meta: {
      isEditing,
      isCloning,
      navigate,
    },

    // External data
    data: {
      domains,
      allowedSources,
      hasLockedSources,
    },

    // Form values
    form: {
      name,
      domain,
      trafficSource,
      safeUrl,
      offerMode,
      offerUrl,
      offerPageB,
      abStormEnabled,
      abOffers,
      targetCountries,
      targetDevices,
      strictMode,
      tags,
      tagInput,
      countrySearch,
      countryDropdownOpen,
      postbackBaseUrl,
      postbackParams,
      postbackMethod,
    },

    // Setters (for sub-component props)
    setters: {
      setName,
      setDomain,
      setTrafficSource,
      setSafeUrl,
      setOfferMode,
      setOfferUrl,
      setOfferPageB,
      setAbStormEnabled: handleAbStormToggle,
      setAbOffers,
      setTargetCountries,
      setTargetDevices,
      setStrictMode,
      setTags,
      setTagInput,
      setCountrySearch,
      setCountryDropdownOpen,
      setPostbackBaseUrl,
      setPostbackParams,
      setPostbackMethod,
    },

    // URL normalizers (for onBlur)
    normalizers: {
      normalizeSafeUrl,
      normalizeOfferUrl,
      normalizeOfferPageB,
    },

    // Handlers
    handlers: {
      handleTagKeyDown,
      removeTag,
      addCountry,
      removeCountry,
      toggleDevice,
      handleSave,
      forceSave,
    },

    // Validation (derived)
    validation: {
      isFormValid,
      areDestinationUrlsValid,
    },

    // Save state
    save: {
      isPending: saveMutation.isPending,
    },

    // Derived
    postbackPreview,

    // Dialog / modal state
    dialogs: {
      conflictDialogOpen,
      setConflictDialogOpen,
      successModal,
      setSuccessModal,
    },
  };
}
