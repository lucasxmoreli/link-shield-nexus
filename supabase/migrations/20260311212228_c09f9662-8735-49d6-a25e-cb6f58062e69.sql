-- Drop the overly permissive INSERT policy
DROP POLICY "Allow insert via service role" ON public.requests_log;

-- Replace with a user-scoped insert policy (edge function uses service role which bypasses RLS)
CREATE POLICY "Users can insert own logs" ON public.requests_log FOR INSERT WITH CHECK (auth.uid() = user_id);