CREATE TABLE ai_runs (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES play_sessions(id) ON DELETE SET NULL,
  answer_id uuid REFERENCES user_answers(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('JUDGE')),
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  content_version_id uuid NOT NULL REFERENCES content_versions(id),
  dataset_version text,
  attempt smallint NOT NULL CHECK (attempt > 0),
  schema_valid boolean NOT NULL,
  result_status text NOT NULL CHECK (result_status IN ('SUCCEEDED', 'PROVIDER_ERROR', 'SCHEMA_ERROR')),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  estimated_cost numeric(16,8) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  provider_request_id text,
  created_at timestamptz NOT NULL
);

CREATE INDEX ai_runs_session_created_idx ON ai_runs(session_id, created_at);
CREATE INDEX ai_runs_purpose_created_idx ON ai_runs(purpose, created_at);

COMMENT ON TABLE ai_runs IS 'Redacted operational AI metadata only; never prompts, responses, answers, or literal evidence.';
