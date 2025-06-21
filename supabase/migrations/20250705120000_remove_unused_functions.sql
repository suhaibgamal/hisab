-- Migration: Remove unused, legacy, and test DB functions (safe for production)
-- Date: 2025-07-05

-- 1. Drop all overloads of create_group_with_manager
DROP FUNCTION IF EXISTS public.create_group_with_manager(p_group_name text, p_description text, p_password text, p_member_limit integer, p_invite_code_visible boolean, p_auto_approve_members boolean, p_activity_log_privacy public.visibility_level, p_export_control public.visibility_level, p_user_id uuid);
DROP FUNCTION IF EXISTS public.create_group_with_manager(p_activity_log_privacy text, p_auto_approve_members boolean, p_description text, p_export_control text, p_group_name text, p_invite_code_visible boolean, p_member_limit integer, p_member_list_visibility text, p_password text, p_user_id uuid);
DROP FUNCTION IF EXISTS public.create_group_with_manager(p_group_name text, p_description text, p_password_hash text, p_member_limit integer, p_invite_code_visible boolean, p_auto_approve_members boolean, p_activity_log_privacy public.visibility_level, p_export_control public.visibility_level, p_user_id uuid, p_user_display_name text);
DROP FUNCTION IF EXISTS public.create_group_with_manager(group_name text, password_hash text);
DROP FUNCTION IF EXISTS public.create_group_with_manager(p_group_name text, p_user_id uuid, p_password_hash text);

-- 2. Drop unused create_new_group signature (without activity_log_privacy/export_control)
DROP FUNCTION IF EXISTS public.create_new_group(p_user_id uuid, p_name text, p_description text, p_privacy_level text, p_password text, p_member_limit integer);

-- 3. Drop unused update_group_settings_securely signature (with p_user_id)
DROP FUNCTION IF EXISTS public.update_group_settings_securely(p_group_id uuid, p_user_id uuid, p_name text, p_description text, p_password text, p_member_limit integer, p_invite_code_visible boolean, p_activity_log_privacy text, p_export_control text);

-- 4. Drop all update_group_settings legacy signatures
DROP FUNCTION IF EXISTS public.update_group_settings(p_group_id uuid, p_name text, p_description text, p_password_hash text, p_member_limit integer, p_invite_code_visible boolean, p_activity_log_privacy text, p_export_control text);
DROP FUNCTION IF EXISTS public.update_group_settings(p_group_id uuid, p_name text, p_password_hash text, p_member_limit integer, p_invite_code_visible boolean);

-- 5. Drop unused void_payment_securely signature (with p_user_id)
DROP FUNCTION IF EXISTS public.void_payment_securely(p_group_id uuid, p_payment_id uuid, p_user_id uuid);

-- 6. Drop test/dev function
DROP FUNCTION IF EXISTS public.set_test_user(user_auth_id uuid);

-- End of migration 