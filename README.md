# BPA Tool

업무 프로세스를 STATIK(L1~L6)으로 구조화하고 BDW 진단, AI FIT 분석, To-Be 설계 및 FTE 기반 성과 리포트까지 수행하는 웹 애플리케이션입니다.

## 실행 진입점

프로젝트의 유일한 UI 실행 진입점은 루트의 `index.html`입니다.

- 개발 UI: `npm run dev` → `http://localhost:3000`
- 백엔드: `npm run dev:backend` → `http://localhost:5000`
- 프로덕션: `npm run build` 후 `npm start` → `http://localhost:5000`
- `/api` 요청은 개발 환경에서 5000번 백엔드로 프록시됩니다.
- 프로덕션에서는 Express가 API와 `frontend/dist/index.html`을 같은 주소에서 제공합니다.

루트 `index.html`을 파일 탐색기에서 직접 열 수도 있지만 API 기능을 사용하려면 먼저 `npm start`로 백엔드를 실행해야 합니다. 파일 직접 실행 시 UI는 `http://localhost:5000/api`로 연결됩니다.

## 설치

```powershell
npm run install-all
```

## 개발 실행

로컬 테스트는 루트 터미널 하나에서 실행할 수 있습니다.

```powershell
npm.cmd run dev:local
```

환경 점검이 성공하면 백엔드와 프런트엔드가 함께 실행됩니다.

- UI: `http://localhost:3000`
- API/Supabase 상태: `http://localhost:5000/api/health`
- 종료: 실행 터미널에서 `Ctrl+C`

환경만 먼저 확인하려면 다음 명령을 사용합니다.

```powershell
npm.cmd run doctor
```

상세 테스트 순서는 `LOCAL_TEST_GUIDE.md`를 참고하세요.

### 개별 실행

터미널 1:

```powershell
npm run dev:backend
```

터미널 2:

```powershell
npm run dev:frontend
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 프로덕션 실행

```powershell
npm run build
npm start
```

브라우저에서 `http://localhost:5000`을 엽니다.
`npm start`는 실행 전에 루트 `index.html`을 자동으로 다시 빌드하므로 항상 최신 접속 화면을 제공합니다.

## 주요 화면

1. 접속 첫 화면에서 회사명과 외부 AI API 연결 등록
2. 등록 회사명 기준 프로젝트 목록, L1~L3 프로젝트 생성·수정, 참여자 확인
3. 프로젝트 계층과 연동된 과제(L4) 등록
4. 인터뷰 답변과 AI Draft 생성
5. L4~L6 프로세스 수정 및 플로우차트 확인
6. BDW(Bottleneck, Delay, Waste) 진단
7. AI FIT 매트릭스와 As-Is/To-Be 비교
8. 과제별 AX 성과지표 전체 PDF 또는 과제당 한 행의 과제정보 CSV 출력

## 디렉터리

```text
bpa-tool/
├─ index.html                 # 단일 UI 실행 진입점
├─ README.md                  # 설치·실행 안내
├─ BPA_DEV.md                 # 개발 기준
├─ UX_시나리오_설계.md        # 화면·사용 흐름 기준
├─ frontend/
│  ├─ vite.config.js          # 루트 index.html 빌드
│  └─ dist/                   # 프로덕션 산출물
├─ backend/
│  └─ src/app.js              # API 및 로컬 정적 UI 서버
├─ api/index.js               # Vercel Express 함수 진입점
├─ supabase/migrations/       # Supabase PostgreSQL 스키마
├─ vercel.json                # Vercel 빌드·라우팅 설정
└─ ui mokup/                  # 참고용 원본 문서 보관 위치
```

## 주요 API

- `GET /health`
- `GET|POST /api/projects`
- `GET|PUT|DELETE /api/projects/:projectId`
- `GET|POST /api/projects/:projectId/tasks`
- `POST /api/connections/test`: 선택한 AI 엔진의 API Key 실제 연결 검증
- `/api/interviews/*`: 실제 AI Draft 생성·저장과 작업별 프로세스 수정
- `/api/domains/*`: 업무 계층
- `/api/analysis/*`: 작업별 BDW, AI FIT, To-Be, AX 성과지표 리포트

## 운영 원칙

- 비밀키와 `.env` 파일은 Git에 커밋하지 않습니다.
- 모든 업무 데이터는 `project_id` 및 `task_id` 범위로 격리합니다.
- Vercel 배포 시 루트 `index.html`을 프런트엔드 빌드 입력으로 사용합니다.
- 운영 및 로컬 API 데이터베이스는 Supabase PostgreSQL을 사용합니다.
- AI 분석 모델은 OpenAI `gpt-5-nano`, Gemini `gemini-3.5-flash-lite`, Claude `claude-sonnet-5`를 사용합니다. OpenAI와 Gemini 모델은 각각 `OPENAI_MODEL`, `GEMINI_MODEL` 환경변수로 교체할 수 있습니다.
- 세 공급자 모두 공식 JSON Schema 구조화 출력을 사용하며 API Key는 Draft·BDW·AI FIT 요청 처리 중에만 백엔드로 전달됩니다.
- 프로젝트 계층은 `department_name=L1`, `description=L2`, `name=L3`로 저장하고 API에서는 L2를 `business_name` 별칭으로 제공합니다.
- 프로젝트 및 과제 등록은 기간과 필수 역할 참여자를 프런트엔드와 API에서 이중 검증합니다.
- AI FIT 제안은 L6 단위 업무별로 사용자가 수락한 항목만 To-Be에 반영하며, 서버에 저장된 분석 결과를 기준으로 생성합니다.
- 리포트 수행 빈도는 일·주·월별 횟수를 연간으로 환산하여 AX 절감 시간과 FTE를 계산합니다.
- AI Draft는 STATIK L4~L6 정의를 따르며 L6를 `목적어 + 단일 동사` 형태의 최소 행동으로 생성합니다.
- PDF는 별도 팝업 대신 숨김 인쇄 프레임으로 전체 리포트를 출력하고, CSV의 AS-IS·To-Be는 `A > B > C` 형식의 프로세스 흐름으로 기록합니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/202608060001_initial_schema.sql`을 실행합니다.
3. `.env.example`을 참고해 로컬 `.env`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 설정합니다.
4. 서비스 역할 키는 백엔드 전용이며 `VITE_` 접두사를 붙이거나 브라우저 코드에 넣지 않습니다.

## Vercel 배포

Git 저장소를 Vercel 프로젝트에 연결한 후 다음 환경 변수를 Production, Preview, Development에 등록합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Vercel은 `npm run build`로 루트 `index.html`을 빌드하고 `api/index.js`의 Express 앱을 서버리스 함수로 실행합니다. `/api/*`는 Express 함수로, 나머지 경로는 정적 `index.html`로 전달됩니다.

AI Draft, BDW, AI FIT처럼 외부 모델을 호출하는 함수의 제한시간은 `vercel.json`에서 60초로 설정되어 있습니다. 사용하는 Vercel 요금제의 함수 실행시간 한도도 함께 확인해야 합니다.
