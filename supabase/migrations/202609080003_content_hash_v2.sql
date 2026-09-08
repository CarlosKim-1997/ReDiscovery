ALTER TABLE content_versions
  ADD COLUMN content_hash_version smallint NOT NULL DEFAULT 1;

DROP TRIGGER immutable_approved_content_versions ON content_versions;

DO $$
DECLARE
  existing_hash text;
BEGIN
  SELECT v.content_hash INTO existing_hash
  FROM content_versions v
  JOIN content_items i ON i.id = v.content_item_id
  WHERE i.slug = 'conway-law' AND v.version = 1;

  IF existing_hash = '03c16526239c1dcbb71f1ce0152d27a908a376696a8c92d623ad2514f2d4edb6' THEN
    UPDATE content_versions v
    SET content_hash = '23b30fd0a3cc2fb937c68c0fd09dde220f3e29e08e913fb411f56cc0a86f67e8',
        content_hash_version = 2
    FROM content_items i
    WHERE v.content_item_id = i.id AND i.slug = 'conway-law' AND v.version = 1;
  ELSIF existing_hash = '23b30fd0a3cc2fb937c68c0fd09dde220f3e29e08e913fb411f56cc0a86f67e8' THEN
    UPDATE content_versions v
    SET content_hash_version = 2
    FROM content_items i
    WHERE v.content_item_id = i.id AND i.slug = 'conway-law' AND v.version = 1;
  ELSIF existing_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Conway v1 hash is neither the known legacy hash nor the v2 hash';
  END IF;
END;
$$;

ALTER TABLE content_versions ALTER COLUMN content_hash_version SET DEFAULT 2;

CREATE TRIGGER immutable_approved_content_versions
BEFORE UPDATE OR DELETE ON content_versions
FOR EACH ROW WHEN (OLD.status = 'APPROVED')
EXECUTE FUNCTION reject_approved_content_version_mutation();

COMMENT ON COLUMN content_versions.content_hash_version IS
  'Version 2 hashes immutable content metadata and four layers; editorial schedule is excluded.';
