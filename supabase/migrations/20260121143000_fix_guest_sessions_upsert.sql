-- Fix: Add UNIQUE constraint on email column for proper upsert support
ALTER TABLE guest_data_sessions ADD CONSTRAINT guest_data_sessions_email_unique UNIQUE (email);
