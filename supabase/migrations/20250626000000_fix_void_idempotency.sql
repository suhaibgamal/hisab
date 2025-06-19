-- MIGRATION to make the void_payment function idempotent.

-- This replaces the existing function with a new version that prevents
-- a payment from being voided more than once.

CREATE OR REPLACE FUNCTION public.void_payment_securely(
  p_group_id uuid,
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Stays DEFINER to log activity correctly.
set search_path = public
as $$
declare
  v_current_user_id uuid := get_current_user_app_id();
  v_transaction record;
  v_user_role text;
  v_payer_amount numeric;
begin
  -- Fetch payment details to ensure it exists and is a payment.
  select * into v_transaction
  from transactions
  where id = p_payment_id and group_id = p_group_id and type = 'payment';

  if v_transaction is null then
    raise exception 'Payment not found or not a valid payment type.';
  end if;

  -- *** THIS IS THE FIX ***
  -- Check if the payment is already voided.
  if v_transaction.status = 'voided' then
    raise exception 'This payment has already been voided.';
  end if;
  -- *** END OF FIX ***

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

  -- Log the deletion activity.
  insert into activity_logs (group_id, user_id, action_type, payload)
  values (
    p_group_id,
    v_current_user_id,
    'payment_deleted',
    jsonb_build_object(
      'amount', v_payer_amount,
      'description', v_transaction.description,
      'payment_id', p_payment_id
    )
  );
end;
$$; 