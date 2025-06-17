-- Drop existing function if exists
DROP FUNCTION IF EXISTS public.update_group_settings(text,boolean,text,text,uuid,boolean,integer,text,text,text);

-- Recreate with correct parameter names and order
CREATE OR REPLACE FUNCTION public.update_group_settings(
    p_activity_log_privacy text,
    p_auto_approve_members boolean,
    p_description text,
    p_export_control text,
    p_group_id uuid,
    p_invite_code_visible boolean,
    p_member_limit integer,
    p_member_list_visibility text,
    p_name text,
    p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_user_id uuid;
    v_is_manager boolean;
BEGIN
    -- Get the current user's app ID using our tested function
    v_current_user_id := get_current_user_app_id();
    
    -- Check if the user is a manager of the group
    SELECT EXISTS (
        SELECT 1 
        FROM group_members 
        WHERE group_id = p_group_id 
        AND user_id = v_current_user_id 
        AND role = 'manager'
    ) INTO v_is_manager;

    IF NOT v_is_manager THEN
        RAISE EXCEPTION 'User is not authorized to update group settings';
    END IF;

    -- Update group settings
    UPDATE groups 
    SET 
        name = COALESCE(p_name, name),
        description = p_description,
        password = COALESCE(p_password, password),
        member_limit = COALESCE(p_member_limit, member_limit),
        invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
        auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
        activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
        export_control = COALESCE(p_export_control, export_control),
        member_list_visibility = COALESCE(p_member_list_visibility, member_list_visibility),
        updated_at = NOW()
    WHERE id = p_group_id;

    -- Log the activity
    INSERT INTO activity_logs (
        group_id,
        user_id,
        action_type,
        payload
    ) VALUES (
        p_group_id,
        v_current_user_id,
        'group_settings_updated',
        jsonb_build_object(
            'name', p_name,
            'description', p_description,
            'member_limit', p_member_limit,
            'invite_code_visible', p_invite_code_visible,
            'auto_approve_members', p_auto_approve_members,
            'activity_log_privacy', p_activity_log_privacy,
            'export_control', p_export_control,
            'member_list_visibility', p_member_list_visibility
        )
    );
END;
$$; 