-- MIGRATION to fix historical settlement data with inverted transaction splits.

-- This script identifies any settlement transaction where the creator (the payer)
-- was incorrectly given a negative amount in the transaction_splits table.
-- It then corrects the record by flipping the sign of both splits associated
-- with that transaction.

-- This corrects the balance calculations for already 'active' bad settlements
-- and ensures pending bad settlements will work correctly if confirmed.

DO $$
DECLARE
  bad_transaction_id uuid;
BEGIN
  -- Loop through all settlement transactions that have the inverted logic
  FOR bad_transaction_id IN
    SELECT t.id
    FROM transactions t
    JOIN transaction_splits ts ON t.id = ts.transaction_id
    WHERE t.type = 'settlement'
      AND t.created_by = ts.user_id -- The split belongs to the creator
      AND ts.amount < 0             -- The creator's split is negative (which is wrong)
  LOOP
    -- For each bad transaction, flip the sign of both of its splits
    UPDATE transaction_splits
    SET amount = -amount
    WHERE transaction_id = bad_transaction_id;

    RAISE NOTICE 'Corrected transaction_splits for settlement: %', bad_transaction_id;
  END LOOP;
END $$; 