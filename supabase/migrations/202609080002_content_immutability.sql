CREATE FUNCTION reject_approved_content_version_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approved content versions are immutable; create a new version';
END;
$$;

CREATE TRIGGER immutable_approved_content_versions
BEFORE UPDATE OR DELETE ON content_versions
FOR EACH ROW WHEN (OLD.status = 'APPROVED')
EXECUTE FUNCTION reject_approved_content_version_mutation();
