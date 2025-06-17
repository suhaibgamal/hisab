-- Add created_at column to group_members table
ALTER TABLE group_members ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have a created_at value
UPDATE group_members SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL; 