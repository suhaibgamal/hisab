-- Disable triggers temporarily to avoid foreign key conflicts
SET session_replication_role = 'replica';

-- Truncate all tables in the correct order
TRUNCATE TABLE 
    activity_logs,
    payment_beneficiaries,
    payments,
    settlements,
    group_members,
    groups,
    users
CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Reset all sequences
ALTER SEQUENCE activity_logs_id_seq RESTART WITH 1;
ALTER SEQUENCE payments_id_seq RESTART WITH 1;
ALTER SEQUENCE settlements_id_seq RESTART WITH 1;
ALTER SEQUENCE group_members_id_seq RESTART WITH 1;
ALTER SEQUENCE groups_id_seq RESTART WITH 1;
ALTER SEQUENCE users_id_seq RESTART WITH 1; 