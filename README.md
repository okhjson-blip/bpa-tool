# BPA Tool

업무 프로세스를 STATIK(L1~L6)으로 구조화하고 BDW 진단, AI FIT 분석, To-Be 설계 및 FTE 기반 성과 리포트까지 수행하는 웹 애플리케이션입니다.

## 실행 진입점

프로젝트의 유일한 UI 실행 진입점은 루트의 `index.html`입니다.

- 개발 UI: `npm run dev` → `http://localhost:3000`
- 백엔드: `npm run dev:backend` → `http://localhost:5000`
- 프로덕션: `npm run build` 후 `npm start` → `http://localhost:5000`
- `/api` 요청은 개발 환경에서 5000번 백엔드로 프록시됩니다.
- 프로덕션에서는 Express가 API와 `frontend/dist/index.html`을 같은 주소에서 제공합니다.

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

## 주요 화면

1. 프로젝트 목록 및 새 프로젝트 생성
2. 프로젝트별 과제(L4) 목록 및 등록
3. 인터뷰 답변과 AI Draft 생성
4. L4~L6 프로세스 수정 및 플로우차트 확인
5. BDW(Bottleneck, Delay, Waste) 진단
6. AI FIT 매트릭스와 As-Is/To-Be 비교
7. FTE 기반 결과 리포트 및 출력 형식 선택

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
│  ├─ src/app.js              # API 및 정적 UI 서버
│  └─ data/db.json            # 현재 로컬 JSON 데이터
└─ ui mokup/                  # 참고용 원본 문서 보관 위치
```

## 주요 API

- `GET /health`
- `GET|POST /api/projects`
- `GET|PUT|DELETE /api/projects/:projectId`
- `GET|POST /api/projects/:projectId/tasks`
- `/api/interviews/*`: 인터뷰와 Draft
- `/api/domains/*`: 업무 계층
- `/api/analysis/*`: BDW, AI FIT, To-Be, 리포트

## 운영 원칙

- 비밀키와 `.env` 파일은 Git에 커밋하지 않습니다.
- 모든 업무 데이터는 `project_id` 및 `task_id` 범위로 격리합니다.
- Vercel 배포 시 루트 `index.html`을 프런트엔드 빌드 입력으로 사용합니다.
- 운영 데이터베이스 전환 시 Supabase PostgreSQL을 기준으로 구성합니다.
