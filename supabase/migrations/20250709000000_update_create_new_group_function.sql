-- Migration: Update create_new_group to support currency
-- Date: 2025-07-09

DROP FUNCTION IF EXISTS public.create_new_group;

CREATE OR REPLACE FUNCTION public.create_new_group(
    p_user_id uuid,
    p_name text,
    p_description text,
    p_privacy_level text,
    p_password text,
    p_member_limit integer,
    p_activity_log_privacy text,
    p_export_control text,
    p_currency text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
    IF p_currency IS NULL OR p_currency NOT IN ('USD','EUR','SAR','EGP','GBP','AED','KWD','QAR','OMR','BHD','JOD','TRY','MAD','ILS','CHF','CAD','AUD','JPY','CNY','INR') THEN
        RAISE EXCEPTION 'Invalid or missing currency';
    END IF;

    -- Generate secure assets
    v_invite_code := upper(substring(md5(random()::text) for 8));
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
        export_control,
        currency
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
        p_export_control::public.visibility_level,
        p_currency
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