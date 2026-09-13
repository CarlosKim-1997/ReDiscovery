-- New Judge admissions are durable; historical telemetry is left unchanged.
ALTER TABLE public.user_answers ADD COLUMN submission_id uuid,
  ADD COLUMN submission_payload_sha256 text;
ALTER TABLE public.user_answers ADD CONSTRAINT user_answers_submission_identity_check CHECK (
  (submission_id IS NULL AND submission_payload_sha256 IS NULL) OR
  (submission_id IS NOT NULL AND submission_payload_sha256 IS NOT NULL
   AND submission_payload_sha256 ~ '^[0-9a-f]{64}$'));
CREATE UNIQUE INDEX user_answers_session_submission_key
  ON public.user_answers(session_id, submission_id) WHERE submission_id IS NOT NULL;

CREATE TABLE public.ai_operations (
  id uuid PRIMARY KEY,
  answer_id uuid NOT NULL REFERENCES public.user_answers(id),
  kind text NOT NULL CHECK (kind = 'JUDGE'),
  status text NOT NULL CHECK (status IN ('EVALUATING','RECOVERABLE','COMPLETED','RECOVERY_EXHAUSTED')),
  recovery_count smallint NOT NULL DEFAULT 0 CHECK (recovery_count BETWEEN 0 AND 1),
  evaluation_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE(answer_id,kind), UNIQUE(id,answer_id),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK ((status = 'EVALUATING') = (evaluation_lease_expires_at IS NOT NULL)),
  CHECK (status <> 'RECOVERABLE' OR recovery_count = 0),
  CHECK (status <> 'RECOVERY_EXHAUSTED' OR recovery_count = 1)
);

ALTER TABLE public.ai_runs
  ADD COLUMN operation_id uuid,
  ADD COLUMN evaluation_round smallint,
  ADD COLUMN execution_status text,
  ADD COLUMN admitted_at timestamptz,
  ADD COLUMN settled_at timestamptz,
  ALTER COLUMN schema_valid DROP NOT NULL,
  ALTER COLUMN result_status DROP NOT NULL,
  ALTER COLUMN latency_ms DROP NOT NULL;
ALTER TABLE public.ai_runs
  ADD CONSTRAINT ai_runs_operation_answer_fk FOREIGN KEY (operation_id,answer_id)
    REFERENCES public.ai_operations(id,answer_id),
  ADD CONSTRAINT ai_runs_admission_check CHECK (
    (operation_id IS NULL AND evaluation_round IS NULL AND execution_status IS NULL
     AND admitted_at IS NULL AND settled_at IS NULL
     AND schema_valid IS NOT NULL AND result_status IS NOT NULL AND latency_ms IS NOT NULL)
    OR
    (operation_id IS NOT NULL AND answer_id IS NOT NULL AND session_id IS NOT NULL
     AND purpose = 'JUDGE' AND evaluation_round IS NOT NULL AND evaluation_round IN (0,1)
     AND attempt IN (1,2) AND admitted_at IS NOT NULL AND execution_status IS NOT NULL
     AND execution_status IN ('ADMITTED','SUCCEEDED','FAILED','UNKNOWN')
     AND ((execution_status = 'ADMITTED' AND settled_at IS NULL AND result_status IS NULL AND schema_valid IS NULL)
       OR (execution_status = 'UNKNOWN' AND settled_at IS NOT NULL AND result_status IS NULL AND schema_valid IS NULL)
       OR (execution_status = 'FAILED' AND settled_at IS NOT NULL AND result_status IS NOT NULL AND result_status IN ('PROVIDER_ERROR','SCHEMA_ERROR') AND schema_valid IS NOT NULL AND schema_valid = false AND latency_ms IS NOT NULL)
       OR (execution_status = 'SUCCEEDED' AND settled_at IS NOT NULL AND result_status IS NOT NULL AND result_status = 'SUCCEEDED' AND schema_valid IS NOT NULL AND schema_valid = true AND latency_ms IS NOT NULL))));
CREATE UNIQUE INDEX ai_runs_operation_round_attempt_key
  ON public.ai_runs(operation_id,evaluation_round,attempt) WHERE operation_id IS NOT NULL;

DO $boundary$
DECLARE client_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'G1 boundary migration requires the audited postgres creator role';
  END IF;
  ALTER TABLE public.ai_operations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL PRIVILEGES ON TABLE public.ai_operations FROM PUBLIC;
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.ai_operations FROM %I',client_role);
    END IF;
  END LOOP;
END
$boundary$;
