

## Plan: Export Schema and Reconfigure for External Supabase

### What You Need to Do (Manual Steps)

1. Create/open your Supabase project at supabase.com
2. Run the exported SQL script (generated in Step 1 below) in the SQL Editor
3. Create the auth trigger separately (it touches the `auth` schema)
4. Copy your project's URL, anon key, and project ID from Settings > API
5. Add Edge Function secrets in Settings > Edge Functions
6. Provide the new credentials so I can update the codebase

### What I Will Do

**Step 1: Generate complete SQL export file**

Export to `/mnt/documents/cloakguard_schema.sql` containing:
- 3 enum types: `app_role`, `device_type`, `action_taken`
- 9 tables: `profiles`, `campaigns`, `domains`, `requests_log`, `blocked_ips`, `ip_cache`, `invite_codes`, `promo_codes`, `user_roles`
- RLS enabled on all tables except `ip_cache` (intentionally open for service_role VPS access)
- 28 RLS policies
- 13 database functions (including `has_role`, `handle_new_user`, `protect_privileged_profile_columns`, admin functions, promo/invite functions)
- 3 triggers: `protect_profile_privileged_cols`, `update_profiles_updated_at`, `on_auth_user_created`
- No realtime publications currently active

**Step 2: Generate separate auth trigger script**

The `on_auth_user_created` trigger attaches to `auth.users` and cannot be created via migrations. I'll include it as a clearly labeled separate block in the SQL file.

**Step 3: Update frontend environment variables**

Once you provide credentials, update `.env` and `src/integrations/supabase/client.ts` references:
- `VITE_SUPABASE_URL` → your project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` → your anon key
- `VITE_SUPABASE_PROJECT_ID` → your project ID

**Step 4: Delete the `filter` Edge Function from codebase**

Remove `supabase/functions/filter/` entirely since the cloaking engine now runs on your VPS. The remaining 7 Edge Functions stay:
- `register`, `add-custom-hostname`, `check-hostname-status`, `delete-custom-hostname`, `verify-domain`, `verify-domains-cron`, `cron-billing-reset`
- (`cf-api-test` also exists — will keep it as a utility)

**Step 5: Update CloakTest page**

`src/pages/CloakTest.tsx` currently calls `supabase.functions.invoke("filter", ...)`. This needs to be updated to call your VPS endpoint instead, or be disabled/removed. I'll need your VPS filter endpoint URL.

### Secrets to Configure in Your New Project

These must be added in your Supabase dashboard under Settings > Edge Functions > Secrets:
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_EMAIL`
- `IPINFO_API_KEY` (if still used by any remaining function)
- `PROXYCHECK_API_KEY` (if still used)
- `CRON_SECRET`

### Important Notes

- **Data is NOT migrated** — only schema. Export data separately if needed.
- **Auth users** must be re-created (re-register or use Admin API).
- The VPS will use `service_role` key to bypass RLS on `campaigns`, `requests_log`, `ip_cache`, and `blocked_ips` — this is correct and expected.
- `ip_cache` has RLS disabled, which is fine since only the VPS accesses it.

