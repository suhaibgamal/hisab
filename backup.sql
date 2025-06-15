

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






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."group_details" AS (
	"name" "text",
	"invite_code" "text"
);


ALTER TYPE "public"."group_details" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  auth_id UUID;
BEGIN
  -- This function bypasses RLS on public.users because it is SECURITY DEFINER
  SELECT supabase_auth_id INTO auth_id FROM public.users WHERE id = user_id_param;
  RETURN auth_id;
END;
$$;


ALTER FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_is_user_the_group_manager"("group_id_param" "uuid", "user_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- This function bypasses RLS on public.groups because it is SECURITY DEFINER.
  -- It checks if the provided user_id is the manager of the provided group_id.
  RETURN EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = group_id_param AND manager_id = user_id_param
  );
END;
$$;


ALTER FUNCTION "public"."_is_user_the_group_manager"("group_id_param" "uuid", "user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Security Check: Ensure the current user is the initiator of the settlement
  -- and that the settlement is still in 'pending' status.
  IF NOT EXISTS (
    SELECT 1
    FROM public.settlements
    WHERE id = settlement_id_to_cancel
      AND from_user_id = public.get_current_user_app_id()
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'User is not authorized to cancel this settlement or settlement is not pending.';
  END IF;
  
  -- Delete the settlement record.
  DELETE FROM public.settlements WHERE id = settlement_id_to_cancel;
END;
$$;


ALTER FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_group_exists"("group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."create_group_with_manager"("group_name" "text", "password_hash" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_group_id uuid;
  current_user_app_id uuid := public.get_current_user_app_id();
BEGIN
  -- Insert a new group and return its ID
  INSERT INTO public.groups (name, password)
  VALUES (group_name, password_hash)
  RETURNING id INTO new_group_id;

  -- Set the creator as the group manager
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, current_user_app_id, 'manager');

  -- Log this activity
  INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
  VALUES (new_group_id, current_user_app_id, 'group_created', jsonb_build_object('groupName', group_name));
  
  RETURN new_group_id;
END;
$$;


ALTER FUNCTION "public"."create_group_with_manager"("group_name" "text", "password_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_user_id" "uuid", "p_password_hash" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_group_id uuid;
  new_invite_code TEXT;
BEGIN
  -- Generate a random invite code.
  new_invite_code := upper(substring(md5(random()::text) for 8));

  -- Insert a new group and return its ID
  INSERT INTO public.groups (name, password, manager_id, invite_code)
  VALUES (p_group_name, p_password_hash, p_user_id, new_invite_code)
  RETURNING id INTO new_group_id;

  -- Set the creator as the group manager
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, p_user_id, 'manager');

  -- Log this activity
  INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
  VALUES (new_group_id, p_user_id, 'group_created', jsonb_build_object('groupName', p_group_name));
  
  RETURN new_group_id;
END;
$$;


ALTER FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_user_id" "uuid", "p_password_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Security Check: Ensure the current user is the payer of the payment.
  IF NOT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE id = payment_id_to_delete AND payer_id = public.get_current_user_app_id()
  ) THEN
    RAISE EXCEPTION 'User is not authorized to delete this payment or payment does not exist.';
  END IF;

  -- Delete the associated beneficiaries first.
  DELETE FROM public.payment_beneficiaries WHERE payment_id = payment_id_to_delete;
  
  -- Delete the main payment record.
  DELETE FROM public.payments WHERE id = payment_id_to_delete;
END;
$$;


ALTER FUNCTION "public"."delete_payment"("payment_id_to_delete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_app_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id 
  FROM public.users 
  WHERE username = current_setting('app.current_username', true)
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_current_user_app_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT id FROM public.users 
    WHERE username = current_setting('app.current_username', true)
    LIMIT 1;
$$;


ALTER FUNCTION "public"."get_current_user_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_user_id"() IS 'Returns the internal user ID for the currently authenticated user based on username';



CREATE OR REPLACE FUNCTION "public"."get_group_details"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS "public"."group_details"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result public.group_details;
BEGIN
  -- Check if the user is a member of the group
  IF NOT EXISTS (
    SELECT 1 
    FROM public.group_members 
    WHERE group_id = p_group_id 
    AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Access denied: User is not a member of this group';
  END IF;

  -- Get group details
  SELECT 
    g.name,
    g.invite_code
  INTO v_result
  FROM public.groups g
  WHERE g.id = p_group_id;

  -- If no group found
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  RETURN v_result;
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


CREATE OR REPLACE FUNCTION "public"."get_my_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_username text;
    v_user_id uuid;
    v_is_member boolean;
BEGIN
    -- Get and log the current username
    v_username := current_setting('app.current_username', true);
    RAISE NOTICE 'Checking membership for username: %', v_username;
    
    -- Get and log the user ID
    SELECT id INTO v_user_id
    FROM public.users
    WHERE username = v_username;
    RAISE NOTICE 'Found user ID: %', v_user_id;
    
    -- Check membership and log result
    SELECT EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = group_id_param
        AND gm.user_id = v_user_id
    ) INTO v_is_member;
    RAISE NOTICE 'Membership check result: %', v_is_member;
    
    RETURN v_is_member;
END;
$$;


ALTER FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid", "auth_uid_param" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = group_id_param
        AND public._get_uid_for_user_id(gm.user_id) = auth_uid_param
    );
END;
$$;


ALTER FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid", "auth_uid_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_manager"("group_id_param" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.group_members gm
        WHERE gm.group_id = group_id_param 
        AND gm.user_id = get_current_user_id()
        AND gm.role = 'manager'
    );
$$;


ALTER FUNCTION "public"."is_group_manager"("group_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") IS 'Checks if the current user is a manager of the specified group';



CREATE OR REPLACE FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_user_app_id uuid;
    is_manager boolean;
    kicked_user_role text;
BEGIN
    -- Get the application-specific user ID of the caller
    SELECT id INTO current_user_app_id FROM public.users WHERE supabase_auth_id = auth.uid();

    IF current_user_app_id IS NULL THEN
        RAISE EXCEPTION 'User not found in application.';
    END IF;

    -- Check if the current user is a manager
    SELECT EXISTS (
        SELECT 1
        FROM public.group_members
        WHERE group_id = p_group_id
        AND user_id = current_user_app_id
        AND role = 'manager'
    ) INTO is_manager;

    IF NOT is_manager THEN
        RAISE EXCEPTION 'Only a group manager can kick members.';
    END IF;

    -- Prevent a manager from kicking themselves
    IF current_user_app_id = p_user_to_kick_id THEN
        RAISE EXCEPTION 'Manager cannot kick themselves.';
    END IF;

    -- Check the role of the user being kicked
    SELECT role INTO kicked_user_role FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;

    IF kicked_user_role = 'manager' THEN
        RAISE EXCEPTION 'A manager cannot kick another manager.';
    END IF;

    -- Proceed with kicking the member
    DELETE FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;

END;
$$;


ALTER FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_user_app_id uuid;
    is_manager boolean;
    old_password_hash_val text;
    current_member_count integer;
BEGIN
    -- Get the application-specific user ID from the JWT
    SELECT id INTO current_user_app_id FROM public.users WHERE supabase_auth_id = auth.uid();
    IF current_user_app_id IS NULL THEN
        RAISE EXCEPTION 'User not found in application.';
    END IF;

    -- Check if the current user is a manager of the group
    SELECT EXISTS (
        SELECT 1
        FROM public.group_members
        WHERE group_id = p_group_id
        AND user_id = current_user_app_id
        AND role = 'manager'
    ) INTO is_manager;

    IF NOT is_manager THEN
        RAISE EXCEPTION 'Only a group manager can update settings.';
    END IF;

    -- Validate member limit: cannot be less than current member count
    SELECT count(*) INTO current_member_count FROM public.group_members WHERE group_id = p_group_id;
    IF p_member_limit IS NOT NULL AND p_member_limit > 0 AND p_member_limit < current_member_count THEN
      RAISE EXCEPTION 'New member limit cannot be less than the current number of members (%).', current_member_count;
    END IF;

    -- Get old password hash to check if it's being changed
    SELECT password INTO old_password_hash_val FROM public.groups WHERE id = p_group_id;

    -- Update group settings
    UPDATE public.groups
    SET
        name = p_name,
        -- A NULL password hash from the edge function means no change.
        password = COALESCE(p_password_hash, password),
        member_limit = p_member_limit,
        invite_code_visible = p_invite_code_visible
    WHERE id = p_group_id;
    
    -- If password was actually changed, remove all non-manager members
    IF p_password_hash IS NOT NULL AND p_password_hash IS DISTINCT FROM old_password_hash_val THEN
        DELETE FROM public.group_members
        WHERE group_id = p_group_id AND role <> 'manager';
    END IF;

END;
$$;


ALTER FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."username_exists"("p_username" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS(SELECT 1 FROM public.users WHERE username = p_username);
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
    "is_public" boolean DEFAULT false,
    "max_members" integer DEFAULT 10 NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "password" "text",
    "member_limit" integer,
    "invite_code_visible" boolean DEFAULT true
);

ALTER TABLE ONLY "public"."groups" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_beneficiaries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "beneficiary_user_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."payment_beneficiaries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_beneficiaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "description" "text",
    "payment_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."payments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "initiated_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "settlements_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."settlements" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."settlements" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."payment_beneficiaries"
    ADD CONSTRAINT "payment_beneficiaries_payment_id_beneficiary_user_id_key" UNIQUE ("payment_id", "beneficiary_user_id");



ALTER TABLE ONLY "public"."payment_beneficiaries"
    ADD CONSTRAINT "payment_beneficiaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "idx_activity_logs_group" ON "public"."activity_logs" USING "btree" ("group_id");



CREATE INDEX "idx_group_members_user_group" ON "public"."group_members" USING "btree" ("user_id", "group_id");



CREATE INDEX "idx_payments_group_payer" ON "public"."payments" USING "btree" ("group_id", "payer_id");



CREATE INDEX "idx_settlements_users" ON "public"."settlements" USING "btree" ("from_user_id", "to_user_id");



CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");



CREATE UNIQUE INDEX "users_supabase_auth_id_idx" ON "public"."users" USING "btree" ("supabase_auth_id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."payment_beneficiaries"
    ADD CONSTRAINT "payment_beneficiaries_beneficiary_user_id_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_beneficiaries"
    ADD CONSTRAINT "payment_beneficiaries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_supabase_auth_id_fkey" FOREIGN KEY ("supabase_auth_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can read their own data" ON "public"."users" FOR SELECT TO "authenticated" USING (("supabase_auth_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own data" ON "public"."users" FOR UPDATE TO "authenticated" USING (("supabase_auth_id" = "auth"."uid"())) WITH CHECK (("supabase_auth_id" = "auth"."uid"()));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_logs_security_policy" ON "public"."activity_logs" USING (false) WITH CHECK (false);



CREATE POLICY "activity_logs_view_policy" ON "public"."activity_logs" FOR SELECT USING ("public"."is_authenticated_group_member"("group_id"));



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_join_policy" ON "public"."group_members" FOR INSERT WITH CHECK ((("user_id" = "public"."get_current_user_id"()) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "group_members"."group_id") AND ("gm"."user_id" = "public"."get_current_user_id"())))))));



CREATE POLICY "group_members_manage_policy" ON "public"."group_members" USING ("public"."is_group_manager"("group_id")) WITH CHECK ("public"."is_group_manager"("group_id"));



CREATE POLICY "group_members_view_policy" ON "public"."group_members" FOR SELECT USING ("public"."is_authenticated_group_member"("group_id"));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_create_policy" ON "public"."groups" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "groups_manage_policy" ON "public"."groups" USING ("public"."is_group_manager"("id")) WITH CHECK ("public"."is_group_manager"("id"));



CREATE POLICY "groups_view_policy" ON "public"."groups" FOR SELECT USING ("public"."is_authenticated_group_member"("id"));



ALTER TABLE "public"."payment_beneficiaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_beneficiaries_create_policy" ON "public"."payment_beneficiaries" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE (("p"."id" = "payment_beneficiaries"."payment_id") AND ("p"."payer_id" = "public"."get_current_user_id"())))));



CREATE POLICY "payment_beneficiaries_security_policy" ON "public"."payment_beneficiaries" FOR UPDATE USING (false) WITH CHECK (false);



CREATE POLICY "payment_beneficiaries_view_policy" ON "public"."payment_beneficiaries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE (("p"."id" = "payment_beneficiaries"."payment_id") AND "public"."is_authenticated_group_member"("p"."group_id")))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_create_policy" ON "public"."payments" FOR INSERT WITH CHECK (("public"."is_authenticated_group_member"("group_id") AND ("payer_id" = "public"."get_current_user_id"())));



CREATE POLICY "payments_manage_policy" ON "public"."payments" FOR DELETE USING ((("payer_id" = "public"."get_current_user_id"()) OR "public"."is_group_manager"("group_id")));



CREATE POLICY "payments_view_policy" ON "public"."payments" FOR SELECT USING ("public"."is_authenticated_group_member"("group_id"));



ALTER TABLE "public"."settlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlements_confirm_policy" ON "public"."settlements" FOR UPDATE USING (("to_user_id" = "public"."get_current_user_id"())) WITH CHECK ((("to_user_id" = "public"."get_current_user_id"()) AND ("status" = 'confirmed'::"text")));



CREATE POLICY "settlements_create_policy" ON "public"."settlements" FOR INSERT WITH CHECK ((("from_user_id" = "public"."get_current_user_id"()) AND "public"."is_authenticated_group_member"("group_id")));



CREATE POLICY "settlements_delete_policy" ON "public"."settlements" FOR DELETE USING ((("from_user_id" = "public"."get_current_user_id"()) OR ("to_user_id" = "public"."get_current_user_id"()) OR "public"."is_group_manager"("group_id")));



CREATE POLICY "settlements_view_policy" ON "public"."settlements" FOR SELECT USING (("public"."is_authenticated_group_member"("group_id") OR ("from_user_id" = "public"."get_current_user_id"()) OR ("to_user_id" = "public"."get_current_user_id"())));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_view_policy" ON "public"."users" FOR SELECT TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_get_uid_for_user_id"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_user_the_group_manager"("group_id_param" "uuid", "user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_user_the_group_manager"("group_id_param" "uuid", "user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_user_the_group_manager"("group_id_param" "uuid", "user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_settlement"("settlement_id_to_cancel" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_group_exists"("group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group_with_manager"("group_name" "text", "password_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("group_name" "text", "password_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("group_name" "text", "password_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_user_id" "uuid", "p_password_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_user_id" "uuid", "p_password_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_with_manager"("p_group_name" "text", "p_user_id" "uuid", "p_password_hash" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_my_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid", "auth_uid_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid", "auth_uid_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_authenticated_group_member"("group_id_param" "uuid", "auth_uid_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_manager"("group_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kick_group_member"("p_group_id" "uuid", "p_user_to_kick_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_user_id"("user_id_to_set" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_settings"("p_group_id" "uuid", "p_name" "text", "p_password_hash" "text", "p_member_limit" integer, "p_invite_code_visible" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."username_exists"("p_username" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."payment_beneficiaries" TO "anon";
GRANT ALL ON TABLE "public"."payment_beneficiaries" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_beneficiaries" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."settlements" TO "anon";
GRANT ALL ON TABLE "public"."settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."settlements" TO "service_role";



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
