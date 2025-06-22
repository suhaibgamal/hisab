-- Migration to remove unused cancel_settlement function
DROP FUNCTION IF EXISTS public.cancel_settlement(uuid); 