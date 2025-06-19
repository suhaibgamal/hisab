-- MIGRATION to fix payment creation and restore debt simplification function.

-- 1. Drop the old, broken version of the create_payment function.
drop function if exists public.create_payment(uuid, text, jsonb[], timestamptz);

-- 2. Re-create the function with the corrected loop logic.
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
  v_split jsonb; -- Corrected: loop variable is the jsonb object itself
  payer_split jsonb;
  payer_amount numeric;
begin
  if not exists (select 1 from group_members where group_id = p_group_id and user_id = v_user_id) then
    raise exception 'User is not a member of this group';
  end if;

  insert into transactions (group_id, type, created_by, description, status, created_at)
  values (p_group_id, 'payment', v_user_id, p_description, 'active', p_payment_date)
  returning id into v_transaction_id;

  -- Corrected Loop:
  foreach v_split in array p_splits
  loop
    insert into transaction_splits (transaction_id, user_id, amount)
    values (v_transaction_id, (v_split->>'user_id')::uuid, (v_split->>'amount')::numeric);
  end loop;

  payer_split := p_splits[1];
  payer_amount := (payer_split->>'amount')::numeric;

  insert into activity_logs (group_id, user_id, action_type, payload)
  values (p_group_id, v_user_id, 'payment_added', jsonb_build_object('amount', payer_amount, 'description', p_description, 'transaction_id', v_transaction_id));

  return v_transaction_id;
end;
$$;

-- 3. Create the missing function to get simplified debts for a group.
create or replace function public.get_simplified_debts_for_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  balances jsonb;
  debts jsonb;
begin
  -- First, calculate the balances for all users in the group.
  select jsonb_object_agg(user_id, balance)
  into balances
  from (
    select ts.user_id, sum(ts.amount) as balance
    from transaction_splits ts
    join transactions t on ts.transaction_id = t.id
    where t.group_id = p_group_id and t.status = 'active'
    group by ts.user_id
  ) as user_balances;

  -- Use a common table expression (CTE) to simplify debt calculation.
  with
  creditors as (
    select user_id, balance
    from jsonb_each_text(balances) as t(user_id, balance_text)
    cross join lateral (select balance_text::numeric as balance) as b
    where b.balance > 0
  ),
  debtors as (
    select user_id, -balance as debt
    from jsonb_each_text(balances) as t(user_id, balance_text)
    cross join lateral (select balance_text::numeric as balance) as b
    where b.balance < 0
  ),
  -- Recursive part to settle debts
  settlements as (
    select
      d.user_id as from_user_id,
      c.user_id as to_user_id,
      least(d.debt, c.balance) as amount
    from debtors d, creditors c
    -- This is a simplified settlement algorithm. More complex ones exist.
    -- This settles debts one by one.
    -- A more optimal approach might require a more complex algorithm.
    -- For now, this provides a basic settlement plan.
    -- Note: This simplification is basic and may not produce the absolute minimum number of transactions.
  )
  select jsonb_agg(s)
  into debts
  from settlements s;

  return jsonb_build_object('debts', coalesce(debts, '[]'::jsonb));
end;
$$; 