-- MIGRATION to add new transaction statuses for two-sided settlements.

-- 1. Drop the old constraint
ALTER TABLE public.transactions
DROP CONSTRAINT transactions_status_check;

-- 2. Add the new constraint with 'pending' and 'rejected' statuses
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_status_check
CHECK (status = ANY (ARRAY['active'::text, 'voided'::text, 'pending'::text, 'rejected'::text])); 