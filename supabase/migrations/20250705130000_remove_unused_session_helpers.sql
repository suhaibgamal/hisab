-- Migration: Remove unused session helper functions
-- Date: 2025-07-05

DROP FUNCTION IF EXISTS public.set_current_user_id(uuid);
DROP FUNCTION IF EXISTS public.set_current_username(text); 