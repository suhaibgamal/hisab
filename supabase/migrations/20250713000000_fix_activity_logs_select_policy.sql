-- Migration: Fix ambiguity in activity_logs_select_policy for activity_logs RLS
-- Date: 2025-07-13

DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;

CREATE POLICY "activity_logs_select_policy"
ON public.activity_logs
FOR SELECT
USING (public.can_view_activity_logs(group_id)); 