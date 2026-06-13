-- Fix 1: Revoke public access to process_billing_renewals
REVOKE EXECUTE ON FUNCTION public.process_billing_renewals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_billing_renewals() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_billing_renewals() FROM anon;
GRANT EXECUTE ON FUNCTION public.process_billing_renewals() TO service_role;