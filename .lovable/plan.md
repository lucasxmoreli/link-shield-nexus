

## Campaign Link Creation Modal - File Locations

I've analyzed the codebase to locate both frontend and backend configurations for the campaign link creation modal shown in your screenshot.

### Frontend Configuration

**Main File: `src/pages/Campaigns.tsx`**

This file contains the complete implementation of the campaign link modal:

**Key Sections:**
- **Lines 29-31**: State management for modal (open/close, hash, selected domain, copy status)
- **Lines 43-51**: Domain fetching query (gets verified domains from database)
- **Lines 74-78**: `getFullLink()` function - builds the final URL combining domain + `/c/` + hash
- **Lines 80-84**: `openLinkModal()` - opens modal and sets default domain
- **Lines 86-96**: `handleCopyLink()` - copies link to clipboard and shows success toast
- **Lines 153-210**: Modal UI with Dialog component containing:
  - Domain selector (dropdown with verified domains)
  - Campaign URL field (read-only, shows generated link)
  - Copy Link button

**URL Format Logic (Line 74-78):**
```typescript
const getFullLink = () => {
  const base = (selectedDomain || defaultBase).trim().replace(/\/+$/, "");
  const domain = base.startsWith("http") ? base : `https://${base}`;
  return `${domain}/c/${linkModal.hash}`;
};
```

### Backend Configuration

**1. Database Tables:**
- `campaigns` table - stores hash, name, URLs, targeting rules
- `domains` table - stores custom domains with verification status

**2. Route Handler: `src/pages/CampaignRedirect.tsx`**
- Handles the `/c/:hash` route that users visit
- Lines 16-56: Main redirect logic
  - Fetches visitor IP via ipify.org API
  - Captures User-Agent and Referer
  - Calls the filter Edge Function
  - Redirects to the URL returned by the filtering engine

**3. Edge Function: `supabase/functions/filter/index.ts`**
- The core backend logic for processing campaign links
- Receives: campaign hash, IP, user agent, referer
- Returns: destination URL (offer or safe page) based on filtering rules
- Key processing steps:
  - Campaign validation (lines 45-57)
  - Click limit check (lines 59-71)
  - Bot detection via User-Agent (lines 100-104)
  - Proxy/VPN detection via Proxycheck.io (lines 106-120)
  - Datacenter detection via IPinfo.io (lines 122-141)
  - Request logging and click counting (lines 74-94, 143-151)

### Data Flow

1. User clicks copy icon → `openLinkModal()` triggered
2. Modal fetches verified domains from `domains` table
3. User selects domain (or uses default)
4. `getFullLink()` generates: `https://[domain]/c/[hash]`
5. User clicks "Copy Link" → clipboard + toast notification
6. When someone visits link → `CampaignRedirect.tsx` loads
7. Redirect component calls `/filter` Edge Function
8. Edge Function processes request and returns destination URL
9. Browser redirects to final destination via `window.location.replace()`

### Related Configuration Files

- `src/components/ui/dialog.tsx` - Dialog component used for modal
- `src/components/ui/select.tsx` - Domain dropdown selector
- `src/integrations/supabase/client.ts` - Supabase client configuration
- `src/App.tsx` - Route definition for `/c/:hash` → `CampaignRedirect`

