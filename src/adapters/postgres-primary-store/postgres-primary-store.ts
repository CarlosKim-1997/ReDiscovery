import postgres, { type Sql } from "postgres";
import type { ContentVersion, JudgeRubric, PublicPlay, RevealContent, ServerPolicy } from "@/domain/content/schema";
import type { PlaySession } from "@/domain/play/session";
import type { AiRunRecord, DailyRecord, PrimaryStorePort } from "@/ports/primary-store";

type Row = Record<string, unknown>;
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export class PostgresPrimaryStore implements PrimaryStorePort {
  private readonly sql: Sql;
  constructor(databaseUrl: string) { this.sql = postgres(databaseUrl, { max: 10 }); }
  async close() { await this.sql.end(); }
  async resolveDaily(at: Date): Promise<DailyRecord | undefined> {
    const [row] = await this.sql<Row[]>`SELECT d.*,v.public_play FROM daily_schedule d JOIN content_versions v ON v.id=d.content_version_id WHERE d.canonical_date=(${at} AT TIME ZONE 'Asia/Seoul')::date AND d.release_at<=${at} LIMIT 1`;
    return row ? { id:String(row.id),canonicalDate:dateText(row.canonical_date),sequenceNumber:Number(row.sequence_number),releaseAt:new Date(String(row.release_at)),contentVersionId:String(row.content_version_id),publicPlay:row.public_play as PublicPlay } : undefined;
  }
  async getDaily(id:string):Promise<DailyRecord|undefined>{const [r]=await this.sql<Row[]>`SELECT d.*,v.public_play FROM daily_schedule d JOIN content_versions v ON v.id=d.content_version_id WHERE d.id=${id}`;return r?{id:String(r.id),canonicalDate:dateText(r.canonical_date),sequenceNumber:Number(r.sequence_number),releaseAt:new Date(String(r.release_at)),contentVersionId:String(r.content_version_id),publicPlay:r.public_play as PublicPlay}:undefined;}
  async getContentVersion(id: string): Promise<ContentVersion | undefined> {
    const [r] = await this.sql<Row[]>`SELECT * FROM content_versions WHERE id=${id}`;
    return r ? { id:String(r.id),version:Number(r.version),schemaVersion:Number(r.schema_version),contentHash:String(r.content_hash),publicPlay:r.public_play as PublicPlay,judgeRubric:r.judge_rubric as JudgeRubric,serverPolicy:r.server_policy as ServerPolicy,revealContent:r.reveal_content as RevealContent } : undefined;
  }
  async findActiveDevice(hash:string) { const [r]=await this.sql<Row[]>`SELECT id FROM anonymous_devices WHERE token_hash=${hash} AND status='ACTIVE'`; return r ? {id:String(r.id)} : undefined; }
  async createDevice(hash:string) { const [r]=await this.sql<Row[]>`INSERT INTO anonymous_devices(token_hash) VALUES(${hash}) RETURNING id`; return {id:String(r!.id)}; }
  async touchDevice(id:string) { await this.sql`UPDATE anonymous_devices SET last_seen_at=now() WHERE id=${id}`; }
  async startOfficialSession(deviceId:string,daily:DailyRecord,nodeIds:readonly string[]) {
    return this.sql.begin(async tx => {
      const [created]=await tx<Row[]>`INSERT INTO play_sessions(daily_id,content_version_id,anonymous_device_id,attempt_type,status,stage) VALUES(${daily.id},${daily.contentVersionId},${deviceId},'OFFICIAL','THINKING','BLIND') ON CONFLICT(anonymous_device_id,daily_id) WHERE attempt_type='OFFICIAL' DO NOTHING RETURNING id`;
      const id=String(created?.id ?? (await tx<Row[]>`SELECT id FROM play_sessions WHERE anonymous_device_id=${deviceId} AND daily_id=${daily.id} AND attempt_type='OFFICIAL'`)[0]!.id);
      if(created) for(const nodeId of nodeIds) await tx`INSERT INTO node_discoveries(session_id,node_id,status) VALUES(${id},${nodeId},'ABSENT')`;
      return (await this.load(tx,id,deviceId))!;
    });
  }
  async getOwnedSession(id:string,deviceId:string){return this.load(this.sql,id,deviceId);}
  async reserveAnswerEvaluation(expected:number,answer:PlaySession["thoughts"][number],evaluating:PlaySession){
    return this.sql.begin(async tx=>{if(!await this.lockVersion(tx,evaluating,expected))return false;await tx`INSERT INTO user_answers(id,session_id,turn,stage,text,char_count) VALUES(${answer.id},${evaluating.id},${answer.turn},${answer.stage},${answer.text},char_length(${answer.text}))`;await this.persist(tx,expected,evaluating);return true;});
  }
  async completeAnswerEvaluation(expected:number,session:PlaySession){return this.saveTransition(expected,session);}
  async abortAnswerEvaluation(expected:number,prior:PlaySession,answerId:string){
    return this.sql.begin(async tx=>{
      const [locked]=await tx<Row[]>`SELECT state_version FROM play_sessions WHERE id=${prior.id} AND anonymous_device_id=${prior.anonymousDeviceId} FOR UPDATE`;
      if(Number(locked?.state_version)!==expected)return false;
      await tx`DELETE FROM user_answers WHERE id=${answerId} AND session_id=${prior.id}`;
      const [updated]=await tx<Row[]>`UPDATE play_sessions SET status=${prior.status},stage=${prior.stage},turn_count=${prior.turnCount},state_version=state_version+1,updated_at=now() WHERE id=${prior.id} AND anonymous_device_id=${prior.anonymousDeviceId} AND state_version=${expected} RETURNING id`;
      return Boolean(updated);
    });
  }
  async recordAiRuns(runs:readonly AiRunRecord[]){
    if(runs.length===0)return;
    await this.sql.begin(async tx=>{for(const run of runs)await tx`INSERT INTO ai_runs(id,session_id,answer_id,purpose,provider,model,prompt_version,content_version_id,dataset_version,attempt,schema_valid,result_status,input_tokens,output_tokens,total_tokens,estimated_cost,latency_ms,provider_request_id,created_at) VALUES(${run.id},${run.sessionId??null},${run.answerId??null},${run.purpose},${run.provider},${run.model},${run.promptVersion},${run.contentVersionId},${run.datasetVersion??null},${run.attempt},${run.schemaValid},${run.resultStatus},${run.inputTokens??null},${run.outputTokens??null},${run.totalTokens??null},${run.estimatedCost??null},${run.latencyMs},${run.providerRequestId??null},${run.createdAt})`;});
  }
  async saveAnswerTransition(expected:number,answer:PlaySession["thoughts"][number],session:PlaySession){
    return this.sql.begin(async tx=>{if(!await this.lockVersion(tx,session,expected))return false;await tx`INSERT INTO user_answers(id,session_id,turn,stage,text,char_count) VALUES(${answer.id},${session.id},${answer.turn},${answer.stage},${answer.text},char_length(${answer.text}))`;await this.persist(tx,expected,session);return true;});
  }
  async saveTransition(expected:number,session:PlaySession){return this.sql.begin(async tx=>{if(!await this.lockVersion(tx,session,expected))return false;await this.persist(tx,expected,session);return true;});}
  async completeReveal(expected:number,session:PlaySession){return this.sql.begin(async tx=>{if(!await this.lockVersion(tx,session,expected))return false;await this.persist(tx,expected,session);await tx`INSERT INTO daily_completions(session_id,daily_id) VALUES(${session.id},${session.dailyId}) ON CONFLICT(session_id) DO NOTHING`;return true;});}
  private async lockVersion(sql:Sql,s:PlaySession,v:number){const [r]=await sql<Row[]>`SELECT state_version FROM play_sessions WHERE id=${s.id} AND anonymous_device_id=${s.anonymousDeviceId} FOR UPDATE`;return Number(r?.state_version)===v;}
  private async load(sql:Sql,id:string,deviceId:string):Promise<PlaySession|undefined>{
    const [s]=await sql<Row[]>`SELECT p.*,EXISTS(SELECT 1 FROM daily_completions c WHERE c.session_id=p.id) reveal_completed FROM play_sessions p WHERE p.id=${id} AND p.anonymous_device_id=${deviceId}`;if(!s)return undefined;
    const answers=await sql<Row[]>`SELECT id,turn,stage,text FROM user_answers WHERE session_id=${id} ORDER BY turn`;
    const nodes=await sql<Row[]>`SELECT * FROM node_discoveries WHERE session_id=${id} ORDER BY node_id`;
    const events=await sql<Row[]>`SELECT stage,guidance_key FROM guidance_events WHERE session_id=${id} ORDER BY created_at,id`;
    const content=await this.getContentVersion(String(s.content_version_id));if(!content)throw new Error("CONTENT_VERSION_NOT_FOUND");
    return {id,dailyId:String(s.daily_id),contentVersionId:String(s.content_version_id),anonymousDeviceId:deviceId,attemptType:s.attempt_type as PlaySession["attemptType"],status:s.status as PlaySession["status"],stage:s.stage as PlaySession["stage"],turnCount:Number(s.turn_count),stateVersion:Number(s.state_version),
      thoughts:answers.map(a=>({id:String(a.id),turn:Number(a.turn),stage:a.stage as PlaySession["stage"],text:String(a.text)})),
      discoveries:nodes.map(n=>({nodeId:String(n.node_id),status:n.status as PlaySession["discoveries"][number]["status"],...(n.first_stage?{firstStage:n.first_stage as PlaySession["stage"]}:{}),...(n.first_answer_id?{evidence:{answerId:String(n.first_answer_id),spanStart:Number(n.evidence_span_start),spanEnd:Number(n.evidence_span_end)}}:{}),...(n.contradiction_answer_id?{contradictionEvidence:{answerId:String(n.contradiction_answer_id),spanStart:Number(n.contradiction_span_start),spanEnd:Number(n.contradiction_span_end)}}:{})})),
      guidance:events.map(e=>{const key=String(e.guidance_key) as keyof ServerPolicy["guidance"];return{stage:e.stage as Exclude<PlaySession["stage"],"BLIND">,key,text:content.serverPolicy.guidance[key]};}),
      ...(s.lock_answer_id?{lockEvidence:{answerId:String(s.lock_answer_id),spanStart:Number(s.lock_span_start),spanEnd:Number(s.lock_span_end)}}:{}),revealCompleted:Boolean(s.reveal_completed)};
  }
  private async persist(sql:Sql,v:number,s:PlaySession){
    const e=s.lockEvidence;const [updated]=await sql<Row[]>`UPDATE play_sessions SET status=${s.status},stage=${s.stage},turn_count=${s.turnCount},state_version=state_version+1,lock_answer_id=${e?.answerId??null},lock_span_start=${e?.spanStart??null},lock_span_end=${e?.spanEnd??null},locked_at=CASE WHEN ${s.status} IN ('LOCKED','REVEALED') THEN COALESCE(locked_at,now()) ELSE locked_at END,revealed_at=CASE WHEN ${s.status}='REVEALED' THEN COALESCE(revealed_at,now()) ELSE revealed_at END,updated_at=now() WHERE id=${s.id} AND anonymous_device_id=${s.anonymousDeviceId} AND state_version=${v} RETURNING id`;if(!updated)throw new Error("STALE_STATE_VERSION");
    for(const n of s.discoveries)await sql`UPDATE node_discoveries SET status=${n.status},first_stage=${n.firstStage??null},first_answer_id=${n.evidence?.answerId??null},evidence_span_start=${n.evidence?.spanStart??null},evidence_span_end=${n.evidence?.spanEnd??null},contradiction_answer_id=${n.contradictionEvidence?.answerId??null},contradiction_span_start=${n.contradictionEvidence?.spanStart??null},contradiction_span_end=${n.contradictionEvidence?.spanEnd??null} WHERE session_id=${s.id} AND node_id=${n.nodeId}`;
    for(const g of s.guidance)await sql`INSERT INTO guidance_events(session_id,stage,guidance_key) VALUES(${s.id},${g.stage},${g.key}) ON CONFLICT(session_id,guidance_key) DO NOTHING`;
  }
}
