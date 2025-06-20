-- MIGRATION to implement two-sided settlement logic

-- 1. Update `add_settlement` to create 'pending' settlements.
-- The core logic remains, but the status is now 'pending'.
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
BEGIN
  IF v_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'You cannot settle a debt with yourself.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = v_from_user_id) OR
     NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_to_user_id) THEN
    RAISE EXCEPTION 'Both users must be members of the group.';
  END IF;

  INSERT INTO transactions (group_id, type, created_by, description, status)
  VALUES (p_group_id, 'settlement', v_from_user_id, p_description, 'pending')
  RETURNING id INTO v_transaction_id;

  INSERT INTO transaction_splits (transaction_id, user_id, amount)
  VALUES
    (v_transaction_id, v_from_user_id, abs(p_amount)),
    (v_transaction_id, p_to_user_id, -abs(p_amount));

  SELECT display_name INTO v_to_user_name FROM users WHERE id = p_to_user_id;

  INSERT INTO activity_logs (group_id, user_id, action_type, payload)
  VALUES (p_group_id, v_from_user_id, 'settlement_proposed', jsonb_build_object(
      'amount', p_amount,
      'to_user_id', p_to_user_id,
      'to_user_name', v_to_user_name,
      'transaction_id', v_transaction_id
    ));

  RETURN v_transaction_id;
END;
$$;

-- 2. Create `confirm_settlement` function.
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
BEGIN
  SELECT * INTO v_settlement FROM transactions WHERE id = p_transaction_id AND type = 'settlement';

  IF v_settlement IS NULL THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  IF v_settlement.status <> 'pending' THEN
    RAISE EXCEPTION 'Settlement is not pending.';
  END IF;

  -- The creditor is the one receiving money, so they have the negative split.
  IF NOT EXISTS (
    SELECT 1 FROM transaction_splits
    WHERE transaction_id = p_transaction_id AND user_id = v_current_user_id AND amount < 0
  ) THEN
    RAISE EXCEPTION 'Only the creditor can confirm a settlement.';
  END IF;

  UPDATE transactions SET status = 'active' WHERE id = p_transaction_id;

  -- Get the settlement amount for logging
  SELECT abs(amount) INTO v_amount FROM transaction_splits WHERE transaction_id = p_transaction_id and amount > 0 limit 1;
  SELECT display_name INTO v_from_user_name FROM users WHERE id = v_settlement.created_by;

  INSERT INTO activity_logs (group_id, user_id, action_type, payload)
  VALUES (v_settlement.group_id, v_current_user_id, 'settlement_confirmed', jsonb_build_object(
      'transaction_id', p_transaction_id,
      'from_user_name', v_from_user_name,
      'amount', v_amount
    ));
END;
$$;

-- 3. Create `reject_settlement` function.
CREATE OR REPLACE FUNCTION public.reject_settlement(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid := get_current_user_app_id();
  v_settlement record;
  is_creditor boolean;
  is_debtor boolean;
  v_amount numeric;
  v_from_user_name text;
BEGIN
  SELECT * INTO v_settlement FROM transactions WHERE id = p_transaction_id AND type = 'settlement';

  IF v_settlement IS NULL THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  IF v_settlement.status <> 'pending' THEN
    RAISE EXCEPTION 'Settlement is not pending.';
  END IF;

  is_debtor := v_settlement.created_by = v_current_user_id;
  
  SELECT EXISTS (
    SELECT 1 FROM transaction_splits
    WHERE transaction_id = p_transaction_id AND user_id = v_current_user_id AND amount < 0
  ) INTO is_creditor;

  IF NOT is_debtor AND NOT is_creditor THEN
    RAISE EXCEPTION 'Only the debtor or creditor can reject a settlement.';
  END IF;
  
  UPDATE transactions SET status = 'rejected' WHERE id = p_transaction_id;
  
  -- Get settlement details for logging
  SELECT abs(amount) INTO v_amount FROM transaction_splits WHERE transaction_id = p_transaction_id and amount > 0 limit 1;
  SELECT display_name INTO v_from_user_name FROM users WHERE id = v_settlement.created_by;

  INSERT INTO activity_logs (group_id, user_id, action_type, payload)
  VALUES (v_settlement.group_id, v_current_user_id, 'settlement_rejected', jsonb_build_object(
    'transaction_id', p_transaction_id,
    'from_user_name', v_from_user_name,
    'amount', v_amount
  ));
END;
$$; 