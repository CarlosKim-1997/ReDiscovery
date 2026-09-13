-- Provider-neutral identity; no passwords/profile or anonymous history merge.
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject varchar(255) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT accounts_subject_nonempty CHECK (external_subject ~ '[^[:space:]]')
);

ALTER TABLE play_sessions
  ADD COLUMN account_id uuid REFERENCES accounts(id),
  ADD COLUMN account_claimed_at timestamptz,
  ADD CONSTRAINT play_sessions_account_claim_pair CHECK (
    (account_id IS NULL) = (account_claimed_at IS NULL)
  ),
  ADD CONSTRAINT play_sessions_account_claim_official CHECK (
    account_id IS NULL OR attempt_type = 'OFFICIAL'
  );

-- No account/Daily uniqueness or speculative account history index in M6-A.
-- anonymous_device_id and existing device-level official uniqueness are retained.
