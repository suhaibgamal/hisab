-- Check row counts for all tables
SELECT 
    'activity_logs' as table_name, COUNT(*) as row_count FROM activity_logs
UNION ALL
SELECT 'payment_beneficiaries', COUNT(*) FROM payment_beneficiaries
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'settlements', COUNT(*) FROM settlements
UNION ALL
SELECT 'group_members', COUNT(*) FROM group_members
UNION ALL
SELECT 'groups', COUNT(*) FROM groups
UNION ALL
SELECT 'users', COUNT(*) FROM users
ORDER BY table_name; 