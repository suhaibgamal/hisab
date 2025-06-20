@echo off
echo Starting deployment...
echo.

REM 1. Deploy Supabase Functions
echo Deploying Supabase Functions...
call supabase functions deploy login-or-create-user
call supabase functions deploy join-group
call supabase functions deploy update-group-settings

REM 2. Apply Database Migrations
echo.
echo Applying database migrations...
call supabase db reset

REM 3. Verify Deployment
echo.
echo Verifying deployment...

REM Check if functions are deployed
echo Checking functions...
call supabase functions list

REM Check if migrations are applied
echo Checking migrations...
call supabase db status

echo.
echo Deployment completed!
echo.
echo Important Notes:
echo 1. Users and groups with old password formats will need to reset their passwords
echo 2. Check the admin dashboard for any users/groups marked for password reset
echo 3. Monitor error logs for any password verification issues
echo.
pause 