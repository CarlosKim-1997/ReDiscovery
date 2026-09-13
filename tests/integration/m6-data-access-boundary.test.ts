import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { assertE2eFixtureSafety } from "../support/e2e-fixture-safety";

const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const tables = ["accounts", "ai_operations", "ai_runs", "anonymous_devices", "content_items", "content_versions", "daily_completions", "daily_schedule", "final_synthesis_attempts", "guidance_events", "node_discoveries", "play_sessions", "schema_migrations", "user_answers"].sort();
const functions = ["reject_approved_content_version_mutation", "reject_play_session_binding_mutation", "utf16_code_unit_length", "protect_final_synthesis_attempt_authority", "enforce_verified_synthesis_lock_evidence"].sort();
const migration = "202609130003_m6_data_access_boundary.sql";

suite("M6 server-mediated database boundary", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    assertE2eFixtureSafety({ APP_ENV: process.env.APP_ENV, E2E_ALLOW_DB_FIXTURES: "1", DATABASE_URL: url });
    sql = postgres(url!, { max: 1 });
    // Plain PostgreSQL CI has no Supabase roles. Model the observed insecure
    // defaults in this dedicated fixture, then replay the idempotent hardening.
    await sql.unsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ${tables.filter(t=>t!=="ai_operations").map(t=>"public."+t).join(",")} TO anon, authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;`);
    await sql.unsafe(await readFile(`supabase/migrations/${migration}`, "utf8"));
  });
  afterAll(async () => { if (sql) await sql.end(); });

  it("protects the complete application table set with RLS and no permissive policies", async () => {
    const rows = await sql<{ name: string; rls: boolean; forced: boolean; owner: string }[]>`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`;
    expect(rows.map(r => r.name)).toEqual(tables);
    expect(rows.every(r => r.rls && !r.forced && r.owner === "postgres")).toBe(true);
    for (const table of tables) {
      const [rights] = await sql`SELECT has_table_privilege('service_role',${"public." + table},'SELECT') AS s,has_table_privilege('service_role',${"public." + table},'INSERT') AS i,has_table_privilege('service_role',${"public." + table},'UPDATE') AS u,has_table_privilege('service_role',${"public." + table},'DELETE') AS d`;
      expect(rights).toEqual({ s: true, i: true, u: true, d: true });
    }
    expect(await sql`SELECT policyname FROM pg_policies WHERE schemaname='public'`).toHaveLength(0);
    const ledger = await sql<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name`;
    expect(ledger).toHaveLength(11); expect(ledger.at(-1)?.name).toBe("202609130004_m7_paid_operations.sql");
  });

  it.each(["anon", "authenticated"])("denies all direct table CRUD for %s, not merely empty-row visibility", async role => {
    for (const table of tables) {
      const [rights] = await sql`SELECT has_table_privilege(${role},${"public." + table},'SELECT') AS s,has_table_privilege(${role},${"public." + table},'INSERT') AS i,has_table_privilege(${role},${"public." + table},'UPDATE') AS u,has_table_privilege(${role},${"public." + table},'DELETE') AS d`;
      expect(rights).toEqual({ s: false, i: false, u: false, d: false });
      const [attribute] = await sql<{ name: string }[]>`SELECT a.attname AS name FROM pg_attribute a WHERE a.attrelid=${"public." + table}::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1`;
      const column = attribute!.name;
      for (const command of [`SELECT * FROM public.${table} LIMIT 0`, `INSERT INTO public.${table} DEFAULT VALUES`, `UPDATE public.${table} SET ${column}=${column} WHERE false`, `DELETE FROM public.${table} WHERE false`]) {
        await expect(sql.begin(async tx => {
          await tx.unsafe(`SET LOCAL ROLE ${role}`);
          await tx.unsafe(command);
        })).rejects.toMatchObject({ code: "42501" });
      }
    }
  });

  it("denies application function EXECUTE, including inherited PUBLIC, and finds no existing views/sequences", async () => {
    const rows = await sql<{ name: string; anon: boolean; authenticated: boolean }[]>`SELECT p.proname AS name,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e') ORDER BY p.proname`;
    expect(rows.map(r => r.name)).toEqual(functions);
    expect(rows.every(r => !r.anon && !r.authenticated)).toBe(true);
    expect(await sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m','S')`).toHaveLength(0);
  });

  it("denies future table/view/sequence/function defaults and preserves trusted owner access", async () => {
    const rollback = new Error("TEST_PROBE_ROLLBACK");
    await expect(sql.begin(async tx => {
      await tx.unsafe(`CREATE TABLE public.m6_boundary_probe(id serial PRIMARY KEY);
        CREATE VIEW public.m6_boundary_probe_view AS SELECT id FROM public.m6_boundary_probe;
        CREATE FUNCTION public.m6_boundary_probe_fn() RETURNS integer LANGUAGE sql AS 'SELECT 1';`);
      for (const role of ["anon", "authenticated"]) {
        for (const name of ["m6_boundary_probe", "m6_boundary_probe_view"]) {
          const [rights] = await tx`SELECT has_table_privilege(${role},${"public." + name},'SELECT,INSERT,UPDATE,DELETE') AS allowed`;
          expect(rights?.allowed).toBe(false);
        }
        const [rights] = await tx`SELECT has_sequence_privilege(${role},'public.m6_boundary_probe_id_seq','USAGE,SELECT,UPDATE') AS sequence_access,has_function_privilege(${role},'public.m6_boundary_probe_fn()','EXECUTE') AS execute`;
        expect(rights).toEqual({ sequence_access: false, execute: false });
      }
      expect(await tx`INSERT INTO m6_boundary_probe DEFAULT VALUES RETURNING id`).toHaveLength(1);
      expect(await tx`SELECT utf16_code_unit_length('test') AS length`).toEqual([{ length: 4 }]);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
