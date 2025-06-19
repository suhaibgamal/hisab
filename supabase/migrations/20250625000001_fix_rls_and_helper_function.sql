-- MIGRATION to fix the RLS helper function and all dependent policies.

-- 1. Drop all RLS policies that depend on the function.
DROP POLICY IF EXISTS "Members can view other members of their own groups" ON public.group_members;
DROP POLICY IF EXISTS "Authenticated users can view all users" ON public.users;
DROP POLICY IF EXISTS "Members can view transactions in their groups" ON public.transactions;
DROP POLICY IF EXISTS "Members can create transactions in their groups" ON public.transactions;
DROP POLICY IF EXISTS "Creator or manager can update or delete transactions" ON public.transactions;
DROP POLICY IF EXISTS "Members can view transaction splits in their groups" ON public.transaction_splits;
DROP POLICY IF EXISTS "Members can create transaction splits in their groups" ON public.transaction_splits;
DROP POLICY IF EXISTS "Creator or manager can update or delete transaction splits" ON public.transaction_splits;

-- 2. Drop the old function.
DROP FUNCTION IF EXISTS public.get_current_user_app_id();

-- 3. Create the new, correct function with SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.get_current_user_app_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER -- This is the fix.
AS $$
  SELECT id FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
$$;

-- 4. Re-create all the RLS policies with the correct logic.

-- Policy for users table
CREATE POLICY "Authenticated users can view all users"
ON public.users
FOR SELECT
USING ( auth.role() = 'authenticated' );

-- Policies for group_members table
CREATE POLICY "Members can view other members of their own groups"
ON public.group_members
FOR SELECT
USING (
  group_id IN (
    SELECT group_id
    FROM public.group_members
    WHERE user_id = get_current_user_app_id()
  )
);

-- Policies for transactions table
CREATE POLICY "Members can view transactions in their groups"
ON public.transactions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.group_members
  WHERE group_id = transactions.group_id
  AND user_id = get_current_user_app_id()
));

CREATE POLICY "Members can create transactions in their groups"
ON public.transactions FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_members
  WHERE group_id = transactions.group_id
  AND user_id = get_current_user_app_id()
));

CREATE POLICY "Creator or manager can update or delete transactions"
ON public.transactions FOR ALL
USING (
  created_by = get_current_user_app_id()
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = transactions.group_id
    AND user_id = get_current_user_app_id()
    AND role = 'manager'
  )
);

-- Policies for transaction_splits table
CREATE POLICY "Members can view transaction splits in their groups"
ON public.transaction_splits FOR SELECT
USING (EXISTS (
  SELECT 1
  FROM public.transactions t
  JOIN public.group_members gm ON t.group_id = gm.group_id
  WHERE t.id = transaction_splits.transaction_id
  AND gm.user_id = get_current_user_app_id()
));

CREATE POLICY "Members can create transaction splits in their groups"
ON public.transaction_splits FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.transactions t
  JOIN public.group_members gm ON t.group_id = gm.group_id
  WHERE t.id = transaction_splits.transaction_id
  AND gm.user_id = get_current_user_app_id()
));

CREATE POLICY "Creator or manager can update or delete transaction splits"
ON public.transaction_splits FOR ALL
USING (EXISTS (
  SELECT 1
  FROM public.transactions t
  JOIN public.group_members gm ON t.group_id = gm.group_id
  WHERE t.id = transaction_splits.transaction_id
  AND (
    t.created_by = get_current_user_app_id()
    OR (gm.user_id = get_current_user_app_id() AND gm.role = 'manager')
  )
)); 