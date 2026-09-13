-- Domain already defines ERROR_RECOVERABLE; allow it for persisted adaptive pause.
-- No new table/column, no answer mutation, and legacy statuses stay accepted.
ALTER TABLE play_sessions DROP CONSTRAINT play_sessions_status_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_status_check CHECK (status IN (
  'THINKING', 'EVALUATING', 'LOCKABLE', 'SYNTHESIZING', 'REVEAL_READY', 'LOCKED', 'REVEALED', 'ERROR_RECOVERABLE'
));
