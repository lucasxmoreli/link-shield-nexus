import { useState, useEffect, KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, X, AlertTriangle, Plus, Trash2, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
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
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);

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
      setTrafficSource(campaign.traffic_source);
      setSafeUrl(campaign.safe_url);
      setOfferUrl(campaign.offer_url);
      setSafeMethod((campaign as any).safe_page_method ?? "redirect");
      setOfferMethod((campaign as any).offer_page_method ?? "redirect");
      setTargetCountries((campaign as any).target_countries ?? []);
      setTargetDevices((campaign as any).target_devices ?? []);
      setTags((campaign as any).tags ?? []);
    }
  }, [campaign]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name,
        traffic_source: trafficSource,
        safe_url: safeUrl,
        offer_url: offerMode === "single" ? offerUrl : abOffers.map((o) => o.url).join(","),
        safe_page_method: safeMethod,
        offer_page_method: offerMethod,
        target_countries: targetCountries,
        target_devices: targetDevices,
        tags,
      };
      if (isEditing) {
        const { error } = await supabase.from("campaigns").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        payload.user_id = user!.id;
        payload.hash = generateHash();
        const { error } = await supabase.from("campaigns").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(isEditing ? "Campaign updated!" : "Campaign created!");
      navigate("/campaigns");
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

  const isFormValid = name && trafficSource && safeUrl && (offerMode === "single" ? offerUrl : abOffers.every((o) => o.url));

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">{isEditing ? "Edit Campaign" : "New Campaign"}</h1>
      </div>

      {/* BLOCK 1: Campaign */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Campaign</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Campaign Name</Label>
            <Input placeholder="e.g. TTK 10 - FREE [TRESH-$500]" className="bg-secondary border-border" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Domain</Label>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Select a domain" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {domains.map((d) => (
                  <SelectItem key={d.id} value={d.url}>{d.url}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Traffic Source</Label>
            <Select value={trafficSource} onValueChange={setTrafficSource}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Select source" />
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
                      Upgrade plan to unlock more sources
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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Safe Page</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Safe Page URL</Label>
          <Input placeholder="https://blog.example.com/..." className="bg-secondary border-border" value={safeUrl} onChange={(e) => setSafeUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Method</Label>
          <RadioGroup value={safeMethod} onValueChange={setSafeMethod} className="flex gap-4">
            <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${safeMethod === "redirect" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
              <RadioGroupItem value="redirect" className="sr-only" />
              Redirect
            </label>
            <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${safeMethod === "content_fetch" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
              <RadioGroupItem value="content_fetch" className="sr-only" />
              Content Fetch
            </label>
          </RadioGroup>
        </div>
      </section>

      {/* BLOCK 3: Offer Page */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Offer Page</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOfferMode("single")} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${offerMode === "single" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
            Single Offer
          </button>
          <button type="button" onClick={() => setOfferMode("ab")} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${offerMode === "ab" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
            A/B Storm
          </button>
        </div>

        {offerMode === "single" ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Offer URL</Label>
            <Input placeholder="https://offer.example.com/..." className="bg-secondary border-border" value={offerUrl} onChange={(e) => setOfferUrl(e.target.value)} />
          </div>
        ) : (
          <div className="space-y-3">
            {abOffers.map((offer, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Offer URL #{i + 1}</Label>
                  <Input placeholder="https://offer.example.com/..." className="bg-secondary border-border" value={offer.url} onChange={(e) => updateAbOffer(i, "url", e.target.value)} />
                </div>
                <div className="w-24 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Weight %</Label>
                  <Input type="number" min={0} max={100} className="bg-secondary border-border" value={offer.weight} onChange={(e) => updateAbOffer(i, "weight", Number(e.target.value))} />
                </div>
                {abOffers.length > 2 && (
                  <Button variant="ghost" size="icon" className="mb-0.5 text-destructive" onClick={() => removeAbOffer(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {abOffers.length < 3 && (
              <Button variant="outline" size="sm" onClick={addAbOffer} className="border-dashed border-border text-muted-foreground">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Offer
              </Button>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Method</Label>
          <RadioGroup value={offerMethod} onValueChange={setOfferMethod} className="flex gap-4">
            <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${offerMethod === "redirect" ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
              <RadioGroupItem value="redirect" className="sr-only" />
              Redirect
            </label>
          </RadioGroup>
        </div>
      </section>

      {/* BLOCK 4: Target */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Target</h2>
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-200/80">We recommend selecting all countries for TikTok campaigns.</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Countries</Label>
          <div className="relative">
            <Input
              placeholder="Search countries..."
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
          <Label className="text-xs text-muted-foreground">Devices</Label>
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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tags</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Press Enter to add a tag</Label>
          <Input placeholder="Type a tag and press Enter..." className="bg-secondary border-border" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                {t}
                <button type="button" onClick={() => removeTag(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate("/campaigns")}>Cancel</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isFormValid}>
          {saveMutation.isPending ? "Saving..." : "Save Campaign"}
        </Button>
      </div>
    </div>
  );
}
