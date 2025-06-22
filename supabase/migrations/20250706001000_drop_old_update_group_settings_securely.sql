-- Migration: Drop old 8-parameter update_group_settings_securely function
-- Date: 2025-07-06
 
DROP FUNCTION IF EXISTS public.update_group_settings_securely(
  uuid, text, text, text, integer, boolean, text, text
); 