-- Fix debt calculation to properly handle settlements

CREATE OR REPLACE FUNCTION public.calculate_group_debts(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  balances jsonb;
  debts jsonb;
BEGIN
  -- Calculate balances for all users in the group, considering only active transactions
  SELECT jsonb_object_agg(user_id, balance)
  INTO balances
  FROM (
    SELECT 
      ts.user_id, 
      ROUND(SUM(ts.amount)::numeric, 2) as balance
    FROM transaction_splits ts
    JOIN transactions t ON ts.transaction_id = t.id
    WHERE t.group_id = p_group_id 
    AND t.status = 'active'  -- Only consider active transactions
    GROUP BY ts.user_id
  ) as user_balances;

  -- Calculate debts between users
  WITH
  creditors AS (
    SELECT 
      user_id::uuid, 
      ROUND(balance::numeric, 2) as balance
    FROM jsonb_each_text(balances) as t(user_id, balance_text)
    CROSS JOIN LATERAL (SELECT balance_text::numeric as balance) as b
    WHERE b.balance > 0
  ),
  debtors AS (
    SELECT 
      user_id::uuid, 
      ROUND(ABS(balance)::numeric, 2) as debt
    FROM jsonb_each_text(balances) as t(user_id, balance_text)
    CROSS JOIN LATERAL (SELECT balance_text::numeric as balance) as b
    WHERE b.balance < 0
  ),
  -- Calculate settlements between users
  settlements AS (
    SELECT
      d.user_id as from_user_id,
      c.user_id as to_user_id,
      ROUND(LEAST(d.debt, c.balance)::numeric, 2) as amount
    FROM debtors d
    CROSS JOIN creditors c
    WHERE d.debt > 0 AND c.balance > 0
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'from_user_id', from_user_id,
      'to_user_id', to_user_id,
      'amount', amount
    )
  )
  INTO debts
  FROM settlements;

  RETURN jsonb_build_object('debts', COALESCE(debts, '[]'::jsonb));
END;
$$; 