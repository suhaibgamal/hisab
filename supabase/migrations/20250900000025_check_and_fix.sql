-- First drop all existing group functions to avoid conflicts
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT ns.nspname as schema_name,
               p.proname as function_name,
               pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace ns ON p.pronamespace = ns.oid
        WHERE ns.nspname = 'public' 
        AND p.proname IN ('update_group_settings', 'create_group_with_manager')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.schema_name || '.' || func_record.function_name || '(' || func_record.args || ') CASCADE';
    END LOOP;
END $$;

-- Now create the functions with correct signatures
CREATE OR REPLACE FUNCTION public.update_group_settings(
    p_group_id uuid,
    p_name text,
    p_description text,
    p_password text,
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
        RAISE EXCEPTION 'Member limit cannot be less than current member count (%)', current_member_count;
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
        description = p_description,
        password = COALESCE(p_password, password),
        member_limit = p_member_limit,
        invite_code_visible = p_invite_code_visible,
        auto_approve_members = p_auto_approve_members,
        activity_log_privacy = p_activity_log_privacy,
        export_control = p_export_control,
        member_list_visibility = p_member_list_visibility,
        updated_at = NOW()
    WHERE id = p_group_id;

    -- If password was changed, remove all non-manager members
    IF p_password IS NOT NULL AND p_password IS DISTINCT FROM v_old_password THEN
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
            'password_changed', p_password IS NOT NULL,
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

CREATE OR REPLACE FUNCTION public.create_group_with_manager(
    p_group_name text,
    p_password text,
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
    new_invite_code text;
BEGIN
    -- Generate a random invite code
    new_invite_code := upper(substring(md5(random()::text) for 8));

    -- Insert the group
    INSERT INTO public.groups (
        name,
        password,
        description,
        member_limit,
        invite_code,
        invite_code_visible,
        auto_approve_members,
        activity_log_privacy,
        export_control,
        member_list_visibility,
        manager_id
    )
    VALUES (
        p_group_name,
        p_password,
        p_description,
        p_member_limit,
        new_invite_code,
        p_invite_code_visible,
        p_auto_approve_members,
        p_activity_log_privacy,
        p_export_control,
        p_member_list_visibility,
        p_user_id
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
                'privacySettings', jsonb_build_object(
                    'activityLog', p_activity_log_privacy,
                    'export', p_export_control,
                    'memberList', p_member_list_visibility
                )
            )
        )
    );

    RETURN v_group_id;
END;
$$; 