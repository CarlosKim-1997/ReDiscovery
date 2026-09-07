# G1 — M0 Foundation

G1 Master Codex Handoff Packet v1이 canonical implementation specification이다.
현재 구현 범위는 **M0만**이다. `G1`은 임시 프로젝트 식별자이며 최종 서비스 이름이나 브랜딩 결정이 아니다.

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

<http://localhost:3000>에서 임시 준비 화면을 확인한다. 게임은 M1부터 구현한다.
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
| `NODE_ENV` | `development` | Next.js가 관리하는 `development`, `test`, `production` |

서버 config는 Zod로 검증하고 freeze한다. 알 수 없는 환경 변수는 반환 config에 포함하지 않는다.
M0에는 `NEXT_PUBLIC_*` 값, DB·OAuth·Redis·OpenAI 키가 필요 없다. OpenAI 호출은 0이다.
향후 feature flags와 vendor 설정은 해당 milestone에서 추가한다.

## 구조와 기록

- [Architecture](docs/architecture.md): dependency 방향, composition root, ClockPort
- [Decision record](docs/decisions/0001-m0-foundation.md): M0의 구체적인 선택과 보류 항목
- [Specification authority](docs/spec-authority.md): canonical 원문 우선순위와 구현 범위
- [M0 verification](docs/milestones/M0.md): 변경 파일, 검증 결과, 남은 문제
