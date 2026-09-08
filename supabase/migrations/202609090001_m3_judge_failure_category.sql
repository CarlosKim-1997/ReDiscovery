ALTER TABLE ai_runs
  ADD COLUMN failure_category text
  CHECK (failure_category IS NULL OR failure_category IN (
    'STRUCTURED_OUTPUT_INVALID',
    'NODE_SET_INVALID',
    'STATUS_EVIDENCE_INVALID',
    'EVIDENCE_NOT_LITERAL',
    'EVIDENCE_NOT_UNIQUE'
  ));

ALTER TABLE ai_runs
  ADD CONSTRAINT ai_runs_failure_category_status_check
  CHECK (failure_category IS NULL OR result_status = 'SCHEMA_ERROR');

COMMENT ON COLUMN ai_runs.failure_category IS 'Redacted internal validator failure class; never raw answer, evidence, prompt, or provider body.';
