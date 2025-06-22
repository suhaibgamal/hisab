-- Migration: Ensure payment activity logs include group currency
-- Date: 2025-07-10

-- 1. Update create_payment to log currency
CREATE OR REPLACE FUNCTION public.create_payment(
  p_group_id uuid,
  p_description text,
  p_splits jsonb[],
  p_payment_date timestamptz default now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid := get_current_user_app_id();
  v_transaction_id uuid;
  v_split jsonb;
  payer_split jsonb;
  payer_amount numeric;
  v_currency text;
begin
  -- Authorization: Ensure the current user is a member of the group.
  if not exists (
    select 1 from group_members where group_id = p_group_id and user_id = v_user_id
  ) then
    raise exception 'User is not a member of this group';
  end if;

  -- Fetch group currency
  select currency into v_currency from groups where id = p_group_id;
  if v_currency is null then
    v_currency := 'USD';
  end if;

  -- Insert the main transaction record.
  insert into transactions (group_id, type, created_by, description, status, created_at)
  values (p_group_id, 'payment', v_user_id, p_description, 'active', p_payment_date)
  returning id into v_transaction_id;

  -- Insert the transaction splits.
  foreach v_split in array p_splits loop
    insert into transaction_splits (transaction_id, user_id, amount)
    values (v_transaction_id, (v_split->>'user_id')::uuid, (v_split->>'amount')::numeric);
  end loop;

  payer_split := p_splits[1];
  payer_amount := (payer_split->>'amount')::numeric;

  -- Log the activity with currency
  insert into activity_logs (group_id, user_id, action_type, payload)
  values (
    p_group_id,
    v_user_id,
    'payment_added',
    jsonb_build_object(
      'amount', payer_amount,
      'description', p_description,
      'transaction_id', v_transaction_id,
      'currency', v_currency
    )
  );

  return v_transaction_id;
end;
$$;

-- 2. Update void_payment_securely to log currency
CREATE OR REPLACE FUNCTION public.void_payment_securely(
  p_group_id uuid,
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_current_user_id uuid := get_current_user_app_id();
  v_transaction record;
  v_user_role text;
  v_payer_amount numeric;
  v_currency text;
begin
  -- Fetch payment details to ensure it exists and is a payment.
  select * into v_transaction
  from transactions
  where id = p_payment_id and group_id = p_group_id and type = 'payment';

  if v_transaction is null then
    raise exception 'Payment not found or not a valid payment type.';
  end if;

  -- Check if the payment is already voided.
  if v_transaction.status = 'voided' then
    raise exception 'This payment has already been voided.';
  end if;

  -- Get the current user's role in the group.
  select role into v_user_role
  from group_members
  where group_id = p_group_id and user_id = v_current_user_id;

  -- Authorization check: User must be the creator or a group manager.
  if v_transaction.created_by <> v_current_user_id and v_user_role <> 'manager' then
    raise exception 'User is not authorized to void this payment';
  end if;

  -- Mark the payment as voided.
  update transactions
  set status = 'voided'
  where id = p_payment_id;

  -- To get the amount for logging, we find the positive split.
  select amount into v_payer_amount
  from transaction_splits
  where transaction_id = p_payment_id and amount > 0
  limit 1;

  -- Fetch group currency
  select currency into v_currency from groups where id = p_group_id;
  if v_currency is null then
    v_currency := 'USD';
  end if;

  -- Log the deletion activity with currency
  insert into activity_logs (group_id, user_id, action_type, payload)
  values (
    p_group_id,
    v_current_user_id,
    'payment_deleted',
    jsonb_build_object(
      'amount', v_payer_amount,
      'description', v_transaction.description,
      'payment_id', p_payment_id,
      'currency', v_currency
    )
  );
end;
$$; 