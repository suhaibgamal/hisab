-- This script consolidates all RLS policies for transactions and transaction_splits.
-- It ensures that old, potentially conflicting policies are removed and the correct ones are in place.

-- Helper function to get the app-specific user ID from the auth UID.
-- This is the key to fixing the RLS policies.
CREATE OR REPLACE FUNCTION public.get_current_user_app_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  select id from public.users where supabase_auth_id = auth.uid() limit 1;
$$;


-- ------------------------------------------------------------------
-- Section 1: Drop All Existing RLS Policies to Avoid Conflicts
-- ------------------------------------------------------------------

-- Drop existing policies on transactions
DROP POLICY IF EXISTS "transactions_view_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON public.transactions;
DROP POLICY IF EXISTS "Members can view transactions in their groups" ON public.transactions;
DROP POLICY IF EXISTS "Members can create transactions in their groups" ON public.transactions;
DROP POLICY IF EXISTS "Creator or manager can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Creator or manager can delete transactions" ON public.transactions;

-- Drop existing policies on transaction_splits
DROP POLICY IF EXISTS "Members can view transaction splits in their groups" ON public.transaction_splits;
DROP POLICY IF EXISTS "Members can create transaction splits in their groups" ON public.transaction_splits;
DROP POLICY IF EXISTS "Creator or manager can update transaction splits" ON public.transaction_splits;
DROP POLICY IF EXISTS "Creator or manager can delete transaction splits" ON public.transaction_splits;

-- ------------------------------------------------------------------
-- Section 2: Enable RLS and Create Consolidated Policies
-- ------------------------------------------------------------------

-- Enable RLS on both tables (this is idempotent and safe to run)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

-- Get the app-specific user ID for the current authenticated user.
-- This variable will be used in the policies below.
-- Note: We can't use `current_setting` directly in USING clauses for security reasons,
-- so we rely on the function call.

-- Create consolidated RLS policies for the "transactions" table
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
ON public.transactions FOR ALL -- Using ALL for both UPDATE and DELETE
USING (
  created_by = get_current_user_app_id()
  OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = transactions.group_id
    AND user_id = get_current_user_app_id()
    AND role = 'manager'
  )
);

-- Create consolidated RLS policies for the "transaction_splits" table
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
ON public.transaction_splits FOR ALL -- Using ALL for both UPDATE and DELETE
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