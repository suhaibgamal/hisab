-- Wipe all group passwords to force re-creation with new hashing scheme
UPDATE groups SET password = NULL;

-- Add a comment to document the change
COMMENT ON TABLE groups IS 'Groups table. Note: All passwords were wiped in migration 47 due to hashing scheme update.'; 