# Project Plan for Arabic Expense Sharing Web App (Hisab App)

## **AI AGENT INSTRUCTIONS:**

This document serves as the comprehensive technical plan for building the "Arabic Expense Sharing Web App".

Your task is to implement this application feature by feature, starting from the current state and proceeding sequentially through all defined phases.

**Current Project Status (as of last interaction):**

- **Language:** JavaScript (JS). All code generated should be in JS.
- **Project Structure:** No `src` folder. All `app` router pages, components, and `lib` files will be directly in the project root.
- **Next.js Project:** Initialized with Tailwind CSS and App Router.
- **Supabase Setup:** Project linked. All core tables (`users`, `groups`, `group_members`, `payments`, `payment_beneficiaries`, `settlements`, `activity_logs`) are created in the database.
- **Environment Variables:** Configured in `.env.local`.
- **Docker Desktop:** Installed and running, `supabase db pull`/`push` works.
- **Supabase Client:** `lib/supabase.js` is created and initialized.
- **Phase 2: Authentication Flow (app/page.js):**
  - Name entry form implemented.
  - User existence check, creation, and `localStorage` storage implemented.
  - `alert()` calls have been successfully replaced with `setError` state and UI display.
- **Phase 3: Group Management (app/page.js & app/group/[groupId]/page.js):**
  - Users can create new groups.
  - Current user automatically assigned as manager.
  - List of user's groups is displayed as clickable links.
  - Navigation to dedicated dynamic group page (`/group/[groupId]`) implemented.
  - Placeholder for dynamic group page created (`app/group/[groupId]/page.js`).
  - Group joining functionality implemented (via invite code).
- **Phase 4: Expense Tracking (app/group/[groupId]/page.js):**
  - "Add Payment" form implemented.
  - Logic for submitting payments to `payments` and `payment_beneficiaries` tables implemented.
  - Fetching and basic display of existing payments within a group implemented.

**Your Next Task (After user confirms RLS & updates README.md):**
Proceed with **Phase 5: Balances & Settlements**. Specifically, you need to:

1.  **Implement Balance Calculation:** Create the necessary logic to calculate net balances for all members within the current group. This should show who owes whom, and by how much. For now, you can display basic pairwise balances.
2.  **Display Balances in UI:** Integrate this balance information into the `app/group/[groupId]/page.js` to provide users with an overview of the group's financial standing.
3.  **Implement Settlement Workflow:** Add UI and logic for users to initiate and confirm settlements.

**Work incrementally. Before implementing a new major feature, confirm the previous one is stable.**

---

### Phase 1: Database Schema & Row Level Security (AI Agent Task)

**Objective:** Complete the precise database tables, relationships, and implement robust Row Level Security (RLS) for data integrity and privacy.

_(AI Agent Note: This phase's table creation and RLS policy definition are largely complete based on prior interactions. The primary remaining task is to ensure all RLS policies are accurately applied to the cloud database.)_

1.  **`payments` Table:**

    ```sql
    CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
        payer_id UUID REFERENCES users(id) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        description TEXT,
        payment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- Gregorian date
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    ```

    - **RLS Policy Definition:**
      - `ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;`
      - `CREATE POLICY "Allow group members to view payments" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid()));`
      - `CREATE POLICY "Allow group members to insert payments" ON public.payments FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid()));`
      - `CREATE POLICY "Allow payer or manager to update payments" ON public.payments FOR UPDATE USING (payer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid() AND role = 'manager')) WITH CHECK (payer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid() AND role = 'manager'));`
      - `CREATE POLICY "Allow payer or manager to delete payments" ON public.payments FOR DELETE USING (payer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid() AND role = 'manager'));`

2.  **`payment_beneficiaries` Table:**

    ```sql
    CREATE TABLE payment_beneficiaries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id UUID REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
        beneficiary_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        UNIQUE (payment_id, beneficiary_user_id) -- Ensure no duplicate beneficiaries per payment
    );
    ```

    - **RLS Policy Definition:**
      - `ALTER TABLE public.payment_beneficiaries ENABLE ROW LEVEL SECURITY;`
      - `CREATE POLICY "Allow group members to view payment beneficiaries" ON public.payment_beneficiaries FOR SELECT USING (EXISTS (SELECT 1 FROM public.payments WHERE id = payment_beneficiaries.payment_id AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())));`
      - `CREATE POLICY "Allow inserts from payment owner/manager" ON public.payment_beneficiaries FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.payments WHERE id = payment_beneficiaries.payment_id AND (payer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid() AND role = 'manager'))));`
      - `CREATE POLICY "Deny all updates on payment_beneficiaries" ON public.payment_beneficiaries FOR UPDATE USING (false);`
      - `CREATE POLICY "Allow payer or manager to delete payment_beneficiaries" ON public.payment_beneficiaries FOR DELETE USING (EXISTS (SELECT 1 FROM public.payments WHERE id = payment_beneficiaries.payment_id AND (payer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = payments.group_id AND user_id = auth.uid() AND role = 'manager'))));`

3.  **`settlements` Table:**

    ```sql
    CREATE TABLE settlements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
        from_user_id UUID REFERENCES users(id) NOT NULL,
        to_user_id UUID REFERENCES users(id) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        status TEXT CHECK (status IN ('pending', 'confirmed', 'cancelled')) NOT NULL DEFAULT 'pending',
        initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        confirmed_at TIMESTAMP WITH TIME ZONE, -- NULL until confirmed
        cancelled_at TIMESTAMP WITH TIME ZONE
    );
    ```

    - **RLS Policy Definition:**
      - `ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;`
      - `CREATE POLICY "Allow participants or manager to view settlements" ON public.settlements FOR SELECT USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = settlements.group_id AND user_id = auth.uid() AND role = 'manager'));`
      - `CREATE POLICY "Allow participants or manager to insert settlements" ON public.settlements FOR INSERT WITH CHECK (from_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = settlements.group_id AND user_id = auth.uid() AND role = 'manager'));`
      - `CREATE POLICY "Allow receiver or manager to confirm/cancel settlement" ON public.settlements FOR UPDATE USING (to_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = settlements.group_id AND user_id = auth.uid() AND role = 'manager')) WITH CHECK (to_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = settlements.group_id AND user_id = auth.uid() AND role = 'manager'));`
      - `CREATE POLICY "Allow initiator or manager to delete settlement" ON public.settlements FOR DELETE USING (from_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = settlements.group_id AND user_id = auth.uid() AND role = 'manager'));`

4.  **`activity_logs` Table:**

    ```sql
    CREATE TABLE activity_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Who performed the action
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
        action_type TEXT NOT NULL, -- e.g., 'payment_added', 'settlement_confirmed', 'group_locked'
        payload JSONB NOT NULL, -- Detailed JSON data about the action
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    ```

    - **RLS Policy Definition:**
      - `ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;`
      - `CREATE POLICY "Allow manager to view all group activity logs" ON public.activity_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = activity_logs.group_id AND user_id = auth.uid() AND role = 'manager'));`
      - `CREATE POLICY "Allow users to view their own activity logs" ON public.activity_logs FOR SELECT USING (user_id = auth.uid());`
      - `CREATE POLICY "Deny all inserts from client" ON public.activity_logs FOR INSERT WITH CHECK (false); -- Inserts should happen via functions/triggers only`
      - `CREATE POLICY "Deny all updates from client" ON public.activity_logs FOR UPDATE USING (false);`
      - `CREATE POLICY "Deny all deletes from client" ON public.activity_logs FOR DELETE USING (false);`

5.  **RLS for `users` table:**

    - `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;`
    - `CREATE POLICY "Users can view their own data" ON public.users FOR SELECT USING (auth.uid() = id);`
    - `CREATE POLICY "Users can update their own data" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);`

6.  **RLS for `groups` table:**

    - `ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;`
    - `CREATE POLICY "Group members can view their groups" ON public.groups FOR SELECT USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid()));`
    - `CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.role() = 'authenticated');`
    - `CREATE POLICY "Group managers can update their groups" ON public.groups FOR UPDATE USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'manager')) WITH CHECK (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'manager'));`
    - `CREATE POLICY "Group managers can delete their groups" ON public.groups FOR DELETE USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'manager'));`

7.  **RLS for `group_members` table:**
    - `ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;`
    - `CREATE POLICY "Allow members to view other members in their groups" ON public.group_members FOR SELECT USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()));`
    - `CREATE POLICY "Allow users to join groups" ON public.group_members FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.groups WHERE groups.id = group_members.group_id AND groups.is_public = TRUE)); -- or based on invite code validation if added later`
    - `CREATE POLICY "Allow managers to add/remove/update other members" ON public.group_members FOR ALL USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'manager'));`

---

**Phases mentioned in this `README.md` are:**

- **Phase 1: Database Schema & Row Level Security**
- **Phase 2: Authentication Flow**
- **Phase 3: Group Management**
- **Phase 4: Expense Tracking**
- **Phase 5: Balances & Settlements** (This is the next phase for the AI to work on, as per your previous instruction.)

Now, please ensure this entire content is saved into your `README.md` file, and then proceed with the prompt for Cursor that I provided in the last message!
