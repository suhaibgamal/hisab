-- Migration: Recreate group_balances view without SECURITY DEFINER
-- Date: 2025-07-13

DROP VIEW IF EXISTS public.group_balances;

CREATE OR REPLACE VIEW public.group_balances AS
  SELECT t.group_id,
         ts.user_id,
         SUM(ts.amount) AS balance
    FROM public.transaction_splits ts
    JOIN public.transactions t ON ts.transaction_id = t.id
   WHERE t.status = 'active'
   GROUP BY t.group_id, ts.user_id; 