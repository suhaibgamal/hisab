-- supabase/migrations/20250620000000_atomic_payment_functions.sql

-- 1. Create a function to securely create a payment and its splits in one transaction.
create or replace function public.create_payment(
  p_group_id uuid,
  p_description text,
  p_splits jsonb[],
  p_payment_date timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := get_current_user_app_id();
  v_transaction_id uuid;
  split record;
  payer_split jsonb;
  payer_amount numeric;
begin
  -- Authorization: Ensure the current user is a member of the group.
  if not exists (
    select 1
    from group_members
    where group_id = p_group_id and user_id = v_user_id
  ) then
    raise exception 'User is not a member of this group';
  end if;

  -- Insert the main transaction record.
  insert into transactions (group_id, type, created_by, description, status, created_at)
  values (p_group_id, 'payment', v_user_id, p_description, 'active', p_payment_date)
  returning id into v_transaction_id;

  -- Insert the transaction splits.
  for split in select * from unnest(p_splits) loop
    insert into transaction_splits (transaction_id, user_id, amount)
    values (v_transaction_id, (split.value->>'user_id')::uuid, (split.value->>'amount')::numeric);
  end loop;

  -- Log the activity.
  payer_split := p_splits[1]; -- Assuming the first split is the payer's positive amount.
  payer_amount := (payer_split->>'amount')::numeric;

  insert into activity_logs (group_id, user_id, action_type, payload)
  values (
    p_group_id,
    v_user_id,
    'payment_added',
    jsonb_build_object(
      'amount', payer_amount,
      'description', p_description,
      'transaction_id', v_transaction_id
    )
  );

  return v_transaction_id;
end;
$$;

-- 2. Create a corrected function to securely void a payment.
create or replace function public.void_payment_securely(
  p_group_id uuid,
  p_payment_id uuid
)
returns void
language plpgsql
security definer
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

-- 3. Create a function to securely update group settings.
create or replace function public.update_group_settings_securely(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_password text,
  p_member_limit int,
  p_invite_code_visible bool,
  p_activity_log_privacy text,
  p_export_control text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := get_current_user_app_id();
  v_user_role text;
begin
  -- Authorization: User must be a manager.
  select role into v_user_role
  from group_members
  where group_id = p_group_id and user_id = v_user_id;

  if v_user_role <> 'manager' then
    raise exception 'User must be a manager to update settings.';
  end if;
  
  -- Logic for handling password update
  if p_password is not null and p_password <> '' then
    -- If a new password is provided, update it.
    update groups
    set password = p_password
    where id = p_group_id;
  elsif p_password = '' then
    -- If the password is an empty string, set it to NULL.
    update groups
    set password = null
    where id = p_group_id;
  end if;

  -- Update other settings, ignoring password.
  update groups
  set
    name = p_name,
    description = p_description,
    member_limit = p_member_limit,
    invite_code_visible = p_invite_code_visible,
    activity_log_privacy = p_activity_log_privacy::visibility_level,
    export_control = p_export_control::visibility_level,
    updated_at = now()
  where id = p_group_id;

  -- Log the activity
  insert into activity_logs (group_id, user_id, action_type, payload)
  values (p_group_id, v_user_id, 'group_settings_updated', '{}'::jsonb);
end;
$$;

-- 4. Create a function to securely add a settlement between two users.
create or replace function public.add_settlement(
  p_group_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_user_id uuid := get_current_user_app_id();
  v_transaction_id uuid;
  v_to_user_name text;
begin
  -- Authorization: Ensure both `from` and `to` users are in the group.
  if not exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = v_from_user_id
  ) or not exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_to_user_id
  ) then
    raise exception 'Both users must be members of the group.';
  end if;

  -- Create the settlement transaction.
  insert into transactions (group_id, type, created_by, description, status)
  values (p_group_id, 'settlement', v_from_user_id, p_description, 'active')
  returning id into v_transaction_id;

  -- Create the splits.
  insert into transaction_splits (transaction_id, user_id, amount)
  values
    (v_transaction_id, v_from_user_id, -abs(p_amount)),
    (v_transaction_id, p_to_user_id, abs(p_amount));

  -- Log the activity.
  select display_name into v_to_user_name from users where id = p_to_user_id;

  insert into activity_logs (group_id, user_id, action_type, payload)
  values (
    p_group_id,
    v_from_user_id,
    'settlement_initiated',
    jsonb_build_object(
      'amount', p_amount,
      'to_user_id', p_to_user_id,
      'to_user_name', v_to_user_name
    )
  );

  return v_transaction_id;
end;
$$; 