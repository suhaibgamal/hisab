-- Create users table first (as it's referenced by other tables)
CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "username" "text" NOT NULL,
    "password_hash" "text",
    "supabase_auth_id" "uuid"
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" OWNER TO "postgres";
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");
CREATE UNIQUE INDEX "users_supabase_auth_id_idx" ON "public"."users" USING "btree" ("supabase_auth_id");
CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username");

-- Create groups table
CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "invite_code" "text" NOT NULL,
    "is_public" boolean DEFAULT false,
    "max_members" integer DEFAULT 10 NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "password" "text",
    "member_limit" integer,
    "invite_code_visible" boolean DEFAULT true
);

ALTER TABLE ONLY "public"."groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."groups" OWNER TO "postgres";
ALTER TABLE ONLY "public"."groups" ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."groups" ADD CONSTRAINT "groups_invite_code_key" UNIQUE ("invite_code");
ALTER TABLE ONLY "public"."groups" ADD CONSTRAINT "groups_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- Create group_members table
CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_members_role_check" CHECK (("role" = ANY (ARRAY['manager'::"text", 'member'::"text"])))
);

ALTER TABLE ONLY "public"."group_members" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."group_members" OWNER TO "postgres";
ALTER TABLE ONLY "public"."group_members" ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."group_members" ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");
ALTER TABLE ONLY "public"."group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "idx_group_members_user_group" ON "public"."group_members" USING "btree" ("user_id", "group_id");

-- Create payments table
CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "description" "text",
    "payment_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments" OWNER TO "postgres";
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payments" ADD CONSTRAINT "payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "idx_payments_group_payer" ON "public"."payments" USING "btree" ("group_id", "payer_id");

-- Create payment_beneficiaries table
CREATE TABLE IF NOT EXISTS "public"."payment_beneficiaries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "beneficiary_user_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."payment_beneficiaries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_beneficiaries" OWNER TO "postgres";
ALTER TABLE ONLY "public"."payment_beneficiaries" ADD CONSTRAINT "payment_beneficiaries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."payment_beneficiaries" ADD CONSTRAINT "payment_beneficiaries_payment_id_beneficiary_user_id_key" UNIQUE ("payment_id", "beneficiary_user_id");
ALTER TABLE ONLY "public"."payment_beneficiaries" ADD CONSTRAINT "payment_beneficiaries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."payment_beneficiaries" ADD CONSTRAINT "payment_beneficiaries_beneficiary_user_id_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- Create settlements table
CREATE TABLE IF NOT EXISTS "public"."settlements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "initiated_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "settlements_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."settlements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."settlements" OWNER TO "postgres";
ALTER TABLE ONLY "public"."settlements" ADD CONSTRAINT "settlements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."settlements" ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."settlements" ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."settlements" ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "idx_settlements_users" ON "public"."settlements" USING "btree" ("from_user_id", "to_user_id");

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "group_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."activity_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_logs" OWNER TO "postgres";
ALTER TABLE ONLY "public"."activity_logs" ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."activity_logs" ADD CONSTRAINT "activity_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
CREATE INDEX "idx_activity_logs_group" ON "public"."activity_logs" USING "btree" ("group_id"); 