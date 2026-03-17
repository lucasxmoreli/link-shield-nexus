
-- 1. Drop the current permissive user update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. Create a trigger function that prevents non-admin users from changing privileged columns
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the caller is an admin, allow all changes
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, revert privileged columns to their original values
  NEW.plan_name := OLD.plan_name;
  NEW.max_clicks := OLD.max_clicks;
  NEW.max_domains := OLD.max_domains;
  NEW.current_clicks := OLD.current_clicks;
  NEW.subscription_status := OLD.subscription_status;

  RETURN NEW;
END;
$$;

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS protect_profile_privileged_cols ON public.profiles;
CREATE TRIGGER protect_profile_privileged_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_profile_columns();

-- 4. Re-create the user update policy (owner-scoped, trigger enforces column restrictions)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
