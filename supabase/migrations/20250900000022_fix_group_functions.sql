-- Drop existing functions with specific signatures
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, text, uuid, text, text, integer, boolean, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean);
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean, boolean, text, text, text);

-- Create the create_group_with_manager function with all parameters
CREATE OR REPLACE FUNCTION public.create_group_with_manager(
    p_group_name text,
    p_password_hash text,
    p_user_id uuid,
    p_user_display_name text,
    p_description text DEFAULT NULL,
    p_member_limit integer DEFAULT NULL,
    p_invite_code_visible boolean DEFAULT true,
    p_auto_approve_members boolean DEFAULT true,
    p_activity_log_privacy text DEFAULT 'members',
    p_export_control text DEFAULT 'members',
    p_member_list_visibility text DEFAULT 'members'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id uuid;
BEGIN
    -- Insert the group
    INSERT INTO public.groups (
        name,
        password,
        description,
        member_limit,
        invite_code_visible,
        auto_approve_members,
        activity_log_privacy,
        export_control,
        member_list_visibility
    )
    VALUES (
        p_group_name,
        p_password_hash,
        p_description,
        p_member_limit,
        p_invite_code_visible,
        p_auto_approve_members,
        p_activity_log_privacy,
        p_export_control,
        p_member_list_visibility
    )
    RETURNING id INTO v_group_id;

    -- Add the creator as a manager
    INSERT INTO public.group_members (
        group_id,
        user_id,
        display_name,
        role
    )
    VALUES (
        v_group_id,
        p_user_id,
        p_user_display_name,
        'manager'
    );

    RETURN v_group_id;
END;
$$;

-- Create the update_group_settings function with all parameters
CREATE OR REPLACE FUNCTION public.update_group_settings(
    p_group_id uuid,
    p_name text,
    p_description text,
    p_password_hash text,
    p_member_limit integer,
    p_invite_code_visible boolean,
    p_auto_approve_members boolean,
    p_activity_log_privacy text,
    p_export_control text,
    p_member_list_visibility text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate privacy settings
    IF p_activity_log_privacy NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid activity_log_privacy value. Must be one of: all, members, managers';
    END IF;

    IF p_export_control NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid export_control value. Must be one of: all, members, managers';
    END IF;

    IF p_member_list_visibility NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid member_list_visibility value. Must be one of: all, members, managers';
    END IF;

    -- Update the group settings
    UPDATE public.groups
    SET
        name = COALESCE(p_name, name),
        description = p_description,
        password = COALESCE(p_password_hash, password),
        member_limit = p_member_limit,
        invite_code_visible = p_invite_code_visible,
        auto_approve_members = p_auto_approve_members,
        activity_log_privacy = p_activity_log_privacy,
        export_control = p_export_control,
        member_list_visibility = p_member_list_visibility,
        updated_at = NOW()
    WHERE id = p_group_id;

    -- If password was changed, remove all non-manager members
    IF p_password_hash IS NOT NULL THEN
        DELETE FROM public.group_members
        WHERE group_id = p_group_id
        AND role != 'manager';
    END IF;
END;
$$; 