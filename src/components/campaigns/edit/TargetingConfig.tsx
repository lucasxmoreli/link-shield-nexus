import { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "BR", name: "Brazil" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "IN", name: "India" },
  { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
];

const DEVICES = ["desktop", "mobile", "tablet"] as const;

interface TargetingConfigProps {
  targetCountries: string[];
  countrySearch: string;
  onCountrySearchChange: (v: string) => void;
  countryDropdownOpen: boolean;
  onCountryDropdownOpenChange: (v: boolean) => void;
  onAddCountry: (code: string) => void;
  onRemoveCountry: (code: string) => void;
  targetDevices: string[];
  onToggleDevice: (d: string) => void;
  tags: string[];
  tagInput: string;
  onTagInputChange: (v: string) => void;
  onTagKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveTag: (t: string) => void;
}

export default function TargetingConfig({
  targetCountries,
  countrySearch,
  onCountrySearchChange,
  countryDropdownOpen,
  onCountryDropdownOpenChange,
  onAddCountry,
  onRemoveCountry,
  targetDevices,
  onToggleDevice,
  tags,
  tagInput,
  onTagInputChange,
  onTagKeyDown,
  onRemoveTag,
}: TargetingConfigProps) {
  const { t } = useTranslation();

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      !targetCountries.includes(c.code) &&
      (c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase())),
  );

  return (
    <>
      {/* BLOCK 4: Target */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("campaignEdit.targetSection")}
        </h2>
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
              onChange={(e) => {
                onCountrySearchChange(e.target.value);
                onCountryDropdownOpenChange(true);
              }}
              onFocus={() => onCountryDropdownOpenChange(true)}
              onBlur={() => setTimeout(() => onCountryDropdownOpenChange(false), 200)}
            />
            {countryDropdownOpen && filteredCountries.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {filteredCountries.slice(0, 10).map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAddCountry(c.code);
                    }}
                  >
                    <span className="font-mono text-primary mr-2">{c.code}</span>
                    {c.name}
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
                  <button type="button" onClick={() => onRemoveCountry(code)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.devices")}</Label>
          <div className="flex gap-2">
            {DEVICES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onToggleDevice(d)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${targetDevices.includes(d) ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* BLOCK 5: Tags */}
      <section className="rounded-xl bg-[hsl(var(--card))] p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("campaignEdit.tagsSection")}
        </h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("campaignEdit.tagHelper")}</Label>
          <Input
            placeholder={t("campaignEdit.tagPlaceholder")}
            className="bg-secondary border-border"
            value={tagInput}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={onTagKeyDown}
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tg) => (
              <Badge key={tg} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                {tg}
                <button type="button" onClick={() => onRemoveTag(tg)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
