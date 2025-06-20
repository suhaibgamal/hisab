#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting deployment...${NC}"

# 1. Deploy Supabase Functions
echo -e "\n${YELLOW}Deploying Supabase Functions...${NC}"
supabase functions deploy login-or-create-user
supabase functions deploy join-group
supabase functions deploy update-group-settings

# 2. Apply Database Migrations
echo -e "\n${YELLOW}Applying database migrations...${NC}"
supabase db reset # This will apply all migrations

# 3. Verify Deployment
echo -e "\n${YELLOW}Verifying deployment...${NC}"

# Check if functions are deployed
echo "Checking functions..."
supabase functions list

# Check if migrations are applied
echo "Checking migrations..."
supabase db status

echo -e "\n${GREEN}Deployment completed!${NC}"
echo -e "${YELLOW}Important Notes:${NC}"
echo "1. Users and groups with old password formats will need to reset their passwords"
echo "2. Check the admin dashboard for any users/groups marked for password reset"
echo "3. Monitor error logs for any password verification issues" 