-- Migration: Add email column to users table for password reset support
-- Date: 2025-07-14

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- Add a unique index for email, but allow multiple NULLs (for existing users)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON public.users (email) WHERE email IS NOT NULL; 