CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id),
  version integer NOT NULL CHECK (version > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  content_hash text NOT NULL CHECK (length(content_hash) = 64),
  status text NOT NULL CHECK (status IN ('APPROVED')),
  public_play jsonb NOT NULL,
  judge_rubric jsonb NOT NULL,
  server_policy jsonb NOT NULL,
  reveal_content jsonb NOT NULL,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, version),
  UNIQUE (content_hash)
);

CREATE TABLE daily_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_date date NOT NULL UNIQUE,
  sequence_number integer NOT NULL UNIQUE CHECK (sequence_number > 0),
  release_at timestamptz NOT NULL,
  content_version_id uuid NOT NULL REFERENCES content_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (release_at = canonical_date::timestamp AT TIME ZONE 'Asia/Seoul')
);

CREATE TABLE anonymous_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE TABLE play_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_id uuid NOT NULL REFERENCES daily_schedule(id),
  content_version_id uuid NOT NULL REFERENCES content_versions(id),
  anonymous_device_id uuid NOT NULL REFERENCES anonymous_devices(id),
  attempt_type text NOT NULL CHECK (attempt_type IN ('OFFICIAL', 'PRACTICE')),
  status text NOT NULL CHECK (status IN ('THINKING', 'EVALUATING', 'LOCKABLE', 'LOCKED', 'REVEALED')),
  stage text NOT NULL CHECK (stage IN ('BLIND', 'REFLECT', 'NUDGE', 'CORRECTION', 'RESCUE')),
  turn_count integer NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  state_version integer NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  explicit_recognition boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  revealed_at timestamptz,
  lock_answer_id uuid,
  lock_span_start integer,
  lock_span_end integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lock_answer_id IS NULL) = (lock_span_start IS NULL)),
  CHECK ((lock_answer_id IS NULL) = (lock_span_end IS NULL)),
  CHECK (lock_span_start IS NULL OR (lock_span_start >= 0 AND lock_span_end > lock_span_start))
);

CREATE UNIQUE INDEX one_official_attempt_per_device_daily
  ON play_sessions(anonymous_device_id, daily_id)
  WHERE attempt_type = 'OFFICIAL';

CREATE TABLE user_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  turn integer NOT NULL CHECK (turn > 0),
  stage text NOT NULL CHECK (stage IN ('BLIND', 'REFLECT', 'NUDGE', 'CORRECTION', 'RESCUE')),
  text text,
  char_count integer NOT NULL CHECK (char_count >= 0 AND char_count <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  purged_at timestamptz,
  UNIQUE (session_id, turn),
  CHECK ((purged_at IS NULL AND text IS NOT NULL AND char_length(text) = char_count)
      OR (purged_at IS NOT NULL AND text IS NULL))
);

ALTER TABLE play_sessions ADD CONSTRAINT play_sessions_lock_answer_fk
  FOREIGN KEY (lock_answer_id) REFERENCES user_answers(id);

CREATE TABLE node_discoveries (
  session_id uuid NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ABSENT', 'PARTIAL', 'DISCOVERED', 'CONTRADICTED')),
  first_stage text CHECK (first_stage IN ('BLIND', 'REFLECT', 'NUDGE', 'CORRECTION', 'RESCUE')),
  first_answer_id uuid REFERENCES user_answers(id),
  evidence_span_start integer,
  evidence_span_end integer,
  contradiction_answer_id uuid REFERENCES user_answers(id),
  contradiction_span_start integer,
  contradiction_span_end integer,
  PRIMARY KEY (session_id, node_id),
  CHECK ((first_answer_id IS NULL) = (evidence_span_start IS NULL)),
  CHECK ((first_answer_id IS NULL) = (evidence_span_end IS NULL)),
  CHECK (evidence_span_start IS NULL OR (evidence_span_start >= 0 AND evidence_span_end > evidence_span_start)),
  CHECK ((contradiction_answer_id IS NULL) = (contradiction_span_start IS NULL)),
  CHECK ((contradiction_answer_id IS NULL) = (contradiction_span_end IS NULL)),
  CHECK (contradiction_span_start IS NULL OR (contradiction_span_start >= 0 AND contradiction_span_end > contradiction_span_start))
);

CREATE TABLE guidance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('REFLECT', 'NUDGE', 'CORRECTION', 'RESCUE')),
  target_node text,
  guidance_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, guidance_key)
);

CREATE TABLE daily_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES play_sessions(id) ON DELETE CASCADE,
  daily_id uuid NOT NULL REFERENCES daily_schedule(id),
  completed_at timestamptz NOT NULL DEFAULT now()
);
