-- Add new columns to groups table
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS auto_approve_members BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_log_privacy TEXT DEFAULT 'members' CHECK (activity_log_privacy IN ('all', 'members', 'managers')),
  ADD COLUMN IF NOT EXISTS export_control TEXT DEFAULT 'members' CHECK (export_control IN ('all', 'members', 'managers')),
  ADD COLUMN IF NOT EXISTS member_list_visibility TEXT DEFAULT 'members' CHECK (member_list_visibility IN ('all', 'members', 'managers')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update RLS policies to reflect new privacy settings
CREATE OR REPLACE FUNCTION public.can_view_group_members(group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_visibility TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();
  
  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;
  
  -- Get group's member list visibility setting
  SELECT member_list_visibility INTO v_visibility 
  FROM public.groups 
  WHERE id = $1;
  
  RETURN 
    CASE v_visibility
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the group members view policy
DROP POLICY IF EXISTS "group_members_select_policy" ON "public"."group_members";
CREATE POLICY "group_members_select_policy" ON "public"."group_members"
FOR SELECT
USING (
  public.can_view_group_members(group_id)
);

-- Create function to check if user can export group data
CREATE OR REPLACE FUNCTION public.can_export_group_data(group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_export_control TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();
  
  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;
  
  -- Get group's export control setting
  SELECT export_control INTO v_export_control 
  FROM public.groups 
  WHERE id = $1;
  
  RETURN 
    CASE v_export_control
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user can view activity logs
CREATE OR REPLACE FUNCTION public.can_view_activity_logs(group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_privacy TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();
  
  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;
  
  -- Get group's activity log privacy setting
  SELECT activity_log_privacy INTO v_privacy 
  FROM public.groups 
  WHERE id = $1;
  
  RETURN 
    CASE v_privacy
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the activity logs view policy
DROP POLICY IF EXISTS "activity_logs_select_policy" ON "public"."activity_logs";
CREATE POLICY "activity_logs_select_policy" ON "public"."activity_logs"
FOR SELECT
USING (
  public.can_view_activity_logs(group_id)
);

-- Add comment to explain the settings
COMMENT ON TABLE public.groups IS 'Groups table with enhanced privacy and security settings:
- description: Optional group description
- auto_approve_members: If true, new members are automatically approved
- activity_log_privacy: Controls who can view activity logs (all/members/managers)
- export_control: Controls who can export group data (all/members/managers)
- member_list_visibility: Controls who can view the member list (all/members/managers)
- updated_at: Last update timestamp'; 