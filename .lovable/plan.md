

## Plan: Add Cloudflare Education Section to Domain Modal

### Overview
Add an informational section with 3 benefit cards and a warning note inside the "Connect Domain" modal, placed between the header and the DNS instructions. Also update i18n strings in all 3 languages.

### Changes

**1. Update `src/pages/Domains.tsx`**

Inside the modal's form state (lines 254-299), insert a new section between the domain input field and the DNS steps:

- Import `Shield, Eye, Zap` icons from lucide-react (reuse existing or add new)
- Add a subtitle: "Por que a Cloudflare e obrigatoria?" (via i18n key)
- Render 3 compact cards in a vertical stack, each with an icon and text:
  1. **Ban Wave Protection** — Shield icon, explains IP hiding from ad networks
  2. **Cloaking Engine Security** — Eye icon, explains mandatory Cloudflare validation
  3. **Free SSL & DDoS Protection** — Zap icon, explains automatic SSL and DDoS
- Below the cards, a warning alert with amber/orange styling: "Domains without active Cloudflare (orange cloud) will not work with CloakGuard."
- Then the existing DNS instructions follow

The modal `max-w` will be bumped from `sm:max-w-md` to `sm:max-w-lg` to accommodate the extra content.

**2. Update i18n files (en.ts, pt.ts, es.ts)**

Add new keys under `domains`:
- `cfWhyTitle` — section title
- `cfBanWaveTitle` / `cfBanWaveDesc`
- `cfSecurityTitle` / `cfSecurityDesc`
- `cfSslTitle` / `cfSslDesc`
- `cfWarning` — the warning note

Also update DNS instruction keys to reference A record + VPS IP (`187.124.233.229`) instead of CNAME, as part of the previously approved simplification plan.

### Technical Details
- Cards use existing `rounded-lg border` pattern with a left-side icon in a colored circle
- Warning note uses `bg-orange-500/10 border-orange-500/30 text-orange-400` styling consistent with the app's dark theme
- No new components needed — all inline in the modal JSX
- No database or Edge Function changes

