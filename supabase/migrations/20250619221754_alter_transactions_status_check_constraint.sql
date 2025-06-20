-- Widen the allowed statuses for transactions to support the settlement lifecycle.

-- 1. Drop the existing, restrictive check constraint.
alter table public.transactions
drop constraint transactions_status_check;

-- 2. Add a new check constraint that includes all necessary settlement statuses.
alter table public.transactions
add constraint transactions_status_check
check (status = any (array['active'::text, 'voided'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text]));
