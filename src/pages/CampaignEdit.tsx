import { useState, useEffect, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, X, AlertTriangle, Plus, Trash2, Lock, Zap, ShieldAlert, Info, Copy, Check, ExternalLink, Shield, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { TRAFFIC_SOURCES, getPlanByName, getAllowedSources } from "@/lib/plan-config";

const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "BR", name: "Brazil" },
  { code: "GB", name: "United Kingdom" }, { code: "DE", name: "Germany" },
  { code: "FR", name: "France" }, { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" }, { code: "PT", name: "Portugal" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" }, { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" }, { code: "CO", name: "Colombia" },
  { code: "IN", name: "India" }, { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" }, { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" }, { code: "TH", name: "Thailand" },
];

const DEVICES = ["desktop", "mobile", "tablet"] as const;

function generateHash(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomBytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(randomBytes, (b) => chars[b % chars.length]).join("");
}

interface OfferEntry {
  url: string;
  weight: number;
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
  const [successModal, setSuccessModal] = useState<{ link: string; offerUrl: string; safeUrl: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: domains = [] } = useQuery({
    queryKey: ["domains", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").eq("is_verified", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const userPlan = getPlanByName(profile?.plan_name);
  const allowedSources = getAllowedSources(userPlan);
  const hasLockedSources = allowedSources.length < TRAFFIC_SOURCES.length;

  const { data: campaign } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDomain((campaign as any).domain ?? "");
      setTrafficSource(campaign.traffic_source);
      setSafeUrl(campaign.safe_url);
      setOfferUrl(campaign.offer_url);
      const bUrl = (campaign as any).offer_page_b ?? "";
      setOfferPageB(bUrl);
      setAbStormEnabled(!!bUrl);
      setSafeMethod((campaign as any).safe_page_method ?? "redirect");
      setOfferMethod((campaign as any).offer_page_method ?? "redirect");
      setTargetCountries((campaign as any).target_countries ?? []);
      setTargetDevices((campaign as any).target_devices ?? []);
      setTags((campaign as any).tags ?? []);
      setStrictMode((campaign as any).strict_mode ?? false);
    }
  }, [campaign]);

  const [pendingHash, setPendingHash] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name,
        domain: domain || null,
        traffic_source: trafficSource,
        safe_url: ensureAbsoluteUrl(safeUrl),
        offer_url: offerMode === "single" ? ensureAbsoluteUrl(offerUrl) : abOffers.map((o) => ensureAbsoluteUrl(o.url)).join(","),
        offer_page_b: abStormEnabled && offerPageB.trim() ? ensureAbsoluteUrl(offerPageB.trim()) : null,
        safe_page_method: safeMethod,
        offer_page_method: offerMethod,
        target_countries: targetCountries,
        target_devices: targetDevices,
        tags,
        strict_mode: strictMode,
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
      const selectedDomain = result.domain || domain || "yourdomain.com";
      const cleanDomain = selectedDomain.replace(/^(https?:\/\/)/, "").replace(/\/+$/, "");
      const finalLink = `https://${cleanDomain}/c/${result.hash}`;
      setSuccessModal({
        link: finalLink,
        offerUrl: ensureAbsoluteUrl(offerUrl),
        safeUrl: ensureAbsoluteUrl(safeUrl),
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  const addAbOffer = () => {
    if (abOffers.length < 3) setAbOffers([...abOffers, { url: "", weight: 0 }]);
  };
  const removeAbOffer = (i: number) => {
    if (abOffers.length > 2) setAbOffers(abOffers.filter((_, idx) => idx !== i));
  };
  const updateAbOffer = (i: number, field: keyof OfferEntry, value: string | number) => {
    setAbOffers(abOffers.map((o, idx) => (idx === i ? { ...o, [field]: value } : o)));
  };

  const filteredCountries = COUNTRIES.filter(
    (c) => !targetCountries.includes(c.code) && (c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
  );
  const addCountry = (code: string) => {
    setTargetCountries([...targetCountries, code]);
    setCountrySearch("");
    setCountryDropdownOpen(false);
  };
  const removeCountry = (code: string) => setTargetCountries(targetCountries.filter((c) => c !== code));

  const toggleDevice = (d: string) => {
    setTargetDevices((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const ensureAbsoluteUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const isFormValid = name && trafficSource && safeUrl && (offerMode === "single" ? offerUrl : abOffers.every((o) => o.url));

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">{isEditing ? t("campaignEdit.editCampaign") : t("campaignEdit.newCampaign")}</h1>
      </div>

      {/* BLOCK 1: Campaign */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("campaignEdit.campaignSection")}</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("campaignEdit.campaignName")}</Label>
            <Input placeholder={t("campaignEdit.campaignNamePlaceholder")} className="bg-secondary border-border" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("campaignEdit.domainLabel")}</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[280px] text-xs leading-relaxed">
                    <p>{t("campaignEdit.domainTooltip")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {domains.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
                <p className="text-sm text-yellow-200/80">
                  {t("campaignEdit.noDomains")}{" "}
                  <button type="button" onClick={() => navigate("/domains")} className="underline text-primary hover:text-primary/80 transition-colors">
                    {t("campaignEdit.noDomainsAction")}
                  </button>{" "}
                  {t("campaignEdit.noDomainsHelper")}
                </p>
              </div>
            ) : (
              <>
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder={t("campaignEdit.selectDomain")} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.url}>{d.url}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("campaignEdit.domainHelper")}</p>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("campaignEdit.trafficSource")}</Label>
            <Select value={trafficSource} onValueChange={setTrafficSource}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder={t("campaignEdit.selectSource")} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {allowedSources.map((src) => {
                  const Icon = src.icon;
                  return (
                    <SelectItem key={src.key} value={src.key}>
                      <span className="flex items-center gap-2">
                        <Icon size={14} style={{ color: src.color }} />
                        {src.name}
                      </span>
                    </SelectItem>
                  );
                })}
                {hasLockedSources && (
                  <SelectItem value="__locked" disabled>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Lock size={14} />
                      {t("campaignEdit.unlockMore")}
                    </span>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* BLOCK 2: Safe Page */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("campaignEdit.safePageSection")}</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.safePageUrl")}</Label>
          <Input placeholder={t("campaignEdit.safePagePlaceholder")} className="bg-secondary border-border" value={safeUrl} onChange={(e) => setSafeUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.method")}</Label>
          <RadioGroup value={safeMethod} onValueChange={setSafeMethod} className="flex gap-4">
            <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${safeMethod === "redirect" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
              <RadioGroupItem value="redirect" className="sr-only" />
              {t("campaignEdit.redirect")}
            </label>
            <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${safeMethod === "content_fetch" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
              <RadioGroupItem value="content_fetch" className="sr-only" />
              {t("campaignEdit.contentFetch")}
            </label>
          </RadioGroup>
        </div>
      </section>

      {/* BLOCK 3: Offer Page */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("campaignEdit.offerPageSection")}</h2>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.primaryOffer")}</Label>
          <Input placeholder={t("campaignEdit.offerPlaceholder")} className="bg-secondary border-border" value={offerUrl} onChange={(e) => setOfferUrl(e.target.value)} />
        </div>

        {/* A/B Storm Toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("campaignEdit.abStormTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("campaignEdit.abStormDesc")}</p>
            </div>
          </div>
          <Switch
            checked={abStormEnabled}
            onCheckedChange={(checked) => {
              setAbStormEnabled(checked);
              if (!checked) setOfferPageB("");
            }}
          />
        </div>

        <Collapsible open={abStormEnabled}>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2">
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("campaignEdit.testOfferB")}</Label>
                <Input
                  placeholder={t("campaignEdit.testOfferPlaceholder")}
                  className="bg-secondary border-border"
                  value={offerPageB}
                  onChange={(e) => setOfferPageB(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("campaignEdit.abStormHelp").split("<bold>").map((part, i) => {
                  if (i === 0) return part;
                  const [bold, rest] = part.split("</bold>");
                  return <span key={i}><span className="font-semibold text-primary">{bold}</span>{rest}</span>;
                })}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.method")}</Label>
          <RadioGroup value={offerMethod} onValueChange={setOfferMethod} className="flex gap-4">
            <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${offerMethod === "redirect" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
              <RadioGroupItem value="redirect" className="sr-only" />
              {t("campaignEdit.redirect")}
            </label>
          </RadioGroup>
        </div>
      </section>

      {/* BLOCK 3.5: Strict Mode */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("campaignEdit.securitySection")}</h2>
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
              <ShieldAlert className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("campaignEdit.strictModeTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("campaignEdit.strictModeDesc")}</p>
            </div>
          </div>
          <Switch checked={strictMode} onCheckedChange={setStrictMode} />
        </div>
      </section>

      {/* BLOCK 4: Target */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("campaignEdit.targetSection")}</h2>
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-200/80">{t("campaignEdit.tiktokWarning")}</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.countries")}</Label>
          <div className="relative">
            <Input
              placeholder={t("campaignEdit.searchCountries")}
              className="bg-secondary border-border"
              value={countrySearch}
              onChange={(e) => { setCountrySearch(e.target.value); setCountryDropdownOpen(true); }}
              onFocus={() => setCountryDropdownOpen(true)}
              onBlur={() => setTimeout(() => setCountryDropdownOpen(false), 200)}
            />
            {countryDropdownOpen && filteredCountries.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {filteredCountries.slice(0, 10).map((c) => (
                  <button key={c.code} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors" onMouseDown={(e) => { e.preventDefault(); addCountry(c.code); }}>
                    <span className="font-mono text-primary mr-2">{c.code}</span>{c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {targetCountries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {targetCountries.map((code) => (
                <Badge key={code} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                  {code}
                  <button type="button" onClick={() => removeCountry(code)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.devices")}</Label>
          <div className="flex gap-2">
            {DEVICES.map((d) => (
              <button key={d} type="button" onClick={() => toggleDevice(d)} className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${targetDevices.includes(d) ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* BLOCK 5: Tags */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("campaignEdit.tagsSection")}</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.tagHelper")}</Label>
          <Input placeholder={t("campaignEdit.tagPlaceholder")} className="bg-secondary border-border" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tg) => (
              <Badge key={tg} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                {tg}
                <button type="button" onClick={() => removeTag(tg)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate("/campaigns")}>{t("common.cancel")}</Button>
        <Button
          onClick={() => {
            if (domain && offerUrl) {
              try {
                const offerHost = new URL(ensureAbsoluteUrl(offerUrl)).hostname.replace(/^www\./, "");
                const selectedDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
                if (offerHost === selectedDomain || offerHost.endsWith(`.${selectedDomain}`)) {
                  setConflictDialogOpen(true);
                  return;
                }
              } catch { /* invalid URL, let save handle it */ }
            }
            saveMutation.mutate();
          }}
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
              <br /><br />
              {t("campaignEdit.conflictRecommend")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConflictDialogOpen(false)}>{t("common.goBack")}</Button>
            <Button variant="destructive" onClick={() => { setConflictDialogOpen(false); saveMutation.mutate(); }}>
              {t("common.saveAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={!!successModal} onOpenChange={(open) => { if (!open) { setSuccessModal(null); navigate("/campaigns"); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">{t("campaignEdit.successTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {t("campaignEdit.successDesc", { name })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("campaignEdit.trackingLink")}</Label>
              <div className="relative">
                <Input
                  readOnly
                  value={successModal?.link || ""}
                  className="bg-secondary border-border pr-20 font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 gap-1.5 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(successModal?.link || "");
                    setLinkCopied(true);
                    toast.success(t("campaignEdit.linkCopied"));
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                >
                  {linkCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {linkCopied ? t("common.copied") : t("common.copy")}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("campaignEdit.offerPageLabel")}</span>
                </div>
                <p className="text-xs font-mono text-foreground truncate" title={successModal?.offerUrl}>
                  {successModal?.offerUrl || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("campaignEdit.safePageLabel")}</span>
                </div>
                <p className="text-xs font-mono text-foreground truncate" title={successModal?.safeUrl}>
                  {successModal?.safeUrl || "—"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("campaignEdit.quickSetup")}</p>
              <div className="space-y-2">
                {["step1", "step2", "step3"].map((stepKey, i) => (
                  <div key={stepKey} className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">{i + 1}</span>
                    <p className="text-sm text-muted-foreground">
                      {t(`campaignEdit.${stepKey}`).split("<bold>").map((part: string, j: number) => {
                        if (j === 0) return part;
                        const [bold, rest] = part.split("</bold>");
                        return <span key={j}><span className="font-medium text-foreground">{bold}</span>{rest}</span>;
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => { setSuccessModal(null); navigate("/campaigns"); }} className="w-full">
              {t("campaignEdit.goToCampaigns")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
