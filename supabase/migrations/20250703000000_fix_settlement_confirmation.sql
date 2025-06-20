-- Fix settlement confirmation to properly handle amounts and status changes

CREATE OR REPLACE FUNCTION public.confirm_settlement(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := get_current_user_app_id();
  v_settlement record;
  v_from_user_name text;
  v_amount numeric;
  v_from_split record;
  v_to_split record;
BEGIN
  -- Get the settlement transaction
  SELECT * INTO v_settlement 
  FROM transactions 
  WHERE id = p_transaction_id AND type = 'settlement';

  IF v_settlement IS NULL THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  IF v_settlement.status <> 'pending' THEN
    RAISE EXCEPTION 'Settlement is not pending.';
  END IF;

  -- Get both splits to verify amounts
  SELECT * INTO v_from_split 
  FROM transaction_splits 
  WHERE transaction_id = p_transaction_id 
  AND user_id = v_settlement.created_by;

  SELECT * INTO v_to_split 
  FROM transaction_splits 
  WHERE transaction_id = p_transaction_id 
  AND user_id <> v_settlement.created_by;

  -- Verify the splits exist and have correct signs
  IF v_from_split IS NULL OR v_to_split IS NULL THEN
    RAISE EXCEPTION 'Invalid settlement splits.';
  END IF;

  IF v_from_split.amount <= 0 OR v_to_split.amount >= 0 THEN
    RAISE EXCEPTION 'Invalid settlement amounts.';
  END IF;

  -- The creditor (receiver) must confirm
  IF v_to_split.user_id <> v_current_user_id THEN
    RAISE EXCEPTION 'Only the creditor can confirm a settlement.';
  END IF;

  -- Update status to active
  UPDATE transactions 
  SET status = 'active' 
  WHERE id = p_transaction_id;

  -- Get settlement details for logging
  SELECT abs(amount) INTO v_amount 
  FROM transaction_splits 
  WHERE transaction_id = p_transaction_id AND amount > 0;
  
  SELECT display_name INTO v_from_user_name 
  FROM users 
  WHERE id = v_settlement.created_by;

  -- Log the confirmation
  INSERT INTO activity_logs (
    group_id, 
    user_id, 
    action_type, 
    payload
  )
  VALUES (
    v_settlement.group_id, 
    v_current_user_id, 
    'settlement_confirmed', 
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'from_user_name', v_from_user_name,
      'amount', v_amount
    )
  );
END;
$$; 