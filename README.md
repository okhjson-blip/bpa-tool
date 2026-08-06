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
2. 등록 회사명 기준 프로젝트 목록 및 새 프로젝트 생성
3. 프로젝트별 과제(L4) 목록 및 등록
4. 인터뷰 답변과 AI Draft 생성
5. L4~L6 프로세스 수정 및 플로우차트 확인
6. BDW(Bottleneck, Delay, Waste) 진단
7. AI FIT 매트릭스와 As-Is/To-Be 비교
8. FTE 기반 결과 리포트 및 출력 형식 선택

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
- `/api/interviews/*`: 인터뷰와 Draft
- `/api/domains/*`: 업무 계층
- `/api/analysis/*`: BDW, AI FIT, To-Be, 리포트

## 운영 원칙

- 비밀키와 `.env` 파일은 Git에 커밋하지 않습니다.
- 모든 업무 데이터는 `project_id` 및 `task_id` 범위로 격리합니다.
- Vercel 배포 시 루트 `index.html`을 프런트엔드 빌드 입력으로 사용합니다.
- 운영 및 로컬 API 데이터베이스는 Supabase PostgreSQL을 사용합니다.

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
