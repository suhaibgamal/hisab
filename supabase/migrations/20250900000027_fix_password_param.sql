-- Drop existing function
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, boolean, text, text, text, boolean, integer, text, text, text, uuid);

-- Recreate with correct parameter names and column references
CREATE OR REPLACE FUNCTION public.create_group_with_manager(
    p_activity_log_privacy text,
    p_auto_approve_members boolean,
    p_description text,
    p_export_control text,
    p_group_name text,
    p_invite_code_visible boolean,
    p_member_limit integer,
    p_member_list_visibility text,
    p_password text,
    p_user_display_name text,
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id uuid;
    new_invite_code text;
BEGIN
    -- Validate settings
    IF p_activity_log_privacy NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid activity log privacy setting';
    END IF;

    IF p_export_control NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid export control setting';
    END IF;

    IF p_member_list_visibility NOT IN ('all', 'members', 'managers') THEN
        RAISE EXCEPTION 'Invalid member list visibility setting';
    END IF;

    IF p_member_limit IS NOT NULL AND p_member_limit < 2 THEN
        RAISE EXCEPTION 'Member limit must be at least 2';
    END IF;

    -- Generate a random invite code
    new_invite_code := upper(substring(md5(random()::text) for 8));

    -- Insert the new group
    INSERT INTO public.groups (
        name,
        description,
        password,  -- Changed from password_hash to password
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
        p_password,  -- The password from the edge function is already hashed
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
        display_name,
        role
    )
    VALUES (
        v_group_id,
        p_user_id,
        p_user_display_name,
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
            'creatorName', p_user_display_name,
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

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_group_with_manager(
    text, boolean, text, text, text, boolean, integer, text, text, text, uuid
) TO authenticated; 