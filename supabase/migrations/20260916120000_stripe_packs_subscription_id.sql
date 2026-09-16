-- Separate Stripe subscription for packs (own billing cycle + charge-now).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_packs_subscription_id text;

COMMENT ON COLUMN public.profiles.stripe_packs_subscription_id IS
  'Stripe subscription id for licensed packs (kind=packs). Independent cycle from plan subscription.';
