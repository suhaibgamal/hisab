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


CREATE OR REPLACE FUNCTION "public"."can_export_group_data"("group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_export_control TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();
  
  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;
  
  -- Get group's export control setting
  SELECT export_control INTO v_export_control 
  FROM public.groups 
  WHERE id = $1;
  
  RETURN 
    CASE v_export_control
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$_$;


ALTER FUNCTION "public"."can_export_group_data"("group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_activity_logs"("group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_privacy TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();
  
  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;
  
  -- Get group's activity log privacy setting
  SELECT activity_log_privacy INTO v_privacy 
  FROM public.groups 
  WHERE id = $1;
  
  RETURN 
    CASE v_privacy
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$_$;


ALTER FUNCTION "public"."can_view_activity_logs"("group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_group_members"("group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_visibility TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();
  
  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;
  
  -- Get group's member list visibility setting
  SELECT member_list_visibility INTO v_visibility 
  FROM public.groups 
  WHERE id = $1;
  
  RETURN 
    CASE v_visibility
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$_$;


ALTER FUNCTION "public"."can_view_group_members"("group_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_password" "text" DEFAULT NULL::"text", "p_member_limit" integer DEFAULT 10, "p_invite_code_visible" boolean DEFAULT true, "p_auto_approve_members" boolean DEFAULT true, "p_activity_log_privacy" "public"."visibility_level" DEFAULT 'managers'::"public"."visibility_level", "p_export_control" "public"."visibility_level" DEFAULT 'managers'::"public"."visibility_level", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_group_id uuid;
  v_user_id uuid;
  v_invite_code text;
  v_password_hash text;
BEGIN
  -- Get current user's ID if not provided
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  -- Validate inputs
  IF p_group_name IS NULL OR length(trim(p_group_name)) < 3 THEN
    RAISE EXCEPTION 'Group name must be at least 3 characters long';
  END IF;

  IF p_member_limit IS NOT NULL AND (p_member_limit < 2 OR p_member_limit > 100) THEN
    RAISE EXCEPTION 'Member limit must be between 2 and 100';
  END IF;

  -- Generate invite code using md5 instead of gen_random_bytes
  LOOP
    v_invite_code := upper(substring(md5(random()::text) for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = v_invite_code);
  END LOOP;

  -- Hash password if provided
  IF p_password IS NOT NULL THEN
    v_password_hash := public.hash_password(p_password);
  END IF;

  -- Create group
  INSERT INTO public.groups (
    name,
    description,
    password,
    member_limit,
    invite_code,
    invite_code_visible,
    auto_approve_members,
    activity_log_privacy,
    export_control,
    manager_id
  )
  VALUES (
    p_group_name,
    p_description,
    v_password_hash,
    p_member_limit,
    v_invite_code,
    p_invite_code_visible,
    p_auto_approve_members,
    p_activity_log_privacy,
    p_export_control,
    v_user_id
  )
  RETURNING id INTO v_group_id;

  -- Add creator as manager
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role
  )
  VALUES (
    v_group_id,
    v_user_id,
    'manager'
  );

  -- Log group creation
  INSERT INTO public.activity_logs (
    group_id,
    user_id,
    action_type,
    payload
  )
  VALUES (
    v_group_id,
    v_user_id,
    'group_created',
    jsonb_build_object(
      'group_name', p_group_name,
      'is_private', v_password_hash IS NOT NULL
    )
  );

  RETURN v_group_id;
END;
$$;


ALTER FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_with_manager"("p_activity_log_privacy" "text", "p_auto_approve_members" boolean, "p_description" "text", "p_export_control" "text", "p_group_name" "text", "p_invite_code_visible" boolean, "p_member_limit" integer, "p_member_list_visibility" "text", "p_password" "text", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_group_id uuid;
    new_invite_code text;
    v_user_display_name text;
BEGIN
    -- Get user's display name
    SELECT display_name INTO v_user_display_name
    FROM public.users
    WHERE id = p_user_id;

    -- Validate settings
    IF p_activity_log_privacy NOT IN ('all', 'managers') THEN
        RAISE EXCEPTION 'Invalid activity log privacy setting';
    END IF;

    IF p_export_control NOT IN ('all', 'managers') THEN
        RAISE EXCEPTION 'Invalid export control setting';
    END IF;

    IF p_member_list_visibility NOT IN ('all', 'managers') THEN
        RAISE EXCEPTION 'Invalid member list visibility setting';
    END IF;

    -- Updated member limit validation
    IF p_member_limit IS NOT NULL AND (p_member_limit < 1 OR p_member_limit > 100) THEN
        RAISE EXCEPTION 'Member limit must be between 1 and 100';
    END IF;

    -- Validate group name length
    IF length(p_group_name) < 3 OR length(p_group_name) > 50 THEN
        RAISE EXCEPTION 'Group name must be between 3 and 50 characters';
    END IF;

    -- Validate description length
    IF p_description IS NOT NULL AND length(p_description) > 500 THEN
        RAISE EXCEPTION 'Description must not exceed 500 characters';
    END IF;

    -- Generate a random invite code
    new_invite_code := upper(substring(md5(random()::text) for 8));

    -- Insert the new group
    INSERT INTO public.groups (
        name,
        description,
        password,
        manager_id,
        invite_code,
        member_limit,
        invite_code_visible,
        auto_approve_members,
        activity_log_privacy,
        export_control,
        member_list_visibility
    )
    VALUES (
        p_group_name,
        p_description,
        p_password,
        p_user_id,
        new_invite_code,
        p_member_limit,
        p_invite_code_visible,
        p_auto_approve_members,
        p_activity_log_privacy,
        p_export_control,
        p_member_list_visibility
    )
    RETURNING id INTO v_group_id;

    -- Set the creator as the group manager
    INSERT INTO public.group_members (
        group_id,
        user_id,
        role
    )
    VALUES (
        v_group_id,
        p_user_id,
        'manager'
    );

    -- Log this activity
    INSERT INTO public.activity_logs (
        group_id,
        user_id,
        action_type,
        payload
    )
    VALUES (
        v_group_id,
        p_user_id,
        'group_created',
        jsonb_build_object(
            'groupName', p_group_name,
            'creatorName', v_user_display_name,
            'isPrivate', p_password IS NOT NULL,
            'settings', jsonb_build_object(
                'hasDescription', p_description IS NOT NULL,
                'memberLimit', p_member_limit,
                'inviteCodeVisible', p_invite_code_visible,
                'autoApproveMembers', p_auto_approve_members,
                'activityLogPrivacy', p_activity_log_privacy,
                'exportControl', p_export_control,
                'memberListVisibility', p_member_list_visibility
            )
        )
    );

    RETURN v_group_id;
END;
$$;


ALTER FUNCTION "public"."create_group_with_manager"("p_activity_log_privacy" "text", "p_auto_approve_members" boolean, "p_description" "text", "p_export_control" "text", "p_group_name" "text", "p_invite_code_visible" boolean, "p_member_limit" integer, "p_member_list_visibility" "text", "p_password" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password_hash" "text" DEFAULT NULL::"text", "p_member_limit" integer DEFAULT NULL::integer, "p_invite_code_visible" boolean DEFAULT true, "p_auto_approve_members" boolean DEFAULT true, "p_activity_log_privacy" "public"."visibility_level" DEFAULT 'managers'::"public"."visibility_level", "p_export_control" "public"."visibility_level" DEFAULT 'managers'::"public"."visibility_level", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_user_display_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_group_id uuid;
  new_invite_code text;
  v_user_id uuid;
BEGIN
  -- Get or set user ID
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  -- Validate member limit
  IF p_member_limit IS NOT NULL AND p_member_limit < 2 THEN
    RAISE EXCEPTION 'Member limit must be at least 2';
  END IF;

  -- Generate unique invite code
  LOOP
    new_invite_code := substr(md5(random()::text), 1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = new_invite_code);
  END LOOP;

  -- Create the group
  INSERT INTO public.groups (
    name,
    description,
    invite_code,
    password,
    member_limit,
    manager_id,
    invite_code_visible,
    auto_approve_members,
    activity_log_privacy,
    export_control
  )
  VALUES (
    p_group_name,
    p_description,
    new_invite_code,
    p_password_hash,
    p_member_limit,
    v_user_id,
    p_invite_code_visible,
    p_auto_approve_members,
    p_activity_log_privacy,
    p_export_control
  )
  RETURNING id INTO new_group_id;

  -- Add the creator as a manager
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role
  )
  VALUES (
    new_group_id,
    v_user_id,
    'manager'
  );

  -- Log group creation
  INSERT INTO public.activity_logs (
    group_id,
    user_id,
    action_type,
    payload
  )
  VALUES (
    new_group_id,
    v_user_id,
    'group_created',
    jsonb_build_object(
      'groupName', p_group_name,
      'creatorName', p_user_display_name,
      'isPrivate', p_password_hash IS NOT NULL,
      'settings', jsonb_build_object(
        'hasDescription', p_description IS NOT NULL,
        'memberLimit', p_member_limit,
        'inviteCodeVisible', p_invite_code_visible,
        'autoApproveMembers', p_auto_approve_members,
        'privacySettings', jsonb_build_object(
          'activityLog', p_activity_log_privacy,
          'export', p_export_control
        )
      )
    )
  );

  RETURN new_group_id;
END;
$$;


ALTER FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid", "p_user_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_group_id UUID;
    v_invite_code TEXT;
    v_hashed_password TEXT;
BEGIN
    -- 1. Validation
    IF LENGTH(p_name) < 3 OR LENGTH(p_name) > 50 THEN
        RAISE EXCEPTION 'Group name must be between 3 and 50 characters.';
    END IF;

    IF p_privacy_level = 'private' AND (p_password IS NULL OR LENGTH(p_password) < 8) THEN
        RAISE EXCEPTION 'Private groups require a password of at least 8 characters.';
    END IF;

    -- 2. Generate secure assets
    v_invite_code := random_string(8);
    IF p_password IS NOT NULL THEN
        v_hashed_password := crypt(p_password, gen_salt('bf'));
    ELSE
        v_hashed_password := NULL;
    END IF;
    
    -- 3. Insert new group, using the standardized creator_id
    INSERT INTO public.groups (name, description, creator_id, privacy_level, password, member_limit, invite_code)
    VALUES (p_name, p_description, p_user_id, p_privacy_level::privacy_level, v_hashed_password, p_member_limit, v_invite_code)
    RETURNING id INTO v_group_id;

    -- 4. Add creator as the first member (manager)
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_group_id, p_user_id, 'manager');
    
    -- 5. Log the activity
    INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
    VALUES (v_group_id, p_user_id, 'group_created', jsonb_build_object('group_name', p_name));

    -- 6. Return the new group's ID and invite code
    RETURN jsonb_build_object('group_id', v_group_id, 'invite_code', v_invite_code);
END;
$$;


ALTER FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer) OWNER TO "postgres";


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
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id 
  FROM public.users 
  WHERE supabase_auth_id = auth.uid()
  LIMIT 1;
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


CREATE OR REPLACE FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select
    g.id,
    g.name
  from
    groups g
    join group_members gm on g.id = gm.group_id
  where
    gm.user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."get_groups_for_user"("p_user_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_kicker_id UUID;
  v_kicker_role TEXT;
  v_kickee_role TEXT;
BEGIN
  -- Get the current user's ID
  SELECT public.get_current_user_app_id() INTO v_kicker_id;
  
  -- Get roles
  SELECT role INTO v_kicker_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_kicker_id;
  
  SELECT role INTO v_kickee_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
  
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
  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
END;
$$;


ALTER FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Use a namespaced, secure variable to store the user ID.
  -- The 'request.app_user.id' is a session-local variable.
  PERFORM set_config('request.app_user.id', user_id_to_set::text, false);
EXCEPTION
  -- If there's any error, ensure the setting is cleared to prevent misuse.
  WHEN others THEN
    PERFORM set_config('request.app_user.id', '', false);
    RAISE;
END;
$$;


ALTER FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_username"("p_username" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM set_config('app.current_username', p_username, FALSE);
END;
$$;


ALTER FUNCTION "public"."set_current_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_test_user"("user_auth_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Store the test user ID in a session variable
  PERFORM set_config('app.test_user_id', user_auth_id::text, false);
END;
$$;


ALTER FUNCTION "public"."set_test_user"("user_auth_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_user_id uuid;
  v_old_password text;
  current_member_count integer;
BEGIN
  -- Get current user's ID
  SELECT public.get_current_user_app_id() INTO v_current_user_id;
  
  -- ====================================================================
  -- CHANGE #1: PERMISSIONS ARE NOW BASED ON 'manager' ROLE (More Flexible)
  -- ====================================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_current_user_id AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Only a group manager can update settings';
  END IF;

  -- Get the current password and member count
  SELECT 
    password,
    (SELECT COUNT(*) FROM public.group_members WHERE group_id = p_group_id)
  INTO 
    v_old_password,
    current_member_count
  FROM public.groups
  WHERE id = p_group_id;

  -- Validate member limit
  IF p_member_limit IS NOT NULL AND p_member_limit > 0 AND p_member_limit < current_member_count THEN
    RAISE EXCEPTION 'New member limit (%) cannot be less than current member count (%)', p_member_limit, current_member_count;
  END IF;

  -- Validate privacy settings
  IF p_activity_log_privacy IS NOT NULL AND p_activity_log_privacy NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid activity log privacy setting';
  END IF;

  IF p_export_control IS NOT NULL AND p_export_control NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid export control setting';
  END IF;

  -- Update group settings
  UPDATE public.groups
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    password = COALESCE(p_password_hash, password),
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    activity_log_privacy = COALESCE(p_activity_log_privacy::visibility_level, activity_log_privacy),
    export_control = COALESCE(p_export_control::visibility_level, export_control),
    updated_at = NOW()
  WHERE id = p_group_id;

  -- ====================================================================
  -- CHANGE #2: THE BLOCK THAT KICKED MEMBERS OUT HAS BEEN REMOVED
  -- ====================================================================
  -- (The IF...DELETE block that was here is now gone)

  -- Log the settings update
  INSERT INTO public.activity_logs (
    group_id,
    user_id,
    action_type,
    payload
  )
  VALUES (
    p_group_id,
    v_current_user_id,
    'group_settings_updated',
    jsonb_build_object(
      'name_changed', p_name IS NOT NULL,
      'description_changed', p_description IS NOT NULL,
      'password_changed', p_password_hash IS NOT NULL,
      'member_limit_changed', p_member_limit IS NOT NULL,
      'privacy_settings_changed', 
      (p_invite_code_visible IS NOT NULL OR 
        p_activity_log_privacy IS NOT NULL OR 
        p_export_control IS NOT NULL)
    )
  );
END;
$$;


ALTER FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") RETURNS "jsonb"
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

    -- 4. Hash new password if provided
    IF p_password IS NOT NULL AND p_password != '' THEN
        v_hashed_password := crypt(p_password, gen_salt('bf'));
    ELSE
        -- If password is not provided, keep the existing one.
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
        export_control = COALESCE(p_export_control::public.visibility_level, export_control)
    WHERE id = p_group_id
    RETURNING row_to_json(groups.*) INTO v_updated_group;

    -- 6. Log the activity
    INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
    VALUES (p_group_id, v_internal_user_id, 'update_settings', '{}'::jsonb);

    -- 7. Return the updated group data
    RETURN v_updated_group;
END;
$$;


ALTER FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
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
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'voided'::"text"]))),
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
    "password_hash" "text",
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



CREATE POLICY "Managers can update their own groups" ON "public"."groups" FOR UPDATE TO "authenticated" USING ((( SELECT "gm"."role"
   FROM ("public"."group_members" "gm"
     JOIN "public"."users" "u" ON (("gm"."user_id" = "u"."id")))
  WHERE (("gm"."group_id" = "groups"."id") AND ("u"."supabase_auth_id" = "auth"."uid"()))) = 'manager'::"text")) WITH CHECK ((( SELECT "gm"."role"
   FROM ("public"."group_members" "gm"
     JOIN "public"."users" "u" ON (("gm"."user_id" = "u"."id")))
  WHERE (("gm"."group_id" = "groups"."id") AND ("u"."supabase_auth_id" = "auth"."uid"()))) = 'manager'::"text"));



CREATE POLICY "Members can view their own groups" ON "public"."groups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."group_members" "gm"
     JOIN "public"."users" "u" ON (("gm"."user_id" = "u"."id")))
  WHERE (("gm"."group_id" = "groups"."id") AND ("u"."supabase_auth_id" = "auth"."uid"())))));



CREATE POLICY "activity_logs_select_policy" ON "public"."activity_logs" FOR SELECT USING ("public"."can_view_activity_logs"("group_id"));



CREATE POLICY "group_members_select_policy" ON "public"."group_members" FOR SELECT USING ("public"."can_view_group_members"("group_id"));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;




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



GRANT ALL ON FUNCTION "public"."can_export_group_data"("group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_export_group_data"("group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_export_group_data"("group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_activity_logs"("group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_activity_logs"("group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_activity_logs"("group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_group_members"("group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_group_members"("group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_group_members"("group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_activity_log_privacy" "text", "p_auto_approve_members" boolean, "p_description" "text", "p_export_control" "text", "p_group_name" "text", "p_invite_code_visible" boolean, "p_member_limit" integer, "p_member_list_visibility" "text", "p_password" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_activity_log_privacy" "text", "p_auto_approve_members" boolean, "p_description" "text", "p_export_control" "text", "p_group_name" "text", "p_invite_code_visible" boolean, "p_member_limit" integer, "p_member_list_visibility" "text", "p_password" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_activity_log_privacy" "text", "p_auto_approve_members" boolean, "p_description" "text", "p_export_control" "text", "p_group_name" "text", "p_invite_code_visible" boolean, "p_member_limit" integer, "p_member_list_visibility" "text", "p_password" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid", "p_user_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid", "p_user_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_auto_approve_members" boolean, "p_activity_log_privacy" "public"."visibility_level", "p_export_control" "public"."visibility_level", "p_user_id" "uuid", "p_user_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_new_group"("p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_privacy_level" "text", "p_password" "text", "p_member_limit" integer, "p_activity_log_privacy" "text", "p_export_control" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."random_string"("size" integer, "alphabet" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."random_string"("size" integer, "alphabet" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."random_string"("size" integer, "alphabet" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_test_user"("user_auth_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_test_user"("user_auth_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_test_user"("user_auth_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_description" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_settings_securely"("p_group_id" "uuid", "p_user_id" "uuid", "p_name" "text", "p_description" "text", "p_password" "text", "p_member_limit" integer, "p_invite_code_visible" boolean, "p_activity_log_privacy" "text", "p_export_control" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "service_role";


















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

-- Add or update void_payment_securely to log payment_deleted
CREATE OR REPLACE FUNCTION public.void_payment_securely(
  p_group_id uuid,
  p_payment_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_amount numeric;
  v_description text;
BEGIN
  -- Fetch payment details before deletion
  SELECT amount, description INTO v_amount, v_description
  FROM public.payments
  WHERE id = p_payment_id AND group_id = p_group_id;

  -- (Your existing void logic here...)
  -- Example: Mark payment as voided or delete, depending on your logic
  UPDATE public.payments
  SET status = 'voided'
  WHERE id = p_payment_id AND group_id = p_group_id;

  -- Log the deletion
  INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
  VALUES (
    p_group_id,
    p_user_id,
    'payment_deleted',
    jsonb_build_object(
      'amount', v_amount,
      'description', v_description,
      'payment_id', p_payment_id
    )
  );
END;
$$;
