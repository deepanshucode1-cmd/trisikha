-- Fix: Add UNIQUE constraint on email column for proper upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'guest_data_sessions_email_unique'
  ) THEN
    ALTER TABLE guest_data_sessions ADD CONSTRAINT guest_data_sessions_email_unique UNIQUE (email);
  END IF;
END $$;
