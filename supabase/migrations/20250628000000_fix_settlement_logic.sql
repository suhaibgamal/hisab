-- MIGRATION to fix the core settlement logic.
-- The signs for the transaction splits were inverted, causing debt to double.

create or replace function public.add_settlement(
  p_group_id uuid,
  p_to_user_id uuid,
  p_amount numeric,
  p_description text default 'Settlement'
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

  -- *** THE FIX IS HERE ***
  -- The user paying off a debt (from_user_id) should have their balance INCREASE (become less negative).
  -- The user receiving the payment (to_user_id) should have their balance DECREASE (become less positive).
  insert into transaction_splits (transaction_id, user_id, amount)
  values
    (v_transaction_id, v_from_user_id, abs(p_amount)),   -- Corrected sign
    (v_transaction_id, p_to_user_id, -abs(p_amount));  -- Corrected sign

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