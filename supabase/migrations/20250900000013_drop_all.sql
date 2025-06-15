-- Drop all tables
DROP TABLE IF EXISTS "public"."activity_logs" CASCADE;
DROP TABLE IF EXISTS "public"."group_members" CASCADE;
DROP TABLE IF EXISTS "public"."groups" CASCADE;
DROP TABLE IF EXISTS "public"."payment_beneficiaries" CASCADE;
DROP TABLE IF EXISTS "public"."payments" CASCADE;
DROP TABLE IF EXISTS "public"."settlements" CASCADE;
DROP TABLE IF EXISTS "public"."users" CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS "public"."_get_uid_for_user_id"(UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."_is_user_the_group_manager"(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."cancel_settlement"(UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."check_group_exists"(UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."create_group_with_manager"(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS "public"."create_group_with_manager"(TEXT, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS "public"."delete_payment"(UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."get_current_user_app_id"() CASCADE;
DROP FUNCTION IF EXISTS "public"."get_current_user_id"() CASCADE;
DROP FUNCTION IF EXISTS "public"."get_group_details"(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."get_my_user_id"() CASCADE;
DROP FUNCTION IF EXISTS "public"."is_authenticated_group_member"(UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."is_authenticated_group_member"(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."is_group_manager"(UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."kick_group_member"(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS "public"."update_group_settings"(UUID, TEXT, TEXT, INTEGER, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS "public"."username_exists"(TEXT) CASCADE;

-- Drop all types
DROP TYPE IF EXISTS "public"."group_details" CASCADE; 