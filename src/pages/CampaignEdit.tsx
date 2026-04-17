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
import { useTranslation } from "react-i18next";
import { useCampaignForm } from "@/hooks/useCampaignForm";
import CampaignFinalLinkModal from "@/components/campaigns/CampaignFinalLinkModal";

import CampaignGeneralConfig from "@/components/campaigns/edit/CampaignGeneralConfig";
import SafePageConfig from "@/components/campaigns/edit/SafePageConfig";
import OfferPageConfig from "@/components/campaigns/edit/OfferPageConfig";
import SecurityConfig from "@/components/campaigns/edit/SecurityConfig";
import WebhookPostbackConfig from "@/components/campaigns/edit/WebhookPostbackConfig";
import TargetingConfig from "@/components/campaigns/edit/TargetingConfig";

export default function CampaignEdit() {
  const { t } = useTranslation();
  const {
    meta, data, form, setters, normalizers,
    handlers, validation, save, postbackPreview, dialogs,
  } = useCampaignForm();

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => meta.navigate("/campaigns")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {meta.isCloning
            ? t("campaignEdit.cloneCampaign", "Clonar Campanha")
            : meta.isEditing
              ? t("campaignEdit.editCampaign")
              : t("campaignEdit.newCampaign")}
        </h1>
      </div>

      {/* Sections */}
      <CampaignGeneralConfig
        name={form.name} onNameChange={setters.setName}
        domain={form.domain} onDomainChange={setters.setDomain}
        trafficSource={form.trafficSource} onTrafficSourceChange={setters.setTrafficSource}
        domains={data.domains} allowedSources={data.allowedSources} hasLockedSources={data.hasLockedSources}
      />

      <SafePageConfig
        safeUrl={form.safeUrl} onSafeUrlChange={setters.setSafeUrl} onSafeUrlBlur={normalizers.normalizeSafeUrl}
      />

      <OfferPageConfig
        offerUrl={form.offerUrl} onOfferUrlChange={setters.setOfferUrl} onOfferUrlBlur={normalizers.normalizeOfferUrl}
        abStormEnabled={form.abStormEnabled} onAbStormEnabledChange={setters.setAbStormEnabled}
        offerPageB={form.offerPageB} onOfferPageBChange={setters.setOfferPageB} onOfferPageBBlur={normalizers.normalizeOfferPageB}
      />


      <WebhookPostbackConfig
        postbackBaseUrl={form.postbackBaseUrl} onPostbackBaseUrlChange={setters.setPostbackBaseUrl}
        postbackParams={form.postbackParams} onPostbackParamsChange={setters.setPostbackParams}
        postbackMethod={form.postbackMethod} onPostbackMethodChange={setters.setPostbackMethod}
        postbackPreview={postbackPreview}
      />

      <TargetingConfig
        targetCountries={form.targetCountries} countrySearch={form.countrySearch} onCountrySearchChange={setters.setCountrySearch}
        countryDropdownOpen={form.countryDropdownOpen} onCountryDropdownOpenChange={setters.setCountryDropdownOpen}
        onAddCountry={handlers.addCountry} onRemoveCountry={handlers.removeCountry}
        targetDevices={form.targetDevices} onToggleDevice={handlers.toggleDevice}
        tags={form.tags} tagInput={form.tagInput} onTagInputChange={setters.setTagInput}
        onTagKeyDown={handlers.handleTagKeyDown} onRemoveTag={handlers.removeTag}
      />

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => meta.navigate("/campaigns")}>{t("common.cancel")}</Button>
        <Button onClick={handlers.handleSave} disabled={save.isPending || !validation.isFormValid}>
          {save.isPending ? t("common.saving") : t("campaignEdit.saveCampaign")}
        </Button>
      </div>

      {/* Domain Conflict Dialog */}
      <Dialog open={dialogs.conflictDialogOpen} onOpenChange={dialogs.setConflictDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {t("campaignEdit.conflictTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-2">
              {t("campaignEdit.conflictDesc", { domain: form.domain })}
              <br /><br />
              {t("campaignEdit.conflictRecommend")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => dialogs.setConflictDialogOpen(false)}>{t("common.goBack")}</Button>
            <Button variant="destructive" onClick={handlers.forceSave}>{t("common.saveAnyway")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <CampaignFinalLinkModal campaign={dialogs.successModal} onClose={() => dialogs.setSuccessModal(null)} />
    </div>
  );
}
