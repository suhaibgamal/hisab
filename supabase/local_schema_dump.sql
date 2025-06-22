

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_tle";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."privacy_level" AS ENUM (
    'public',
    'private',
    'invite_only'
);


ALTER TYPE "public"."privacy_level" OWNER TO "postgres";


CREATE TYPE "public"."visibility_level" AS ENUM (
    'all',
    'managers'
);


ALTER TYPE "public"."visibility_level" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  auth_id UUID;
BEGIN
  SELECT supabase_auth_id INTO auth_id FROM public.users WHERE id = user_id_param;
  RETURN auth_id;
END;
$$;


ALTER FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_settlement"("p_group_id" "uuid", "p_to_user_id" "uuid", "p_amount" numeric, "p_description" "text" DEFAULT 'Settlement Proposal'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."add_settlement"("p_group_id" "uuid", "p_to_user_id" "uuid", "p_amount" numeric, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_group_debts"("p_group_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."calculate_group_debts"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Security Check: Ensure the current user is the initiator of the settlement
  -- and that the settlement is still in 'pending' status
  IF NOT EXISTS (
    SELECT 1
    FROM public.settlements
    WHERE id = settlement_id_to_cancel
    AND from_user_id = public.get_current_user_app_id()
    AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'User is not authorized to cancel this settlement or settlement is not pending.';
  END IF;
  
  -- Update the settlement status
  UPDATE public.settlements
  SET 
    status = 'cancelled',
    cancelled_at = now()
  WHERE id = settlement_id_to_cancel;
END;
$$;


ALTER FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_group_member_role"("p_group_id" "uuid", "p_target_user_id" "uuid", "p_new_role" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_creator_id uuid;
  v_target_role text;
  v_group_name text;
BEGIN
  -- Get the current user's ID (the actor)
  v_actor_id := public.get_current_user_app_id();

  -- Get the actor's role in the group
  SELECT role INTO v_actor_role FROM public.group_members WHERE group_id = p_group_id AND user_id = v_actor_id;
  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('error', 'You are not a member of this group');
  END IF;

  -- Get the group creator
  SELECT creator_id, name INTO v_creator_id, v_group_name FROM public.groups WHERE id = p_group_id;
  IF v_creator_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found');
  END IF;

  -- Get the target user's current role
  SELECT role INTO v_target_role FROM public.group_members WHERE group_id = p_group_id AND user_id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('error', 'Target user is not a member of this group');
  END IF;

  -- Prevent changing own role
  IF v_actor_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'You cannot change your own role');
  END IF;

  -- Only allow valid roles
  IF p_new_role NOT IN ('manager', 'member') THEN
    RETURN jsonb_build_object('error', 'Invalid role');
  END IF;

  -- Permission logic
  IF v_actor_id = v_creator_id THEN
    -- Creator can promote/demote anyone except themselves
    NULL; -- allowed
  ELSIF v_actor_role = 'manager' THEN
    -- Managers can only promote members to manager (if allowed), never demote managers
    IF v_target_role = 'manager' THEN
      RETURN jsonb_build_object('error', 'Managers cannot change the role of other managers');
    END IF;
    IF p_new_role != 'manager' THEN
      RETURN jsonb_build_object('error', 'Managers can only promote members to manager');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'You do not have permission to change roles');
  END IF;

  -- If no change needed
  IF v_target_role = p_new_role THEN
    RETURN jsonb_build_object('success', true, 'message', 'No change needed');
  END IF;

  -- Update the role
  UPDATE public.group_members SET role = p_new_role WHERE group_id = p_group_id AND user_id = p_target_user_id;

  -- Log the action
  INSERT INTO public.activity_logs (
    group_id, user_id, action_type, payload
  ) VALUES (
    p_group_id,
    v_actor_id,
    CASE WHEN p_new_role = 'manager' THEN 'promote_member' ELSE 'demote_manager' END,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'target_old_role', v_target_role,
      'target_new_role', p_new_role,
      'group_name', v_group_name
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Role updated');
END;
$$;


ALTER FUNCTION "public"."change_group_member_role"("p_group_id" "uuid", "p_target_user_id" "uuid", "p_new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_group_exists"("group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = group_id
  );
END;
$$;


ALTER FUNCTION "public"."check_group_exists"("group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_settlement"("p_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."confirm_settlement"("p_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_group_id UUID;
    v_invite_code TEXT;
    v_hashed_password TEXT;
BEGIN
    -- Validation
    IF LENGTH(p_name) < 3 OR LENGTH(p_name) > 50 THEN
        RAISE EXCEPTION 'Group name must be between 3 and 50 characters.';
    END IF;

    IF p_privacy_level = 'private' AND (p_password IS NULL OR LENGTH(p_password) < 8) THEN
        RAISE EXCEPTION 'Private groups require a password of at least 8 characters.';
    END IF;

    -- Generate secure assets
    v_invite_code := random_string(8);
    IF p_password IS NOT NULL THEN
        v_hashed_password := crypt(p_password, gen_salt('bf'));
    ELSE
        v_hashed_password := NULL;
    END IF;
    
    -- Insert new group with all correct fields and types
    INSERT INTO public.groups (
        name,
        description,
        creator_id,
        password,
        member_limit,
        invite_code,
        privacy_level,
        activity_log_privacy,
        export_control
    )
    VALUES (
        p_name,
        p_description,
        p_user_id,
        v_hashed_password,
        p_member_limit,
        v_invite_code,
        p_privacy_level::public.privacy_level,
        p_activity_log_privacy::public.visibility_level,
        p_export_control::public.visibility_level
    )
    RETURNING id INTO v_group_id;

    -- Add creator as the first member (manager)
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, p_user_id, 'manager');
    
    -- Log the activity
    INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
    VALUES (v_group_id, p_user_id, 'group_created', jsonb_build_object('group_name', p_name));

    -- Return the new group's ID and invite code
    RETURN jsonb_build_object('group_id', v_group_id, 'invite_code', v_invite_code);
END;
$$;


ALTER FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_payment"("p_group_id" "uuid", "p_description" "text", "p_splits" "jsonb"[], "p_payment_date" timestamp with time zone DEFAULT "now"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_payment"("p_group_id" "uuid", "p_description" "text", "p_splits" "jsonb"[], "p_payment_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_profile"("p_username" "text", "p_display_name" "text", "p_supabase_auth_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_user_profile jsonb;
BEGIN
  -- Input validation (can be kept or simplified as needed)
  IF NOT (p_username ~ '^[a-z0-9_]{3,30}$') THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only lowercase letters, numbers, and underscores';
  END IF;

  IF length(p_display_name) < 1 OR length(p_display_name) > 50 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 50 characters';
  END IF;

  -- Insert the new user profile
  INSERT INTO public.users (username, display_name, supabase_auth_id)
  VALUES (p_username, p_display_name, p_supabase_auth_id)
  RETURNING (
    jsonb_build_object(
      'id', id,
      'username', username,
      'display_name', display_name,
      'supabase_auth_id', supabase_auth_id
    )
  ) INTO v_user_profile;

  RETURN v_user_profile;
END;
$_$;


ALTER FUNCTION "public"."create_user_profile"("p_username" "text", "p_display_name" "text", "p_supabase_auth_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Security Check: Ensure the current user is the payer of the payment
  IF NOT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE id = payment_id_to_delete
    AND payer_id = public.get_current_user_app_id()
  ) THEN
    RAISE EXCEPTION 'User is not authorized to delete this payment or payment does not exist.';
  END IF;

  -- Delete the associated beneficiaries first
  DELETE FROM public.payment_beneficiaries
  WHERE payment_id = payment_id_to_delete;
  
  -- Delete the main payment record
  DELETE FROM public.payments
  WHERE id = payment_id_to_delete;
END;
$$;


ALTER FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_app_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT id FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_current_user_app_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT auth.uid();
$$;


ALTER FUNCTION "public"."get_current_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_group_details"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS TABLE("group_id" "uuid", "group_name" "text", "group_password" "text", "group_manager_id" "uuid", "group_invite_code" "text", "group_invite_code_visible" boolean, "group_member_limit" integer, "group_created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Check if the user is a member of the group
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
    AND gm.user_id = p_user_id
  ) THEN
    -- If not a member, check if the group is public (no password)
    IF NOT EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = p_group_id
      AND g.password IS NULL
    ) THEN
      -- If private and not a member, return no rows
      RETURN;
    END IF;
  END IF;

  -- Return group details with explicit column aliases
  RETURN QUERY
  SELECT 
    g.id AS group_id,
    g.name AS group_name,
    g.password AS group_password,
    g.manager_id AS group_manager_id,
    g.invite_code AS group_invite_code,
    g.invite_code_visible AS group_invite_code_visible,
    g.member_limit AS group_member_limit,
    g.created_at AS group_created_at
  FROM public.groups g
  WHERE g.id = p_group_id;
END;
$$;


ALTER FUNCTION "public"."get_group_details"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") RETURNS TABLE("group_id" "uuid", "group_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    g.id as group_id,
    g.name as group_name
  FROM
    public.groups g
  JOIN
    public.group_members gm ON g.id = gm.group_id
  WHERE
    gm.user_id = p_user_id;
$$;


ALTER FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_simplified_debts_for_group"("p_group_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."get_simplified_debts_for_group"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = group_id_param
    AND gm.user_id = public.get_current_user_app_id()
  );
END;
$$;


ALTER FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_manager"("group_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_id_param
    AND g.manager_id = public.get_current_user_app_id()
  );
END;
$$;


ALTER FUNCTION "public"."is_group_manager"("group_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_member_of"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_group_securely"("p_user_id" "uuid", "p_group_identifier" "text", "p_password" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_group_id uuid;
  v_group_password text;
  v_is_member boolean;
  v_member_count int;
  v_member_limit int;
BEGIN
  -- 1. Resolve group by UUID or invite code
  SELECT id, password, member_limit INTO v_group_id, v_group_password, v_member_limit
  FROM groups
  WHERE id::text = p_group_identifier OR invite_code = p_group_identifier;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found');
  END IF;

  -- 2. Check if already a member
  SELECT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = p_user_id
  ) INTO v_is_member;

  IF v_is_member THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already a member', 'group_id', v_group_id);
  END IF;

  -- 3. Check member limit
  IF v_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count FROM group_members WHERE group_id = v_group_id;
    IF v_member_count >= v_member_limit THEN
      RETURN jsonb_build_object('error', 'Group member limit reached');
    END IF;
  END IF;

  -- 4. If group has a password, check it
  IF v_group_password IS NOT NULL THEN
    IF NOT (v_group_password = crypt(p_password, v_group_password)) THEN
      RETURN jsonb_build_object('error', 'Invalid password');
    END IF;
  END IF;

  -- 5. Add the user to the group
  INSERT INTO group_members (group_id, user_id)
  VALUES (v_group_id, p_user_id);

  -- 6. Log the join in activity_logs
  INSERT INTO activity_logs (group_id, user_id, action_type, payload)
  VALUES (v_group_id, p_user_id, 'member_joined', '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'message', 'Joined group', 'group_id', v_group_id);
END;
$$;


ALTER FUNCTION "public"."join_group_securely"("p_user_id" "uuid", "p_group_identifier" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_kicker_id uuid;
  v_kicker_role text;
  v_kickee_role text;
  v_group_name text;
BEGIN
  -- Get the current user's ID
  SELECT public.get_current_user_app_id() INTO v_kicker_id;
  -- Get roles
  SELECT role INTO v_kicker_role FROM public.group_members WHERE group_id = p_group_id AND user_id = v_kicker_id;
  SELECT role INTO v_kickee_role FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
  -- Get group name
  SELECT name INTO v_group_name FROM public.groups WHERE id = p_group_id;
  -- Check permissions
  IF v_kicker_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;
  IF v_kicker_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can kick members';
  END IF;
  IF v_kickee_role = 'manager' THEN
    RAISE EXCEPTION 'Cannot kick a manager';
  END IF;
  -- Delete the member
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
  -- Log the kick action
  INSERT INTO public.activity_logs (
    group_id, user_id, action_type, payload
  ) VALUES (
    p_group_id,
    v_kicker_id,
    'kick_member',
    jsonb_build_object(
      'target_user_id', p_user_to_kick_id,
      'target_role', v_kickee_role,
      'group_name', v_group_name
    )
  );
END;
$$;


ALTER FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_group"("p_group_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor_id uuid;
  v_creator_id uuid;
  v_group_name text;
  v_is_member boolean;
BEGIN
  -- Get the current user's ID (the actor)
  v_actor_id := public.get_current_user_app_id();

  -- Check if the user is a member
  SELECT EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_actor_id
  ) INTO v_is_member;
  IF NOT v_is_member THEN
    RETURN jsonb_build_object('error', 'You are not a member of this group');
  END IF;

  -- Get the group creator
  SELECT creator_id, name INTO v_creator_id, v_group_name FROM public.groups WHERE id = p_group_id;

  IF v_creator_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found');
  END IF;

  -- Prevent the creator from leaving their own group
  IF v_actor_id = v_creator_id THEN
    RETURN jsonb_build_object('error', 'The group creator cannot leave their own group');
  END IF;

  -- Remove the user from the group
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = v_actor_id;

  -- Log the action
  INSERT INTO public.activity_logs (
    group_id, user_id, action_type, payload
  ) VALUES (
    p_group_id,
    v_actor_id,
    'member_left',
    jsonb_build_object(
      'group_name', v_group_name
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'You have left the group');
END;
$$;


ALTER FUNCTION "public"."leave_group"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."random_string"("size" integer, "alphabet" "text" DEFAULT '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    id_builder TEXT := '';
    i INT := 0;
    bytes BYTEA;
    char_code INT;
    alphabet_len INT := LENGTH(alphabet);
BEGIN
    bytes := gen_random_bytes(size);
    WHILE i < size LOOP
        char_code := GET_BYTE(bytes, i);
        id_builder := id_builder || SUBSTRING(alphabet FROM (char_code % alphabet_len) + 1 FOR 1);
        i := i + 1;
    END LOOP;
    RETURN id_builder;
END;
$$;


ALTER FUNCTION "public"."random_string"("size" integer, "alphabet" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_settlement"("p_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Verify the splits exist
  IF v_from_split IS NULL OR v_to_split IS NULL THEN
    RAISE EXCEPTION 'Invalid settlement splits.';
  END IF;

  -- Either the debtor or creditor can reject
  IF v_current_user_id <> v_from_split.user_id AND v_current_user_id <> v_to_split.user_id THEN
    RAISE EXCEPTION 'Only the debtor or creditor can reject a settlement.';
  END IF;

  -- Update status to rejected
  UPDATE transactions 
  SET status = 'rejected' 
  WHERE id = p_transaction_id;

  -- Get settlement details for logging
  SELECT abs(amount) INTO v_amount 
  FROM transaction_splits 
  WHERE transaction_id = p_transaction_id AND amount > 0;
  
  SELECT display_name INTO v_from_user_name 
  FROM users 
  WHERE id = v_settlement.created_by;

  -- Log the rejection with correct amount
  INSERT INTO activity_logs (
    group_id, 
    user_id, 
    action_type, 
    payload
  )
  VALUES (
    v_settlement.group_id, 
    v_current_user_id, 
    'settlement_rejected', 
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'from_user_name', v_from_user_name,
      'amount', v_amount
    )
  );
END;
$$;


ALTER FUNCTION "public"."reject_settlement"("p_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text", "p_privacy_level" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_internal_user_id UUID;
  v_current_member_count INT;
  v_hashed_password TEXT;
  v_updated_group JSONB;
BEGIN
  -- 1. Get internal user ID from the Supabase Auth ID
  SELECT id INTO v_internal_user_id FROM public.users WHERE supabase_auth_id = p_user_id;
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found in the system.';
  END IF;

  -- 2. Authorization: Check if the calling user is a manager of the group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_internal_user_id AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'User is not authorized to update this group''s settings.';
  END IF;

  -- 3. Validation
  IF p_name IS NOT NULL AND (LENGTH(p_name) < 3 OR LENGTH(p_name) > 50) THEN
    RAISE EXCEPTION 'Group name must be between 3 and 50 characters.';
  END IF;

  IF p_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_member_count FROM public.group_members WHERE group_id = p_group_id;
    IF p_member_limit < v_current_member_count THEN
      RAISE EXCEPTION 'Member limit cannot be less than the current number of members (%).', v_current_member_count;
    END IF;
  END IF;

  -- 4. Password logic
  IF p_privacy_level = 'public' THEN
    v_hashed_password := NULL;
  ELSIF p_password IS NOT NULL AND p_password != '' THEN
    v_hashed_password := crypt(p_password, gen_salt('bf'));
  ELSE
    SELECT password INTO v_hashed_password FROM public.groups WHERE id = p_group_id;
  END IF;

  -- 5. Update the group settings, casting to the correct ENUM types
  UPDATE public.groups
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    password = v_hashed_password,
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    activity_log_privacy = COALESCE(p_activity_log_privacy::public.visibility_level, activity_log_privacy),
    export_control = COALESCE(p_export_control::public.visibility_level, export_control),
    privacy_level = COALESCE(p_privacy_level::public.privacy_level, privacy_level)
  WHERE id = p_group_id
  RETURNING row_to_json(groups.*) INTO v_updated_group;

  -- 6. Log the activity
  INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
  VALUES (p_group_id, v_internal_user_id, 'update_settings', '{}'::jsonb);

  -- 7. Return the updated group data
  RETURN v_updated_group;
END;
$$;


ALTER FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text", "p_privacy_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."username_exists"("p_username" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE username = p_username
  );
END;
$$;


ALTER FUNCTION "public"."username_exists"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_payment_securely"("p_group_id" "uuid", "p_payment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."void_payment_securely"("p_group_id" "uuid", "p_payment_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "group_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."activity_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text"
);


ALTER TABLE "public"."transaction_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "reference_id" "uuid",
    "metadata" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'voided'::"text", 'pending'::"text", 'confirmed'::"text", 'rejected'::"text"]))),
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['payment'::"text", 'settlement'::"text", 'reversal'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."group_balances" AS
 SELECT "t"."group_id",
    "ts"."user_id",
    "sum"("ts"."amount") AS "balance"
   FROM ("public"."transaction_splits" "ts"
     JOIN "public"."transactions" "t" ON (("ts"."transaction_id" = "t"."id")))
  WHERE ("t"."status" = 'active'::"text")
  GROUP BY "t"."group_id", "ts"."user_id";


ALTER TABLE "public"."group_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_members_role_check" CHECK (("role" = ANY (ARRAY['manager'::"text", 'member'::"text"])))
);

ALTER TABLE ONLY "public"."group_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "invite_code" "text" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "password" "text",
    "member_limit" integer,
    "invite_code_visible" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "activity_log_privacy" "public"."visibility_level" DEFAULT 'managers'::"public"."visibility_level",
    "export_control" "public"."visibility_level" DEFAULT 'managers'::"public"."visibility_level",
    "privacy_level" "public"."privacy_level" DEFAULT 'public'::"public"."privacy_level" NOT NULL
);

ALTER TABLE ONLY "public"."groups" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."groups" IS 'Groups table. Note: All passwords were wiped in migration 47 due to hashing scheme update.';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "username" "text" NOT NULL,
    "supabase_auth_id" "uuid"
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "idx_activity_logs_group" ON "public"."activity_logs" USING "btree" ("group_id");



CREATE INDEX "idx_group_members_user_group" ON "public"."group_members" USING "btree" ("user_id", "group_id");



CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");



CREATE UNIQUE INDEX "users_supabase_auth_id_idx" ON "public"."users" USING "btree" ("supabase_auth_id");



CREATE OR REPLACE TRIGGER "update_groups_updated_at" BEFORE UPDATE ON "public"."groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_manager_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id");



CREATE POLICY "Allow authenticated users to see members of their own groups" ON "public"."group_members" FOR SELECT TO "authenticated" USING ("public"."is_member_of"("group_id", ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_auth_id" = "auth"."uid"()))));



CREATE POLICY "Allow authenticated users to see their own groups" ON "public"."groups" FOR SELECT TO "authenticated" USING ("public"."is_member_of"("id", ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."supabase_auth_id" = "auth"."uid"()))));



CREATE POLICY "Authenticated users can view all users" ON "public"."users" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Creator or manager can update or delete transaction splits" ON "public"."transaction_splits" USING ((EXISTS ( SELECT 1
   FROM ("public"."transactions" "t"
     JOIN "public"."group_members" "gm" ON (("t"."group_id" = "gm"."group_id")))
  WHERE (("t"."id" = "transaction_splits"."transaction_id") AND (("t"."created_by" = "public"."get_current_user_app_id"()) OR (("gm"."user_id" = "public"."get_current_user_app_id"()) AND ("gm"."role" = 'manager'::"text")))))));



CREATE POLICY "Creator or manager can update or delete transactions" ON "public"."transactions" USING ((("created_by" = "public"."get_current_user_app_id"()) OR (EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "transactions"."group_id") AND ("group_members"."user_id" = "public"."get_current_user_app_id"()) AND ("group_members"."role" = 'manager'::"text"))))));



CREATE POLICY "Managers can update their own groups" ON "public"."groups" FOR UPDATE TO "authenticated" USING ((( SELECT "gm"."role"
   FROM ("public"."group_members" "gm"
     JOIN "public"."users" "u" ON (("gm"."user_id" = "u"."id")))
  WHERE (("gm"."group_id" = "groups"."id") AND ("u"."supabase_auth_id" = "auth"."uid"()))) = 'manager'::"text")) WITH CHECK ((( SELECT "gm"."role"
   FROM ("public"."group_members" "gm"
     JOIN "public"."users" "u" ON (("gm"."user_id" = "u"."id")))
  WHERE (("gm"."group_id" = "groups"."id") AND ("u"."supabase_auth_id" = "auth"."uid"()))) = 'manager'::"text"));



CREATE POLICY "Members can create transaction splits in their groups" ON "public"."transaction_splits" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."transactions" "t"
     JOIN "public"."group_members" "gm" ON (("t"."group_id" = "gm"."group_id")))
  WHERE (("t"."id" = "transaction_splits"."transaction_id") AND ("gm"."user_id" = "public"."get_current_user_app_id"())))));



CREATE POLICY "Members can create transactions in their groups" ON "public"."transactions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "transactions"."group_id") AND ("group_members"."user_id" = "public"."get_current_user_app_id"())))));



CREATE POLICY "Members can view other members of their own groups" ON "public"."group_members" FOR SELECT USING (("group_id" IN ( SELECT "group_members_1"."group_id"
   FROM "public"."group_members" "group_members_1"
  WHERE ("group_members_1"."user_id" = "public"."get_current_user_app_id"()))));



CREATE POLICY "Members can view their own groups" ON "public"."groups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."group_members" "gm"
     JOIN "public"."users" "u" ON (("gm"."user_id" = "u"."id")))
  WHERE (("gm"."group_id" = "groups"."id") AND ("u"."supabase_auth_id" = "auth"."uid"())))));



CREATE POLICY "Members can view transaction splits in their groups" ON "public"."transaction_splits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."transactions" "t"
     JOIN "public"."group_members" "gm" ON (("t"."group_id" = "gm"."group_id")))
  WHERE (("t"."id" = "transaction_splits"."transaction_id") AND ("gm"."user_id" = "public"."get_current_user_app_id"())))));



CREATE POLICY "Members can view transactions in their groups" ON "public"."transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "transactions"."group_id") AND ("group_members"."user_id" = "public"."get_current_user_app_id"())))));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."activity_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."group_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."groups";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."transaction_splits";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."transactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_settlement"("p_group_id" "uuid", "p_to_user_id" "uuid", "p_amount" numeric, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_settlement"("p_group_id" "uuid", "p_to_user_id" "uuid", "p_amount" numeric, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_settlement"("p_group_id" "uuid", "p_to_user_id" "uuid", "p_amount" numeric, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_group_debts"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_group_debts"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_group_debts"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."change_group_member_role"("p_group_id" "uuid", "p_target_user_id" "uuid", "p_new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."change_group_member_role"("p_group_id" "uuid", "p_target_user_id" "uuid", "p_new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_group_member_role"("p_group_id" "uuid", "p_target_user_id" "uuid", "p_new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_settlement"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_settlement"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_settlement"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_payment"("p_group_id" "uuid", "p_description" "text", "p_splits" "jsonb"[], "p_payment_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_payment"("p_group_id" "uuid", "p_description" "text", "p_splits" "jsonb"[], "p_payment_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_payment"("p_group_id" "uuid", "p_description" "text", "p_splits" "jsonb"[], "p_payment_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_profile"("p_username" "text", "p_display_name" "text", "p_supabase_auth_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_profile"("p_username" "text", "p_display_name" "text", "p_supabase_auth_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_profile"("p_username" "text", "p_display_name" "text", "p_supabase_auth_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_app_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_app_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_app_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_group_details"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_group_details"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_group_details"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_simplified_debts_for_group"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_simplified_debts_for_group"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_simplified_debts_for_group"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_group_securely"("p_user_id" "uuid", "p_group_identifier" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_group_securely"("p_user_id" "uuid", "p_group_identifier" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_group_securely"("p_user_id" "uuid", "p_group_identifier" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_group"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_group"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_group"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."random_string"("size" integer, "alphabet" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."random_string"("size" integer, "alphabet" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."random_string"("size" integer, "alphabet" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_settlement"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_settlement"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_settlement"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text", "p_privacy_level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text", "p_privacy_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text", "p_privacy_level" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."void_payment_securely"("p_group_id" "uuid", "p_payment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."void_payment_securely"("p_group_id" "uuid", "p_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."void_payment_securely"("p_group_id" "uuid", "p_payment_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_splits" TO "anon";
GRANT ALL ON TABLE "public"."transaction_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_splits" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."group_balances" TO "anon";
GRANT ALL ON TABLE "public"."group_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."group_balances" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
