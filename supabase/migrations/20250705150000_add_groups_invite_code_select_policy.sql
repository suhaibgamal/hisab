-- Allow all authenticated users to select groups by invite code (for joining)
CREATE POLICY "Allow select by invite code"
ON public.groups
FOR SELECT
TO authenticated
USING (
  invite_code IS NOT NULL
); 