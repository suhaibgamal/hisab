-- Step 1: Drop the old function completely to avoid signature conflicts.
DROP FUNCTION IF EXISTS public.get_groups_for_user(uuid);

-- Step 2: Recreate the function with the correct signature and security model.
CREATE OR REPLACE FUNCTION public.get_groups_for_user(p_user_id uuid)
RETURNS TABLE(group_id uuid, group_name text, member_count bigint, total_spending numeric)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    g.id as group_id,
    g.name as group_name,
    (SELECT COUNT(*) FROM public.group_members gm_count WHERE gm_count.group_id = g.id) as member_count,
    (SELECT COALESCE(SUM(ts.amount), 0) FROM public.transactions t JOIN public.transaction_splits ts ON t.id = ts.transaction_id WHERE t.group_id = g.id AND ts.amount > 0) as total_spending
  FROM
    public.groups g
  JOIN
    public.group_members gm ON g.id = gm.group_id
  WHERE
    gm.user_id = p_user_id;
$$;

-- Grant execution rights to authenticated users
GRANT EXECUTE ON FUNCTION public.get_groups_for_user(uuid) TO authenticated;
