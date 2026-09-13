-- G1 data is server-mediated; Supabase Auth does not grant gameplay CRUD.
-- Audited G1 creator/owner: postgres. Keep owner/server access, without FORCE RLS.
DO $boundary$
DECLARE
  object_name text;
  client_role text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'G1 boundary migration requires the audited postgres creator role';
  END IF;
  FOREACH object_name IN ARRAY ARRAY[
    'content_items','content_versions','daily_schedule','anonymous_devices',
    'play_sessions','user_answers','node_discoveries','guidance_events',
    'daily_completions','ai_runs','final_synthesis_attempts','accounts',
    'schema_migrations'
  ] LOOP
    IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('public.' || object_name)) IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'G1 table owner differs from the audited creator role';
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', object_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', object_name);
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      -- Plain PostgreSQL CI has no Supabase roles. Never create platform roles here.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', object_name, client_role);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH object_name IN ARRAY ARRAY[
    'public.reject_approved_content_version_mutation()',
    'public.reject_play_session_binding_mutation()',
    'public.utf16_code_unit_length(text)',
    'public.protect_final_synthesis_attempt_authority()',
    'public.enforce_verified_synthesis_lock_evidence()'
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC', object_name);
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I', object_name, client_role);
      END IF;
    END LOOP;
  END LOOP;

  -- No G1 views/materialized views/sequences currently exist. Future defaults
  -- deny clients; any new client-readable feature requires explicit review.
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', client_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', client_role);
    END IF;
  END LOOP;
END
$boundary$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
-- PostgreSQL gives future functions global PUBLIC EXECUTE by default. A schema
-- REVOKE cannot subtract that global grant. Remove it for this creator, then
-- explicitly grant any future legitimate function use. Existing non-G1 functions
-- and all existing objects/default ACLs in Supabase-managed schemas are untouched.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
