# G1 — M3 Judge Evaluation and Semantic Calibration

G1 Master Codex Handoff Packet v1이 canonical implementation specification이다.
현재 구현 범위는 **M3까지**이며 M4 이상 기능은 포함하지 않는다. `G1`은 임시 프로젝트 식별자이며 최종 서비스 이름이나 브랜딩 결정이 아니다.

## 실행

**프로젝트 명령을 실행하기 전에** `.node-version`의 Node **24.19.0**을 설치하고
현재 터미널에서 활성화한다. 기존 Node 버전 관리자 또는 공식 Node 배포판을 사용하면 된다.
`.node-version` 파일만으로 터미널의 Node가 자동 전환되지는 않는다.

그다음 `package.json#packageManager`에 고정된 pnpm **11.19.0**을 설치·활성화한다.
새 터미널에서도 다음 결과를 먼저 확인한다:

```sh
node --version
# v24.19.0
pnpm --version
# 11.19.0
pnpm check:runtime
```

지원 범위는 `package.json#engines.node`의 `>=24.19.0 <25`이며,
재현 기준과 CI는 `.node-version`의 정확한 버전이다.
프로젝트 명령은 실제 실행 Node를 먼저 검사하고, 지원 범위 밖이면 실행을 중단한다.
pnpm 자체가 별도 Node를 사용하더라도 프로젝트 명령의 Node 검사를 생략하지 않는다.
검사 실패 시 현재 터미널의 Node 활성화/PATH를 바로잡는다. 런타임을 자동 설치하거나 전환하지 않는다.

버전 확인을 마친 뒤:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

<http://localhost:3000>에서 PostgreSQL 권위의 Conway Daily를 실행한다.
기본 `JUDGE_ADAPTER=fake`는 결정적 로컬 실행을 유지한다. 실제 Judge는 서버 전용
`JUDGE_ADAPTER=openai`, `OPENAI_API_KEY`, `PRIMARY_JUDGE_MODEL`로 명시적으로 켠다.
`GET /api/health`는 서버 프로세스의 liveness와 서버 시각만 반환한다.
외부 서비스의 readiness, 비용 circuit 상태, Daily availability를 의미하지 않는다.

## 검증

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

실제 Gold 평가(일반 CI와 분리):

```sh
OPENAI_API_KEY=... PRIMARY_JUDGE_MODEL=... pnpm eval:judge
```

The default remains the frozen `v1` suite and accepted `judge-v1` prompt. A later
local PowerShell run of the v2 development calibration uses exactly:

```powershell
$env:JUDGE_EVAL_SUITE = "v2"
$env:PRIMARY_JUDGE_MODEL = "gpt-5.6-luna"
$env:OPENAI_API_KEY = "<local secret>"
pnpm eval:judge
```

The v2 manifest selects `judge-dev-v2`, `conway-law` content version 2, and
`judge-v2`. The v3 development suite is selected with `JUDGE_EVAL_SUITE=v3` and
recursively inherits v2 and the frozen v1 surface corpus. The evaluator rejects
prompt mismatches, inheritance cycles/escapes, stale overrides, and content identity
mismatches. Do not put the key in a file or CI. M3-B2 does not execute a live run.

평가 보고서는 `artifacts/eval/judge/`에 생성되며 원문 답변·프롬프트·공급자 응답은 포함하지 않는다.

독립 Lock evidence verifier의 향후 로컬 개발 평가는 다음처럼 별도로 실행한다.
일반 CI나 게임 런타임에서는 실행되지 않으며, M3-B3 구현 검증 중에는 실제 호출을
하지 않는다.

```powershell
$env:ADJUDICATION_MODEL = "gpt-5.6-luna"
$env:OPENAI_API_KEY = "<local secret>"
pnpm eval:lock-verifier
```

Luna가 verifier acceptance gate를 통과하지 못한 경우에만 Terra 비교를 실행한다.
보고서는 `artifacts/eval/lock-verifier/`에 생성되며 원문 답변, 인용 evidence,
프롬프트, 공급자 payload를 포함하지 않는다. 명령 실패는 게임 상태나 runtime
fallback을 변경하지 않는다.

E2E는 이미 빌드된 앱을 `127.0.0.1:3100`에서 자동 실행한다.
다른 프로세스가 해당 포트를 사용하면 종료 후 다시 실행한다.
Desktop Chromium과 mobile Chromium에서 페이지, 새로고침, reduced motion 환경,
가로 넘침, 브라우저 오류, 외부 요청 부재, health 응답을 검사한다.
이는 아직 구현하지 않은 게임 접근성·키보드·Reveal 동작의 검증을 의미하지 않는다.

GitHub Actions는 동일한 검사를 Linux에서 수행하도록 구성되어 있다.
`actions/setup-node`는 `.node-version`을 읽고, `pnpm/action-setup`은
`packageManager`를 사용한다. 의존성은 `pnpm-lock.yaml`과 `--frozen-lockfile`로 재현한다.
호스팅은 명세의 Vercel 기준을 따른다. M0에서 배포·외부 계정 생성은 수행하지 않는다.

## 환경 변수

파일 없이 실행 가능하다. 재정의할 때만 `.env.example`을 `.env.local`로 복사한다.

| 변수 | 기본값 | 허용 값 / 의미 |
| --- | --- | --- |
| `APP_ENV` | `local` | `local`, `test`, `staging`, `production` |
| `CONFIG_VERSION` | `m0-v1` | 1~64자, 영문·숫자·점·밑줄·하이픈 |
| `JUDGE_ADAPTER` | `fake` | `fake`, `openai` |
| `OPENAI_API_KEY` | 없음 | `openai` 모드에서만 필수, 서버 전용 |
| `PRIMARY_JUDGE_MODEL` | 없음 | `openai` 모드/실평가에서 필수, 서버 전용 |
| `ADJUDICATION_MODEL` | 없음 | Lock verifier 로컬 실평가에서만 필수, 게임 런타임에서는 미사용 |
| `NODE_ENV` | `development` | Next.js가 관리하는 `development`, `test`, `production` |

서버 config는 Zod로 검증하고 freeze한다. 알 수 없는 환경 변수는 반환 config에 포함하지 않는다.
`NEXT_PUBLIC_OPENAI_*`는 금지한다. Fake 모드와 CI에는 OpenAI 키가 필요 없고 실제
Judge 및 `eval:judge`만 명시적 서버 키를 사용한다.

## 구조와 기록

- [Architecture](docs/architecture.md): dependency 방향, composition root, ClockPort
- [Decision record](docs/decisions/0001-m0-foundation.md): M0의 구체적인 선택과 보류 항목
- [Specification authority](docs/spec-authority.md): canonical 원문 우선순위와 구현 범위
- [M0 verification](docs/milestones/M0.md): 변경 파일, 검증 결과, 남은 문제
- [M1 walking skeleton](docs/milestones/M1.md): 상태 흐름, FakeJudge, resume, Reveal, 검증
- [M3 Judge and evaluation](docs/milestones/M3.md): OpenAI adapter, Gold dataset, 평가/검증 상태
- [Judge v1 Luna baseline](docs/evals/judge-v1-luna-baseline.md): frozen first live-provider result
- [Judge v2 semantic contract](docs/evals/judge-v2-semantic-contract.md): independent status/ambiguity rules
- [Judge v2 label audit](docs/evals/judge-v2-label-audit.md): every audited v1→v2 label change
- [Judge v2 Luna development baseline](docs/evals/judge-v2-luna-dev-baseline.md): frozen first live v2 result
- [Judge v3 semantic contract](docs/evals/judge-v3-semantic-contract.md): causal direction, threshold audit, and v2→v3 delta
- [M3-B2 decision record](docs/decisions/0004-m3-b2-v3-calibration.md): versioning, inheritance, diagnostics, and production isolation
- [Judge v3 Luna baseline](docs/evals/judge-v3-luna-baseline.md): frozen first v3 model result
- [Judge v3 Terra comparison](docs/evals/judge-v3-terra-comparison.md): frozen same-identity comparison
- [M3-B3 decision record](docs/decisions/0005-m3-b3-lock-evidence-verifier.md): independent evidence gate and runtime isolation
