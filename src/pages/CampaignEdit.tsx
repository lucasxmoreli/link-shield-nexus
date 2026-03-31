import { useState, useEffect, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { TRAFFIC_SOURCES, getAllowedSources } from "@/lib/plan-config";
import { useProfile } from "@/hooks/useProfile";
import { useDomains } from "@/hooks/useDomains";
import { useCampaign } from "@/hooks/useCampaigns";
import CampaignFinalLinkModal, { type CampaignFinalLinkData } from "@/components/campaigns/CampaignFinalLinkModal";

import CampaignGeneralConfig from "@/components/campaigns/edit/CampaignGeneralConfig";
import SafePageConfig from "@/components/campaigns/edit/SafePageConfig";
import OfferPageConfig from "@/components/campaigns/edit/OfferPageConfig";
import SecurityConfig from "@/components/campaigns/edit/SecurityConfig";
import WebhookPostbackConfig from "@/components/campaigns/edit/WebhookPostbackConfig";
import TargetingConfig from "@/components/campaigns/edit/TargetingConfig";

const POSTBACK_MACROS = ["{click_id}", "{campaign_id}", "{ip}", "{country}", "{device}", "{cost}", "{timestamp}"];

function generateHash(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomBytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(randomBytes, (b) => chars[b % chars.length]).join("");
}

interface OfferEntry {
  url: string;
  weight: number;
}

interface PostbackParam {
  key: string;
  value: string;
  isCustom: boolean;
}

export default function CampaignEdit() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [trafficSource, setTrafficSource] = useState("");
  const [safeUrl, setSafeUrl] = useState("");
  const [safeMethod, setSafeMethod] = useState("redirect");
  const [offerMode, setOfferMode] = useState<"single" | "ab">("single");
  const [offerUrl, setOfferUrl] = useState("");
  const [offerPageB, setOfferPageB] = useState("");
  const [abStormEnabled, setAbStormEnabled] = useState(false);
  const [offerMethod, setOfferMethod] = useState("redirect");
  const [abOffers, setAbOffers] = useState<OfferEntry[]>([
    { url: "", weight: 50 },
    { url: "", weight: 50 },
  ]);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [targetDevices, setTargetDevices] = useState<string[]>([]);
  const [strictMode, setStrictMode] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [successModal, setSuccessModal] = useState<CampaignFinalLinkData | null>(null);

  // ── Webhook Postback states ─────────────────────────
  const [postbackBaseUrl, setPostbackBaseUrl] = useState("");
  const [postbackParams, setPostbackParams] = useState<PostbackParam[]>([{ key: "", value: "", isCustom: false }]);
  const [postbackMethod, setPostbackMethod] = useState<"GET" | "POST">("GET");

  const { domains } = useDomains();
  const { planConfig: userPlan } = useProfile();
  const allowedSources = getAllowedSources(userPlan);
  const hasLockedSources = allowedSources.length < TRAFFIC_SOURCES.length;
  const { campaign } = useCampaign(id);

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDomain(campaign.domain ?? "");
      setTrafficSource(campaign.traffic_source);
      setSafeUrl(campaign.safe_url);
      setOfferUrl(campaign.offer_url);
      const bUrl = campaign.offer_page_b ?? "";
      setOfferPageB(bUrl);
      setAbStormEnabled(!!bUrl);
      setSafeMethod(campaign.safe_page_method ?? "redirect");
      setOfferMethod(campaign.offer_page_method ?? "redirect");
      setTargetCountries(campaign.target_countries ?? []);
      setTargetDevices(campaign.target_devices ?? []);
      setTags(campaign.tags ?? []);
      setStrictMode(campaign.strict_mode ?? false);

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
  }, [campaign]);

  const [pendingHash, setPendingHash] = useState("");

  // ── URL utilities ──────────────────────────
  const normalizeUrlInput = (url: string): string => url.trim().replace(/^\/+/, "");

  const ensureAbsoluteUrl = (url: string): string => {
    const cleaned = normalizeUrlInput(url);
    if (!cleaned) return "";
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    return `https://${cleaned}`;
  };

  const isValidAbsoluteUrl = (url: string): boolean => {
    const normalized = ensureAbsoluteUrl(url);
    if (!normalized) return false;
    try {
      const parsed = new URL(normalized);
      return /^https?:$/i.test(parsed.protocol) && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  };

  const normalizeUrlField = (setter: (value: string) => void) => (value: string) => {
    setter(ensureAbsoluteUrl(value));
  };

  // ── Validation ──────────────────────────
  const areDestinationUrlsValid =
    isValidAbsoluteUrl(safeUrl) &&
    (offerMode === "single" ? isValidAbsoluteUrl(offerUrl) : abOffers.every((o) => isValidAbsoluteUrl(o.url))) &&
    (!abStormEnabled || !offerPageB.trim() || isValidAbsoluteUrl(offerPageB));

  const isFormValid = Boolean(
    name &&
    domain &&
    trafficSource &&
    safeUrl &&
    (offerMode === "single" ? offerUrl : abOffers.every((o) => o.url)) &&
    areDestinationUrlsValid,
  );

  // ── Postback preview ──────────────────────────
  const postbackPreview = (() => {
    if (!postbackBaseUrl.trim()) return "";
    const qs = postbackParams
      .filter((p) => p.key.trim())
      .map((p) => `${p.key}=${p.value || "..."}`)
      .join("&");
    return qs ? `${postbackBaseUrl.trim()}?${qs}` : postbackBaseUrl.trim();
  })();

  // ── Save mutation ──────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const qs = postbackParams
        .filter((p) => p.key.trim() !== "")
        .map((p) => `${p.key.trim()}=${p.value}`)
        .join("&");
      const finalPostbackUrl = qs ? `${postbackBaseUrl.trim()}?${qs}` : postbackBaseUrl.trim();

      const payload: any = {
        name,
        domain: domain || null,
        traffic_source: trafficSource,
        safe_url: ensureAbsoluteUrl(safeUrl),
        offer_url:
          offerMode === "single"
            ? ensureAbsoluteUrl(offerUrl)
            : abOffers.map((o) => ensureAbsoluteUrl(o.url)).join(","),
        offer_page_b: abStormEnabled && offerPageB.trim() ? ensureAbsoluteUrl(offerPageB.trim()) : null,
        safe_page_method: safeMethod,
        offer_page_method: offerMethod,
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
        const { data: existing } = await supabase.from("campaigns").select("hash, domain").eq("id", id!).single();
        return { hash: existing?.hash || "", domain: existing?.domain || domain };
      } else {
        const hash = generateHash();
        setPendingHash(hash);
        payload.user_id = user!.id;
        payload.hash = hash;
        const { error } = await supabase.from("campaigns").insert(payload);
        if (error) throw error;
        return { hash, domain: payload.domain };
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

  // ── Handler functions ──────────────────────────
  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const addCountry = (code: string) => {
    setTargetCountries([...targetCountries, code]);
    setCountrySearch("");
    setCountryDropdownOpen(false);
  };
  const removeCountry = (code: string) => setTargetCountries(targetCountries.filter((c) => c !== code));

  const toggleDevice = (d: string) => {
    setTargetDevices((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const handleSave = () => {
    normalizeUrlField(setSafeUrl)(safeUrl);
    normalizeUrlField(setOfferUrl)(offerUrl);
    if (abStormEnabled && offerPageB.trim()) normalizeUrlField(setOfferPageB)(offerPageB);
    if (!areDestinationUrlsValid) {
      toast.error(t("campaignEdit.invalidUrl"));
      return;
    }
    if (domain) {
      try {
        const selectedDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
        const urlsToCheck: string[] = [];
        if (safeMethod === "redirect") {
          const s = ensureAbsoluteUrl(safeUrl);
          if (s) urlsToCheck.push(s);
        }
        if (offerMethod === "redirect") {
          const o = ensureAbsoluteUrl(offerUrl);
          if (o) urlsToCheck.push(o);
          if (abStormEnabled && offerPageB.trim()) {
            const b = ensureAbsoluteUrl(offerPageB);
            if (b) urlsToCheck.push(b);
          }
        }
        const hasConflict = urlsToCheck.some((u) => {
          try {
            const host = new URL(u).hostname.replace(/^www\./, "");
            return host === selectedDomain || host.endsWith(`.${selectedDomain}`);
          } catch {
            return false;
          }
        });
        if (hasConflict) {
          setConflictDialogOpen(true);
          return;
        }
      } catch {
        toast.error(t("campaignEdit.invalidUrl"));
        return;
      }
    }
    saveMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isEditing ? t("campaignEdit.editCampaign") : t("campaignEdit.newCampaign")}
        </h1>
      </div>

      <CampaignGeneralConfig
        name={name}
        onNameChange={setName}
        domain={domain}
        onDomainChange={setDomain}
        trafficSource={trafficSource}
        onTrafficSourceChange={setTrafficSource}
        domains={domains}
        allowedSources={allowedSources}
        hasLockedSources={hasLockedSources}
      />

      <SafePageConfig
        safeUrl={safeUrl}
        onSafeUrlChange={setSafeUrl}
        onSafeUrlBlur={normalizeUrlField(setSafeUrl)}
        safeMethod={safeMethod}
        onSafeMethodChange={setSafeMethod}
      />

      <OfferPageConfig
        offerUrl={offerUrl}
        onOfferUrlChange={setOfferUrl}
        onOfferUrlBlur={normalizeUrlField(setOfferUrl)}
        abStormEnabled={abStormEnabled}
        onAbStormEnabledChange={(checked) => {
          setAbStormEnabled(checked);
          if (!checked) setOfferPageB("");
        }}
        offerPageB={offerPageB}
        onOfferPageBChange={setOfferPageB}
        onOfferPageBBlur={normalizeUrlField(setOfferPageB)}
        offerMethod={offerMethod}
        onOfferMethodChange={setOfferMethod}
      />

      <SecurityConfig
        strictMode={strictMode}
        onStrictModeChange={setStrictMode}
      />

      <WebhookPostbackConfig
        postbackBaseUrl={postbackBaseUrl}
        onPostbackBaseUrlChange={setPostbackBaseUrl}
        postbackParams={postbackParams}
        onPostbackParamsChange={setPostbackParams}
        postbackMethod={postbackMethod}
        onPostbackMethodChange={setPostbackMethod}
        postbackPreview={postbackPreview}
      />

      <TargetingConfig
        targetCountries={targetCountries}
        countrySearch={countrySearch}
        onCountrySearchChange={setCountrySearch}
        countryDropdownOpen={countryDropdownOpen}
        onCountryDropdownOpenChange={setCountryDropdownOpen}
        onAddCountry={addCountry}
        onRemoveCountry={removeCountry}
        targetDevices={targetDevices}
        onToggleDevice={toggleDevice}
        tags={tags}
        tagInput={tagInput}
        onTagInputChange={setTagInput}
        onTagKeyDown={handleTagKeyDown}
        onRemoveTag={removeTag}
      />

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate("/campaigns")}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !isFormValid}
        >
          {saveMutation.isPending ? t("common.saving") : t("campaignEdit.saveCampaign")}
        </Button>
      </div>

      {/* Domain Conflict Dialog */}
      <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {t("campaignEdit.conflictTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-2">
              {t("campaignEdit.conflictDesc", { domain })}
              <br />
              <br />
              {t("campaignEdit.conflictRecommend")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConflictDialogOpen(false)}>
              {t("common.goBack")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConflictDialogOpen(false);
                saveMutation.mutate();
              }}
            >
              {t("common.saveAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <CampaignFinalLinkModal
        campaign={successModal}
        onClose={() => setSuccessModal(null)}
      />
    </div>
  );
}
