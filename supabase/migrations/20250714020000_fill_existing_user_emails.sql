-- Migration: Fill email for existing users with synthetic emails
-- Date: 2025-07-14

UPDATE public.users
SET email = username || '@hisab.local'
WHERE email IS NULL; 