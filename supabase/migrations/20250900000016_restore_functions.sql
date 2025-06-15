-- Helper functions
CREATE OR REPLACE FUNCTION public.get_current_user_app_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id 
  FROM public.users 
  WHERE supabase_auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public._get_uid_for_user_id(user_id_param UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_id UUID;
BEGIN
  SELECT supabase_auth_id INTO auth_id FROM public.users WHERE id = user_id_param;
  RETURN auth_id;
END;
$$;

-- Group Management Functions
CREATE OR REPLACE FUNCTION public.create_group_with_manager(
  p_group_name TEXT,
  p_password_hash TEXT DEFAULT NULL,
  p_user_display_name TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id UUID;
  new_invite_code TEXT;
  v_user_id UUID;
BEGIN
  -- Get or set user ID
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  -- Generate a random invite code
  new_invite_code := upper(substring(md5(random()::text) for 8));

  -- Insert the new group
  INSERT INTO public.groups (
    name,
    password,
    manager_id,
    invite_code
  )
  VALUES (
    p_group_name,
    p_password_hash,
    v_user_id,
    new_invite_code
  )
  RETURNING id INTO new_group_id;

  -- Set the creator as the group manager
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role
  )
  VALUES (
    new_group_id,
    v_user_id,
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
    new_group_id,
    v_user_id,
    'group_created',
    jsonb_build_object(
      'groupName', p_group_name,
      'creatorName', p_user_display_name
    )
  );

  RETURN new_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_group_exists(group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = group_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_group_manager(group_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_id_param
    AND g.manager_id = public.get_current_user_app_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_group_member(group_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = group_id_param
    AND gm.user_id = public.get_current_user_app_id()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kick_group_member(
  p_group_id UUID,
  p_user_to_kick_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kicker_id UUID;
  v_kicker_role TEXT;
  v_kickee_role TEXT;
BEGIN
  -- Get the current user's ID
  SELECT public.get_current_user_app_id() INTO v_kicker_id;
  
  -- Get roles
  SELECT role INTO v_kicker_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_kicker_id;
  
  SELECT role INTO v_kickee_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
  
  -- Check permissions
  IF v_kicker_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;
  
  IF v_kicker_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can kick members';
  END IF;
  
  IF v_kickee_role = 'manager' THEN
    RAISE EXCEPTION 'Cannot kick a manager';
  END IF;
  
  -- Delete the member
  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
END;
$$;

-- Payment Functions
CREATE OR REPLACE FUNCTION public.delete_payment(payment_id_to_delete UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security Check: Ensure the current user is the payer of the payment
  IF NOT EXISTS (
    SELECT 1
    FROM public.payments
    WHERE id = payment_id_to_delete
    AND payer_id = public.get_current_user_app_id()
  ) THEN
    RAISE EXCEPTION 'User is not authorized to delete this payment or payment does not exist.';
  END IF;

  -- Delete the associated beneficiaries first
  DELETE FROM public.payment_beneficiaries
  WHERE payment_id = payment_id_to_delete;
  
  -- Delete the main payment record
  DELETE FROM public.payments
  WHERE id = payment_id_to_delete;
END;
$$;

-- Settlement Functions
CREATE OR REPLACE FUNCTION public.cancel_settlement(settlement_id_to_cancel UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security Check: Ensure the current user is the initiator of the settlement
  -- and that the settlement is still in 'pending' status
  IF NOT EXISTS (
    SELECT 1
    FROM public.settlements
    WHERE id = settlement_id_to_cancel
    AND from_user_id = public.get_current_user_app_id()
    AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'User is not authorized to cancel this settlement or settlement is not pending.';
  END IF;
  
  -- Update the settlement status
  UPDATE public.settlements
  SET 
    status = 'cancelled',
    cancelled_at = now()
  WHERE id = settlement_id_to_cancel;
END;
$$;

-- Group Settings Functions
CREATE OR REPLACE FUNCTION public.update_group_settings(
  p_group_id UUID,
  p_name TEXT,
  p_password_hash TEXT,
  p_member_limit INTEGER,
  p_invite_code_visible BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_old_password TEXT;
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

  -- Get the current password
  SELECT password INTO v_old_password
  FROM public.groups
  WHERE id = p_group_id;

  -- Update group settings
  UPDATE public.groups
  SET
    name = COALESCE(p_name, name),
    password = COALESCE(p_password_hash, password),
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible)
  WHERE id = p_group_id;

  -- If password was changed, remove all non-manager members for security
  IF p_password_hash IS NOT NULL AND p_password_hash != v_old_password THEN
    DELETE FROM public.group_members
    WHERE group_id = p_group_id
    AND role != 'manager';
  END IF;
END;
$$; 