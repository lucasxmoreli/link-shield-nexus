import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PostbackParam {
  key: string;
  value: string;
  isCustom: boolean;
}

const POSTBACK_MACROS = ["{click_id}", "{campaign_id}", "{ip}", "{country}", "{device}", "{cost}", "{timestamp}"];

interface WebhookPostbackConfigProps {
  postbackBaseUrl: string;
  onPostbackBaseUrlChange: (v: string) => void;
  postbackParams: PostbackParam[];
  onPostbackParamsChange: (v: PostbackParam[]) => void;
  postbackMethod: "GET" | "POST";
  onPostbackMethodChange: (v: "GET" | "POST") => void;
  postbackPreview: string;
}

export default function WebhookPostbackConfig({
  postbackBaseUrl,
  onPostbackBaseUrlChange,
  postbackParams,
  onPostbackParamsChange,
  postbackMethod,
  onPostbackMethodChange,
  postbackPreview,
}: WebhookPostbackConfigProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-primary/20 bg-[hsl(var(--card))] p-6 space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("campaignEdit.webhookTitle")}
          <Badge variant="secondary" className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/20 uppercase tracking-wider">
            {t("common.advanced")}
          </Badge>
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {t("campaignEdit.webhookDesc")}
        </p>
      </div>

      {/* Base URL */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.webhookBaseUrl")}</Label>
        <Input
          placeholder="https://tracker.com/postback"
          className="bg-secondary border-border font-mono text-xs"
          value={postbackBaseUrl}
          onChange={(e) => onPostbackBaseUrlChange(e.target.value)}
        />
      </div>

      {/* Query Parameters */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.webhookParams")}</Label>
        <div className="space-y-2">
          {postbackParams.map((param, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                placeholder={t("campaignEdit.paramKey")}
                className="bg-secondary border-border font-mono text-xs w-28 shrink-0"
                value={param.key}
                onChange={(e) => {
                  const updated = [...postbackParams];
                  updated[index] = { ...updated[index], key: e.target.value };
                  onPostbackParamsChange(updated);
                }}
              />
              {param.isCustom ? (
                <Input
                  placeholder={t("campaignEdit.paramValue")}
                  className="bg-secondary border-border font-mono text-xs flex-1"
                  value={param.value}
                  onChange={(e) => {
                    const updated = [...postbackParams];
                    updated[index] = { ...updated[index], value: e.target.value };
                    onPostbackParamsChange(updated);
                  }}
                />
              ) : (
                <Select
                  value={param.value || "__placeholder__"}
                  onValueChange={(val) => {
                    const updated = [...postbackParams];
                    if (val === "__custom__") {
                      updated[index] = { ...updated[index], isCustom: true, value: "" };
                    } else if (val !== "__placeholder__") {
                      updated[index] = { ...updated[index], value: val, isCustom: false };
                    }
                    onPostbackParamsChange(updated);
                  }}
                >
                  <SelectTrigger className="bg-secondary border-border font-mono text-xs flex-1">
                    <SelectValue placeholder={t("campaignEdit.selectMacro")} />
                  </SelectTrigger>
                  <SelectContent>
                    {POSTBACK_MACROS.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">
                        {m}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__" className="text-xs italic text-muted-foreground">
                      ✏ {t("campaignEdit.customValue")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={postbackParams.length === 1}
                onClick={() => onPostbackParamsChange(postbackParams.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs mt-1"
          onClick={() => onPostbackParamsChange([...postbackParams, { key: "", value: "", isCustom: false }])}
        >
          <Plus className="h-3.5 w-3.5" /> {t("campaignEdit.addParam")}
        </Button>
      </div>

      {/* Live Preview */}
      {postbackPreview && (
        <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
          <p className="text-xs font-mono text-primary break-all leading-relaxed">{postbackPreview}</p>
        </div>
      )}

      {/* Method */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("campaignEdit.webhookMethod")}</Label>
        <div className="flex gap-2">
          {(["GET", "POST"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPostbackMethodChange(m)}
              className={`rounded-lg border px-5 py-2 text-sm font-medium transition-colors ${
                postbackMethod === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("campaignEdit.webhookMethodDesc")}
        </p>
      </div>
    </section>
  );
}
