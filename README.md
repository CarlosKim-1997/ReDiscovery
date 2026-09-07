# G1 — M0 Foundation

G1 Master Codex Handoff Packet v1이 canonical implementation specification이다.
현재 구현 범위는 **M0만**이다. `G1`은 임시 프로젝트 식별자이며 최종 서비스 이름이나 브랜딩 결정이 아니다.

## 실행

Node 버전은 `.node-version`, pnpm 버전은 `package.json#packageManager`를 따른다.
해당 Node 및 pnpm을 준비한 뒤:

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
