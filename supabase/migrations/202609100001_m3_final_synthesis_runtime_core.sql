ALTER TABLE play_sessions DROP CONSTRAINT play_sessions_status_check;
ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_status_check CHECK (status IN (
  'THINKING', 'EVALUATING', 'LOCKABLE', 'SYNTHESIZING', 'REVEAL_READY', 'LOCKED', 'REVEALED'
));

ALTER TABLE play_sessions
  ADD COLUMN synthesis_entry_reason text,
  ADD COLUMN synthesis_entered_at timestamptz,
  ADD COLUMN synthesis_skipped_at timestamptz,
  ADD COLUMN verified_synthesis_attempt_id uuid,
  ADD CONSTRAINT play_sessions_synthesis_entry_check CHECK (
    (synthesis_entry_reason IS NULL AND synthesis_entered_at IS NULL)
    OR (synthesis_entry_reason IN ('DISCOVERY_READY', 'RESCUE_EXHAUSTED') AND synthesis_entered_at IS NOT NULL)
  ),
  ADD CONSTRAINT play_sessions_lock_evidence_exclusive_check CHECK (
    NOT (lock_answer_id IS NOT NULL AND verified_synthesis_attempt_id IS NOT NULL)
  ),
  ADD CONSTRAINT play_sessions_lock_timestamp_authority_check CHECK (
    (locked_at IS NOT NULL) = (lock_answer_id IS NOT NULL OR verified_synthesis_attempt_id IS NOT NULL)
  ),
  ADD CONSTRAINT play_sessions_skip_evidence_check CHECK (
    synthesis_skipped_at IS NULL OR (verified_synthesis_attempt_id IS NULL AND lock_answer_id IS NULL)
  ),
  ADD CONSTRAINT play_sessions_synthesizing_evidence_check CHECK (
    status <> 'SYNTHESIZING'
    OR (lock_answer_id IS NULL AND verified_synthesis_attempt_id IS NULL AND locked_at IS NULL)
  ),
  ADD CONSTRAINT play_sessions_reveal_ready_check CHECK (
    status <> 'REVEAL_READY'
    OR (lock_answer_id IS NULL AND verified_synthesis_attempt_id IS NULL AND locked_at IS NULL)
  ),
  ADD CONSTRAINT play_sessions_locked_evidence_check CHECK (
    status <> 'LOCKED'
    OR (((lock_answer_id IS NOT NULL)::integer + (verified_synthesis_attempt_id IS NOT NULL)::integer) = 1
        AND locked_at IS NOT NULL)
  ),
  ADD CONSTRAINT play_sessions_revealed_lock_timestamp_check CHECK (
    status <> 'REVEALED'
    OR ((lock_answer_id IS NOT NULL OR verified_synthesis_attempt_id IS NOT NULL) = (locked_at IS NOT NULL))
  );

CREATE FUNCTION utf16_code_unit_length(value text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE
  result integer := char_length(value);
  index integer;
BEGIN
  FOR index IN 1..char_length(value) LOOP
    IF ascii(substring(value FROM index FOR 1)) > 65535 THEN
      result := result + 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION utf16_code_unit_length(text) IS
  'Counts JavaScript UTF-16 code units for Final Synthesis limits; does not alter historical answer counts.';

CREATE TABLE final_synthesis_attempts (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  attempt_number smallint NOT NULL CHECK (attempt_number IN (1, 2)),
  submission_key_hash char(64) NOT NULL CHECK (submission_key_hash ~ '^[0-9a-f]{64}$'),
  submission_text_hash char(64) NOT NULL CHECK (submission_text_hash ~ '^[0-9a-f]{64}$'),
  text text,
  char_count integer NOT NULL CHECK (char_count BETWEEN 1 AND 500),
  submitted_at timestamptz NOT NULL,
  evaluation_state text NOT NULL CHECK (evaluation_state IN ('EVALUATING', 'VERIFIED', 'INSUFFICIENT', 'ERROR_RECOVERABLE')),
  evaluation_generation integer NOT NULL DEFAULT 1 CHECK (evaluation_generation > 0),
  evaluation_started_at timestamptz,
  evaluation_lease_expires_at timestamptz,
  evaluated_at timestamptz,
  last_error_at timestamptz,
  proof_contract_version text NOT NULL CHECK (proof_contract_version = 'final-synthesis-proof-v1'),
  redacted_result jsonb,
  failure_category text CHECK (failure_category IS NULL OR failure_category IN (
    'PROVIDER_UNAVAILABLE', 'STRUCTURED_OUTPUT_INVALID', 'PROOF_SHAPE_INVALID',
    'NODE_SET_INVALID', 'PROOF_RECORD_INVALID', 'EVIDENCE_UNIT_INVALID'
  )),
  purged_at timestamptz,
  updated_at timestamptz NOT NULL,
  UNIQUE (session_id, attempt_number),
  UNIQUE (session_id, submission_key_hash),
  UNIQUE (session_id, id),
  CHECK ((purged_at IS NULL AND text IS NOT NULL AND utf16_code_unit_length(text) = char_count)
      OR (purged_at IS NOT NULL AND text IS NULL)),
  CHECK (evaluation_lease_expires_at IS NULL OR evaluation_lease_expires_at > evaluation_started_at),
  CHECK (
    (evaluation_state = 'EVALUATING'
      AND evaluation_started_at IS NOT NULL AND evaluation_lease_expires_at IS NOT NULL
      AND evaluated_at IS NULL AND last_error_at IS NULL AND redacted_result IS NULL AND failure_category IS NULL)
    OR (evaluation_state IN ('VERIFIED', 'INSUFFICIENT')
      AND evaluation_started_at IS NOT NULL AND evaluation_lease_expires_at IS NULL
      AND evaluated_at IS NOT NULL AND last_error_at IS NULL AND redacted_result IS NOT NULL AND failure_category IS NULL)
    OR (evaluation_state = 'ERROR_RECOVERABLE'
      AND evaluation_started_at IS NOT NULL AND evaluation_lease_expires_at IS NULL
      AND evaluated_at IS NULL AND last_error_at IS NOT NULL AND redacted_result IS NULL AND failure_category IS NOT NULL)
  )
);

CREATE INDEX final_synthesis_attempts_session_submitted_idx
  ON final_synthesis_attempts(session_id, submitted_at);
CREATE INDEX final_synthesis_attempts_recovery_idx
  ON final_synthesis_attempts(evaluation_state, evaluation_lease_expires_at)
  WHERE evaluation_state IN ('EVALUATING', 'ERROR_RECOVERABLE');

CREATE FUNCTION protect_final_synthesis_attempt_authority() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
     OR NEW.submission_key_hash IS DISTINCT FROM OLD.submission_key_hash
     OR NEW.submission_text_hash IS DISTINCT FROM OLD.submission_text_hash
     OR NEW.char_count IS DISTINCT FROM OLD.char_count
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.proof_contract_version IS DISTINCT FROM OLD.proof_contract_version THEN
    RAISE EXCEPTION 'final synthesis attempt identity is immutable';
  END IF;
  IF OLD.evaluation_state IN ('VERIFIED', 'INSUFFICIENT') AND (
     NEW.evaluation_state IS DISTINCT FROM OLD.evaluation_state
     OR NEW.evaluation_generation IS DISTINCT FROM OLD.evaluation_generation
     OR NEW.evaluated_at IS DISTINCT FROM OLD.evaluated_at
     OR NEW.redacted_result IS DISTINCT FROM OLD.redacted_result) THEN
    RAISE EXCEPTION 'terminal final synthesis evaluation is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_final_synthesis_attempt_authority
BEFORE UPDATE ON final_synthesis_attempts
FOR EACH ROW EXECUTE FUNCTION protect_final_synthesis_attempt_authority();

ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_verified_synthesis_ownership_fk
  FOREIGN KEY (id, verified_synthesis_attempt_id)
  REFERENCES final_synthesis_attempts(session_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION enforce_verified_synthesis_lock_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_synthesis_attempt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM final_synthesis_attempts a
    WHERE a.id = NEW.verified_synthesis_attempt_id
      AND a.session_id = NEW.id
      AND a.evaluation_state = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'verified synthesis lock evidence must reference a VERIFIED attempt in the same session';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER verified_synthesis_lock_evidence
AFTER INSERT OR UPDATE OF verified_synthesis_attempt_id ON play_sessions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_verified_synthesis_lock_evidence();

ALTER TABLE ai_runs DROP CONSTRAINT ai_runs_purpose_check;
ALTER TABLE ai_runs DROP CONSTRAINT ai_runs_failure_category_check;
ALTER TABLE ai_runs DROP CONSTRAINT ai_runs_failure_category_status_check;

ALTER TABLE ai_runs
  ADD COLUMN synthesis_attempt_id uuid,
  ADD COLUMN evaluation_generation integer,
  ADD CONSTRAINT ai_runs_purpose_check CHECK (purpose IN ('JUDGE', 'FINAL_SYNTHESIS_VERIFY')),
  ADD CONSTRAINT ai_runs_synthesis_attempt_fk FOREIGN KEY (session_id, synthesis_attempt_id)
    REFERENCES final_synthesis_attempts(session_id, id),
  ADD CONSTRAINT ai_runs_provenance_check CHECK (
    (purpose = 'JUDGE' AND synthesis_attempt_id IS NULL AND evaluation_generation IS NULL)
    OR (purpose = 'FINAL_SYNTHESIS_VERIFY' AND session_id IS NOT NULL AND answer_id IS NULL
        AND synthesis_attempt_id IS NOT NULL AND evaluation_generation > 0)
  ),
  ADD CONSTRAINT ai_runs_failure_category_check CHECK (failure_category IS NULL OR failure_category IN (
    'STRUCTURED_OUTPUT_INVALID', 'NODE_SET_INVALID', 'STATUS_EVIDENCE_INVALID',
    'EVIDENCE_NOT_LITERAL', 'EVIDENCE_NOT_UNIQUE', 'PROVIDER_UNAVAILABLE',
    'PROOF_SHAPE_INVALID', 'PROOF_RECORD_INVALID', 'EVIDENCE_UNIT_INVALID'
  )),
  ADD CONSTRAINT ai_runs_failure_category_status_check CHECK (
    failure_category IS NULL
    OR (failure_category = 'PROVIDER_UNAVAILABLE' AND result_status = 'PROVIDER_ERROR')
    OR (failure_category <> 'PROVIDER_UNAVAILABLE' AND result_status = 'SCHEMA_ERROR')
  );

CREATE UNIQUE INDEX ai_runs_final_synthesis_attempt_generation_attempt_key
  ON ai_runs(synthesis_attempt_id, evaluation_generation, attempt)
  WHERE purpose = 'FINAL_SYNTHESIS_VERIFY';

COMMENT ON TABLE final_synthesis_attempts IS
  'User-authored Final Synthesis submissions. Raw text is purgeable; redacted proof contains no literal evidence.';
COMMENT ON COLUMN final_synthesis_attempts.char_count IS
  'JavaScript-compatible UTF-16 code-unit count enforced by utf16_code_unit_length(text).';
COMMENT ON COLUMN ai_runs.synthesis_attempt_id IS
  'Redacted provenance for FINAL_SYNTHESIS_VERIFY runs; never stores synthesis text, prompt, response, or literal evidence.';
