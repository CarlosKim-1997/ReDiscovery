ALTER TABLE user_answers
  ADD CONSTRAINT user_answers_session_id_id_key UNIQUE (session_id, id);

ALTER TABLE daily_schedule
  ADD CONSTRAINT daily_schedule_id_content_version_key UNIQUE (id, content_version_id);

ALTER TABLE play_sessions
  ADD CONSTRAINT play_sessions_id_daily_key UNIQUE (id, daily_id);

ALTER TABLE play_sessions DROP CONSTRAINT play_sessions_lock_answer_fk;
ALTER TABLE play_sessions DROP CONSTRAINT play_sessions_daily_id_fkey;
ALTER TABLE play_sessions DROP CONSTRAINT play_sessions_content_version_id_fkey;
ALTER TABLE node_discoveries DROP CONSTRAINT node_discoveries_first_answer_id_fkey;
ALTER TABLE node_discoveries DROP CONSTRAINT node_discoveries_contradiction_answer_id_fkey;
ALTER TABLE daily_completions DROP CONSTRAINT daily_completions_session_id_fkey;

ALTER TABLE play_sessions
  ADD CONSTRAINT play_sessions_daily_content_binding_fk
  FOREIGN KEY (daily_id, content_version_id)
  REFERENCES daily_schedule(id, content_version_id);

ALTER TABLE play_sessions
  ADD CONSTRAINT play_sessions_lock_answer_ownership_fk
  FOREIGN KEY (id, lock_answer_id)
  REFERENCES user_answers(session_id, id);

ALTER TABLE node_discoveries
  ADD CONSTRAINT node_discoveries_evidence_ownership_fk
  FOREIGN KEY (session_id, first_answer_id)
  REFERENCES user_answers(session_id, id);

ALTER TABLE node_discoveries
  ADD CONSTRAINT node_discoveries_contradiction_ownership_fk
  FOREIGN KEY (session_id, contradiction_answer_id)
  REFERENCES user_answers(session_id, id);

ALTER TABLE daily_completions
  ADD CONSTRAINT daily_completions_session_daily_fk
  FOREIGN KEY (session_id, daily_id)
  REFERENCES play_sessions(id, daily_id) ON DELETE CASCADE;

CREATE FUNCTION reject_play_session_binding_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.daily_id IS DISTINCT FROM OLD.daily_id
     OR NEW.content_version_id IS DISTINCT FROM OLD.content_version_id THEN
    RAISE EXCEPTION 'play session Daily and content version binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_play_session_binding
BEFORE UPDATE OF daily_id, content_version_id ON play_sessions
FOR EACH ROW EXECUTE FUNCTION reject_play_session_binding_mutation();

COMMENT ON COLUMN user_answers.char_count IS
  'PostgreSQL character count (char_length), preserving raw text without normalization.';
