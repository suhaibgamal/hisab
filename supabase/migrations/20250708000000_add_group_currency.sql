-- Migration: Add currency to groups (unified, unchangeable per group)
-- Date: 2025-07-08

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS currency TEXT;

-- Set default currency for existing groups
UPDATE public.groups SET currency = 'USD' WHERE currency IS NULL;

-- Make currency NOT NULL
ALTER TABLE public.groups ALTER COLUMN currency SET NOT NULL;

-- Update group creation functions to require currency as the second parameter
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, text, text, integer, boolean, boolean, public.visibility_level, public.visibility_level, uuid);

CREATE OR REPLACE FUNCTION public.create_group_with_manager(
  p_group_name text,
  p_currency text,
  p_description text DEFAULT NULL::text,
  p_password text DEFAULT NULL::text,
  p_member_limit integer DEFAULT 10,
  p_invite_code_visible boolean DEFAULT true,
  p_auto_approve_members boolean DEFAULT true,
  p_activity_log_privacy public.visibility_level DEFAULT 'managers',
  p_export_control public.visibility_level DEFAULT 'managers',
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_group_id uuid;
  v_user_id uuid;
  v_invite_code text;
  v_password_hash text;
BEGIN
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  IF p_group_name IS NULL OR length(trim(p_group_name)) < 3 THEN
    RAISE EXCEPTION 'Group name must be at least 3 characters long';
  END IF;
  IF p_member_limit IS NOT NULL AND (p_member_limit < 2 OR p_member_limit > 100) THEN
    RAISE EXCEPTION 'Member limit must be between 2 and 100';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('USD','EUR','SAR','EGP','GBP','AED','KWD','QAR','OMR','BHD','JOD','TRY','MAD','ILS','CHF','CAD','AUD','JPY','CNY','INR') THEN
    RAISE EXCEPTION 'Invalid or missing currency';
  END IF;

  LOOP
    v_invite_code := upper(substring(md5(random()::text) for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = v_invite_code);
  END LOOP;

  IF p_password IS NOT NULL THEN
    v_password_hash := public.hash_password(p_password);
  END IF;

  INSERT INTO public.groups (
    name, currency, description, password, member_limit, invite_code, invite_code_visible, auto_approve_members, activity_log_privacy, export_control, manager_id
  ) VALUES (
    p_group_name, p_currency, p_description, v_password_hash, p_member_limit, v_invite_code, p_invite_code_visible, p_auto_approve_members, p_activity_log_privacy, p_export_control, v_user_id
  ) RETURNING id INTO v_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'manager');

  RETURN v_group_id;
END;
$$; 