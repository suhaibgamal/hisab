-- Fix transaction status consistency and add proper settlement validation

-- 1. First standardize the transaction status types
ALTER TABLE public.transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check
CHECK (status = ANY (ARRAY['active'::text, 'voided'::text, 'pending'::text, 'rejected'::text]));

-- 2. Add amount validation to settlements
CREATE OR REPLACE FUNCTION public.add_settlement(
  p_group_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_description text DEFAULT 'Settlement Proposal'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from_user_id uuid := get_current_user_app_id();
  v_transaction_id uuid;
  v_to_user_name text;
  v_current_debt numeric;
BEGIN
  -- Basic validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be positive';
  END IF;

  IF v_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'You cannot settle a debt with yourself';
  END IF;

  -- Membership validation
  IF NOT EXISTS (
    SELECT 1 FROM group_members 
    WHERE group_id = p_group_id AND user_id = v_from_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM group_members 
    WHERE group_id = p_group_id AND user_id = p_to_user_id
  ) THEN
    RAISE EXCEPTION 'Both users must be members of the group';
  END IF;

  -- Check if there's already a pending settlement between these users
  IF EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.group_id = p_group_id 
    AND t.type = 'settlement'
    AND t.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM transaction_splits ts1
      WHERE ts1.transaction_id = t.id
      AND ts1.user_id = v_from_user_id
    )
    AND EXISTS (
      SELECT 1 FROM transaction_splits ts2
      WHERE ts2.transaction_id = t.id
      AND ts2.user_id = p_to_user_id
    )
  ) THEN
    RAISE EXCEPTION 'There is already a pending settlement between these users';
  END IF;

  -- Calculate actual debt between users
  SELECT COALESCE(SUM(ts.amount), 0)
  INTO v_current_debt
  FROM transactions t
  JOIN transaction_splits ts ON t.id = ts.transaction_id
  WHERE t.group_id = p_group_id
  AND t.status = 'active'
  AND ts.user_id = v_from_user_id;

  -- Validate settlement amount against actual debt
  IF ABS(p_amount) > ABS(v_current_debt) THEN
    RAISE EXCEPTION 'Settlement amount (%) exceeds actual debt (%)', p_amount, ABS(v_current_debt);
  END IF;

  -- Create the settlement transaction
  INSERT INTO transactions (
    group_id, 
    type, 
    created_by, 
    description, 
    status
  )
  VALUES (
    p_group_id, 
    'settlement', 
    v_from_user_id, 
    p_description, 
    'pending'
  )
  RETURNING id INTO v_transaction_id;

  -- Create the splits with proper precision
  INSERT INTO transaction_splits (
    transaction_id, 
    user_id, 
    amount
  )
  VALUES
    (v_transaction_id, v_from_user_id, ROUND(abs(p_amount), 2)),
    (v_transaction_id, p_to_user_id, ROUND(-abs(p_amount), 2));

  -- Log the activity
  SELECT display_name INTO v_to_user_name 
  FROM users 
  WHERE id = p_to_user_id;

  INSERT INTO activity_logs (
    group_id, 
    user_id, 
    action_type, 
    payload
  )
  VALUES (
    p_group_id, 
    v_from_user_id, 
    'settlement_proposed', 
    jsonb_build_object(
      'amount', p_amount,
      'to_user_id', p_to_user_id,
      'to_user_name', v_to_user_name,
      'transaction_id', v_transaction_id
    )
  );

  RETURN v_transaction_id;
END;
$$; 