-- Drop existing functions with all possible signatures
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean);
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean, boolean, text, text, text);

-- Create updated function
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
DECLARE
    v_current_user_id uuid;
    v_old_password text;
    current_member_count integer;
BEGIN
    -- Get current user's ID
    SELECT public.get_current_user_app_id() INTO v_current_user_id;
    
    -- Check if user is the group manager
    IF NOT EXISTS (
        SELECT 1 FROM public.groups
        WHERE id = p_group_id AND manager_id = v_current_user_id
    ) THEN
        RAISE EXCEPTION 'Only the group manager can update settings';
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

    IF p_member_list_visibility IS NOT NULL AND p_member_list_visibility NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid member list visibility setting';
    END IF;

    -- Update group settings
    UPDATE public.groups
    SET
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        password = COALESCE(p_password_hash, password),
        member_limit = COALESCE(p_member_limit, member_limit),
        invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
        auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
        activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
        export_control = COALESCE(p_export_control, export_control),
        member_list_visibility = COALESCE(p_member_list_visibility, member_list_visibility),
        updated_at = NOW()
    WHERE id = p_group_id;

    -- If password was changed, remove all non-manager members
    IF p_password_hash IS NOT NULL AND p_password_hash IS DISTINCT FROM v_old_password THEN
        DELETE FROM public.group_members
        WHERE group_id = p_group_id AND role <> 'manager';
    END IF;

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
             p_auto_approve_members IS NOT NULL OR 
             p_activity_log_privacy IS NOT NULL OR 
             p_export_control IS NOT NULL OR 
             p_member_list_visibility IS NOT NULL)
        )
    );
END;
$$; 