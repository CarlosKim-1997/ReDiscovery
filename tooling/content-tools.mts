import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { approvedContentSchema, dailyScheduleSchema, type ApprovedContent, type DailySchedule } from "../src/domain/content/schema.ts";

const approvedDirectory=path.resolve("content/approved");
const scheduleDirectory=path.resolve("content/schedule");
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`:JSON.stringify(value);
async function jsonFiles(directory:string){return (await readdir(directory)).filter(file=>file.endsWith(".json")).sort();}
export async function validatedContent(directory=approvedDirectory){return Promise.all((await jsonFiles(directory)).map(async file=>({file,content:approvedContentSchema.parse(JSON.parse(await readFile(path.join(directory,file),"utf8")))})));}
export async function validatedSchedules(directory=scheduleDirectory){return Promise.all((await jsonFiles(directory)).map(async file=>({file,schedule:dailyScheduleSchema.parse(JSON.parse(await readFile(path.join(directory,file),"utf8")))})));}
export function contentVersionHash(content:ApprovedContent){return createHash("sha256").update(canonical(content)).digest("hex");}
export async function migrate(databaseUrl:string){const sql=postgres(databaseUrl,{max:1});try{await sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`;const directory=path.resolve("supabase/migrations");for(const name of (await readdir(directory)).filter(file=>file.endsWith(".sql")).sort()){const [seen]=await sql<{name:string}[]>`SELECT name FROM schema_migrations WHERE name=${name}`;if(seen)continue;const body=await readFile(path.join(directory,name),"utf8");await sql.begin(async tx=>{await tx.unsafe(body);await tx`INSERT INTO schema_migrations(name) VALUES(${name})`;});console.log(`migrated ${name}`);}}finally{await sql.end();}}
export async function seedApprovedData(databaseUrl:string,contents:readonly {file:string;content:ApprovedContent}[],schedules:readonly {file:string;schedule:DailySchedule}[]){
  const sql=postgres(databaseUrl,{max:1});
  try{await sql.begin(async tx=>{
    for(const {file,content} of contents){
      const hash=contentVersionHash(content);
      const [item]=await tx<{id:string}[]>`INSERT INTO content_items(slug) VALUES(${content.slug}) ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`;
      const [existing]=await tx<{id:string;content_hash:string}[]>`SELECT id,content_hash FROM content_versions WHERE content_item_id=${item!.id} AND version=${content.version}`;
      if(existing&&existing.content_hash!==hash)throw new Error(`${file}: approved version differs; create a new version`);
      if(!existing)await tx`INSERT INTO content_versions(content_item_id,version,schema_version,content_hash,status,public_play,judge_rubric,server_policy,reveal_content,approved_at) VALUES(${item!.id},${content.version},${content.schema_version},${hash},'APPROVED',${tx.json(content.PUBLIC_PLAY)},${tx.json(content.JUDGE_RUBRIC)},${tx.json(content.SERVER_POLICY)},${tx.json(content.REVEAL_CONTENT)},${content.approved_at})`;
      console.log(`seeded ${file} ${hash}`);
    }
    for(const {file,schedule} of schedules)for(const entry of schedule.entries){
      const [version]=await tx<{id:string}[]>`SELECT v.id FROM content_versions v JOIN content_items i ON i.id=v.content_item_id WHERE i.slug=${entry.content.slug} AND v.version=${entry.content.version} AND v.status='APPROVED'`;
      if(!version)throw new Error(`${file}: approved content ${entry.content.slug} v${entry.content.version} not found`);
      const [byDate]=await tx<{id:string;sequence_number:number;release_at:Date;content_version_id:string}[]>`SELECT id,sequence_number,release_at,content_version_id FROM daily_schedule WHERE canonical_date=${entry.canonical_date}`;
      if(byDate){const exact=Number(byDate.sequence_number)===entry.sequence_number&&new Date(byDate.release_at).toISOString()===entry.release_at&&String(byDate.content_version_id)===version.id;if(!exact)throw new Error(`${file}: incompatible schedule assignment for ${entry.canonical_date}`);continue;}
      const [bySequence]=await tx<{canonical_date:string}[]>`SELECT canonical_date FROM daily_schedule WHERE sequence_number=${entry.sequence_number}`;
      if(bySequence)throw new Error(`${file}: sequence ${entry.sequence_number} already assigned`);
      await tx`INSERT INTO daily_schedule(canonical_date,sequence_number,release_at,content_version_id) VALUES(${entry.canonical_date},${entry.sequence_number},${entry.release_at},${version.id})`;
    }
  });}finally{await sql.end();}
}
async function main(){const command=process.argv[2];const url=process.env.DATABASE_URL??"postgresql://postgres:postgres@127.0.0.1:54322/postgres";const contents=await validatedContent();const schedules=await validatedSchedules();if(command==="validate"){for(const {file} of contents)console.log(`valid content ${file}`);for(const {file} of schedules)console.log(`valid schedule ${file}`);}else if(command==="migrate")await migrate(url);else if(command==="seed")await seedApprovedData(url,contents,schedules);else throw new Error("Expected validate, migrate, or seed");}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
