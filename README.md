# BPA Tool

업무 프로세스를 STATIK(L1~L6)으로 구조화하고 BDW 진단, AI FIT 분석, To-Be 설계 및 FTE 기반 성과 리포트까지 수행하는 웹 애플리케이션입니다.

## 실행 진입점

프로젝트의 유일한 UI 실행 진입점은 루트의 `index.html`입니다.

- 개발 UI: `npm run dev` → `http://localhost:3000`
- 백엔드: `npm run dev:backend` → `http://localhost:5000`
- 프로덕션: `npm run build` 후 `npm start` → `http://localhost:5000`
- `/api` 요청은 개발 환경에서 5000번 백엔드로 프록시됩니다.
- 프로덕션에서는 Express가 API와 `frontend/dist/index.html`을 같은 주소에서 제공합니다.

루트 `index.html`은 Vite 또는 Express를 통해 실행해야 합니다. Supabase Auth 모듈과 API 프록시가 필요하므로 `file://` 직접 열기는 지원하지 않습니다.

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

1. 관리자가 등록한 협력사를 선택하고 이름·이메일 입력 후 `시작하기`로 기존 사용자 접속 여부 확인, 미등록 사용자는 안내 후 `등록` 버튼으로 가입
2. Supabase 로그인 세션 자동 복원 및 로그인 사용자의 활성 협력사 멤버십 확인
3. 협력사별로 격리된 프로젝트 목록, L1 구분·L2 대분류·L3 중분류 프로젝트 생성·수정·확인 후 삭제, 참여자 확인
4. 프로젝트 계층과 연동된 L4 모듈 과제 등록
5. 인터뷰 답변과 AI Draft 생성
6. L4 모듈·L5 단위·L6 Act 프로세스 수정 및 플로우차트 확인
7. BDW(Bottleneck, Delay, Waste) 진단
8. AI FIT 매트릭스와 As-Is/To-Be 비교
9. 과제별 AX 성과지표 전체 PDF 또는 저장된 리포트를 복원할 수 있는 DB 이관용 CSV 출력
10. 관리자 `협력사/과제 관리`에서 전체/활성 통계, 협력사 완료 처리, 협력사·프로젝트·과제별 연관 데이터 삭제, 협력사 모드에서 생성된 과제 결과 리포트 조회
11. 관리자 `협력사/사용자 관리`에서 사용자 이름·이메일·최근 접속 시간을 조회하고 사용자 선등록·수정·삭제
12. 프로젝트 기본정보·과제 기본정보·인터뷰 답변·프로세스 수정·수행 빈도를 패널별 `저장` 버튼으로 Supabase에 임시 저장하고 재접속 시 최신 저장본 복원
13. 과제 목록에서 완료 과제는 저장된 결과 리포트를 상세 팝업 또는 6단계에서 조회하고, 진행 중 과제는 Supabase에 기록된 마지막 저장 단계부터 재개

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
├─ docs/DEPLOY.md             # Supabase·Vercel 배포 체크리스트
├─ supabase/migrations/       # Supabase PostgreSQL 스키마
├─ supabase/functions/        # Supabase 비밀값을 사용하는 Edge Function
├─ vercel.json                # Vercel 빌드·라우팅 설정
└─ ui mokup/                  # 참고용 원본 문서 보관 위치
```

## 주요 API

- `GET /api/health`: Supabase Data API 실제 조회를 포함한 상태 확인
- `GET /api/auth/companies`: 가입 가능한 활성 협력사 목록
- `GET /api/auth/me`: 현재 사용자·프로필·멤버십
- `POST /api/auth/check-registration`: 협력사·이메일 기존 등록 여부 확인
- `POST /api/auth/complete-profile`: 기존 계정의 현재 세션 연결 또는 사용자가 승인한 신규 등록 완료
- `POST /api/auth/admin-login`: Supabase Edge Function 비밀번호 검증 및 HttpOnly 관리자 세션 발급
- `GET /api/auth/admin-session`: 관리자 세션 복원
- `POST /api/auth/admin-logout`: 관리자 세션 종료
- `GET /api/admin/overview`: 전체 협력사 프로젝트·과제 조회(관리자)
- `DELETE /api/admin/companies/:companyId`: 협력사와 소속 프로젝트·과제·사용자·리포트·AI 설정 삭제(관리자)
- `DELETE /api/admin/projects/:projectId`: 프로젝트와 소속 과제·분석·리포트 삭제(관리자)
- `DELETE /api/admin/tasks/:taskId`: 과제와 프로세스·진단·분석·To-Be·리포트 삭제(관리자)
- `GET /api/admin/companies`: 사용자 관리 선택용 경량 협력사 목록(관리자)
- `GET /api/admin/users`: 협력사 사용자와 최근 접속 시간 조회(관리자)
- `POST /api/admin/users`: 협력사 사용자 선등록(관리자)
- `PATCH /api/admin/users/:userId`: 협력사 사용자 이름·이메일·소속 수정(관리자)
- `DELETE /api/admin/users/:userId`: 사용자 디렉터리와 연결된 Supabase Auth 사용자·멤버십 삭제(관리자)
- `GET /api/admin/tasks/:taskId/report`: 협력사 모드에서 마지막으로 생성·저장한 과제 결과 리포트 조회(관리자)
- `POST /api/admin/companies`: 협력사 등록(관리자)
- `PATCH /api/admin/companies/:companyId/status`: 협력사 완료 처리와 재활성화(관리자). 내부 상태는 `suspended`로 유지하며 재활성화 시 프로젝트·과제의 완료 처리 전 상태를 복원합니다.
- `GET /api/admin/tasks.csv?consulting_year=:year&consulting_half=:half`: 선택한 컨설팅 차수의 협력사명·프로젝트명·과제명을 과제당 한 행으로 출력(관리자)
- `GET|POST /api/projects`
- `GET|PUT|DELETE /api/projects/:projectId`
- `GET|POST /api/projects/:projectId/tasks`
- `PUT /api/projects/:projectId/tasks/:taskId`: 기존 과제 기본정보 수정
- `DELETE /api/projects/:projectId/tasks/:taskId`: 협력사 과제와 소속 분석·리포트 연관 데이터 삭제
- `GET|PUT|DELETE /api/drafts/:panelKey`: 로그인 사용자별 패널 임시 저장본 조회·저장·정리(`project_basic`, `task_basic`, `interview_answers`, `process_editor`, `report_frequency`)
- `GET /api/connections`: 로그인 협력사의 AI 엔진 등록 상태 조회(Key 원문 제외)
- `PUT /api/connections/:engine`: 실제 연결 검증 후 협력사 Key 암호화 저장
- `PUT /api/connections/:engine/default`: 새 프로젝트 기본 AI 엔진 지정
- `DELETE /api/connections/:engine`: 협력사 AI API Key 삭제
- `/api/interviews/*`: 실제 AI Draft 생성·저장과 작업별 프로세스 수정. 플로우차트 동기화는 순서 변경·행 추가·삭제·레벨 변경을 단일 일괄 API 요청으로 처리합니다.
- `GET /api/interviews/project/:projectId/task/:taskId/latest`: 과제별 최신 인터뷰 구조화 답변 복원
- `/api/domains/*`: 업무 계층
- `/api/analysis/*`: 작업별 BDW, AI FIT, To-Be, AX 성과지표 리포트
- `GET /api/analysis/project/:projectId/report`: 저장 없이 최신 PDF 프리뷰 데이터 생성
- `GET /api/analysis/project/:projectId/report/saved`: 마지막 정식 저장 리포트의 수행 빈도 등 사용자 입력 복원
- `GET /api/analysis/project/:projectId/ai-fit`: 마지막으로 저장된 AI FIT 및 To-Be 상태 복원
- `POST /api/analysis/project/:projectId/report/save`: 검증된 최신 PDF 리포트를 과제별 스냅샷으로 명시적 저장
- `GET /api/analysis/project/:projectId/report.csv?task_id=:taskId`: 저장된 PDF 리포트에서 BDW 진단·AI FIT 분석을 제외하고 메타데이터, 이관 대상 섹션별 JSON, 필터링된 `report_data` JSONB를 한 행에 담은 DB 이관용 UTF-8 CSV 출력. 상세 양식은 `RESULT_REPORT_CSV_SCHEMA.md`를 따릅니다.

## 운영 원칙

- 비밀키와 `.env` 파일은 Git에 커밋하지 않습니다.
- 모든 업무 데이터는 Supabase Auth 사용자, `company_memberships.company_id`, RLS를 기준으로 격리합니다.
- `company_user_accounts`는 관리자 선등록과 자유 가입을 연결하는 사용자 디렉터리입니다. 선등록 사용자가 같은 협력사·이메일로 처음 접속하면 익명 Auth 사용자와 자동 연결되고 `/api/auth/me` 세션 복원 시 최근 접속 시간이 갱신됩니다.
- 관리자 사용자 등록은 브라우저와 API에서 이메일 형식을 이중 검증하며, 등록 성공 응답 후 `/api/admin/users`를 다시 조회하여 Supabase 저장 결과를 목록에 표시합니다.
- Supabase Secret Key(또는 레거시 Service Role Key)는 사용자 인증 확인·최초 멤버십 생성·감사 로그에만 사용하고, 업무 데이터 API는 사용자 JWT가 적용된 Supabase 클라이언트로 RLS를 통과해야 합니다.
- Vercel 배포 시 루트 `index.html`을 프런트엔드 빌드 입력으로 사용합니다.
- 운영 및 로컬 API 데이터베이스는 Supabase PostgreSQL을 사용합니다.
- AI 분석 모델은 OpenAI `gpt-5-nano`, Gemini `gemini-3.5-flash-lite`, Claude `claude-sonnet-5`를 사용합니다. OpenAI와 Gemini 모델은 각각 `OPENAI_MODEL`, `GEMINI_MODEL` 환경변수로 교체할 수 있습니다.
- 세 공급자 모두 공식 JSON Schema 구조화 출력을 사용합니다. 협력사 API Key는 연결 확인 후 AES-256-GCM으로 암호화해 저장하며 Draft·BDW·AI FIT 실행 시 백엔드에서만 복호화합니다.
- 프로젝트 계층은 `department_name=L1 구분`, `description=L2 대분류`, `name=L3 중분류`로 저장하고 API에서는 L2를 `business_name` 별칭으로 제공합니다.
- 프로젝트 및 과제 등록은 기간과 필수 역할 참여자를 프런트엔드와 API에서 이중 검증합니다.
- 프로젝트 삭제는 `삭제하시겠습니까?` 확인창의 `네` 선택 후에만 실행되며 소속 과제·분석·리포트가 Supabase 외래키 관계로 함께 삭제됩니다.
- 과제 목록의 `삭제`는 `과제 상세`과 같은 크기로 표시하며, 확인창에서 `네`를 선택한 경우에만 과제와 프로세스·인터뷰·분석·리포트를 Supabase에서 함께 삭제합니다.
- 과제 기간은 선택한 상위 프로젝트 기간 안에 있어야 하며 프런트엔드와 API에서 이중 검증합니다.
- `panel_drafts`는 사용자·협력사·패널·화면 범위별 최신 임시 저장본 한 건을 보관합니다. 자동 저장은 하지 않으며 정식 등록 또는 분석 저장이 완료되면 해당 임시 저장본을 삭제합니다. BDW 태그는 기존 즉시 저장을 유지하고 AI API Key는 임시 저장 대상에서 제외합니다.
- AI Draft와 프로세스 편집 화면은 작업방식·도구를 L6 Act에만 적용하며, L6의 수행·대기·승인대기 시간 합계를 L5에, L5 합계를 L4에 반영합니다. 프로세스 표시 순서는 `sort_order`로 Supabase에 저장합니다.
- BDW와 AI FIT 표는 프로세스·플로우차트 순서대로 표시합니다. AI FIT는 추천 기술별 비개발자 관점 구현 난이도(상·중·하)를 함께 저장·표시하고, 비교 플로우 노드는 작업방식을 배지로, 도구와 수행시간을 보조 문장으로 표시합니다.
- AI FIT 제안은 L6 Act별로 사용자가 수락한 항목만 To-Be에 반영하며, 서버에 저장된 분석 결과를 기준으로 생성합니다.
- 수행 빈도는 일·주·월·년별 횟수를 연간으로 환산하여 AX 절감 시간과 FTE를 계산합니다.
- AI Draft는 STATIK L1 구분~L6 Act 전체 정의를 따르며 L6 Act를 `목적어 + 단일 동사` 형태의 최소 행위로 생성합니다.
- 결과 페이지는 PDF 프리뷰를 먼저 표시합니다. PDF에는 과제 참여자만 이름·직급·역할·이메일로 출력하고, BDW 요약·전체 목록과 L6 기준 AS-IS·To-Be 작업방식·도구를 포함합니다. 사용자가 `결과 리포트 저장`을 누른 경우에만 `task_reports` 최신 PDF 리포트 스냅샷을 저장하며, 관리자 과제 목록의 `상세 조회` 버튼이 활성화됩니다. DB 이관용 CSV는 저장된 스냅샷에서 BDW 진단과 AI FIT 분석을 제외하고 식별 메타데이터, 이관 대상 섹션별 JSON, 필터링된 `report_data_json`을 과제당 한 행으로 출력합니다.
- 결과 리포트 저장 시 과제 상태와 현재 단계가 `completed`·6단계로 함께 갱신되어 사용자 및 관리자 과제 목록에 `완료`로 표시됩니다.
- 사용자 과제 목록의 `과제 상세`은 저장된 PDF 리포트 내용을 팝업으로 표시합니다. 완료 과제 카드는 6단계 결과 리포트로, 진행 중 과제 카드는 `current_step`에 기록된 마지막 저장 단계로 이동합니다.

## Supabase 설정

1. Supabase 프로젝트를 생성하고 CLI를 같은 소유 계정으로 로그인한 뒤 프로젝트를 연결합니다.
2. `npx supabase db push --linked`로 `supabase/migrations/`의 마이그레이션을 순서대로 적용합니다.
3. `npx supabase config push --project-ref <PROJECT_REF>`로 Anonymous Sign-Ins 설정을 적용합니다. 협력사 등록은 이메일 승인을 보내지 않고 익명 세션에 검증된 형식의 이메일을 프로필 정보로 저장합니다.
4. `.env.example`을 참고해 로컬 `.env`에 서버용·브라우저용 Supabase 변수를 설정합니다.
5. Supabase Dashboard의 Edge Functions → Secrets에 `BPA_ADMIN_PASSWORD`를 등록하고 `admin-password-verify` 함수를 배포합니다. 비밀번호는 로컬 `.env`, Vercel, 프런트엔드 코드 또는 Git에 저장하지 않습니다.
6. `admin-password-verify`는 Supabase Secret Key로 호출한 Vercel 백엔드 요청만 허용하며 비밀번호 일치 여부만 반환합니다.
7. Secret Key 또는 레거시 Service Role Key는 백엔드 전용이며 `VITE_` 접두사를 붙이거나 브라우저 코드에 넣지 않습니다. Publishable Key만 브라우저에 노출할 수 있습니다.

## Vercel 배포

Git 저장소를 Vercel 프로젝트에 연결한 후 다음 환경 변수를 Production, Preview, Development에 등록합니다.

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `BPA_CREDENTIAL_ENCRYPTION_KEY`

관리자 비밀번호는 Vercel 환경변수가 아니라 Supabase Edge Function Secret `BPA_ADMIN_PASSWORD`로만 관리합니다. Vercel은 `npm run build`로 루트 `index.html`을 빌드하고 `api/index.js`의 Express 앱을 서버리스 함수로 실행합니다. `/api/*`는 Express 함수로, 나머지 경로는 정적 `index.html`로 전달됩니다.

배포 후 `npm run check:deployment -- https://your-app.vercel.app`를 실행해 `/api/health`와 실제 협력사 데이터 API가 모두 200인지 확인합니다. 전체 절차는 [docs/DEPLOY.md](docs/DEPLOY.md)를 따릅니다.

`BPA_CREDENTIAL_ENCRYPTION_KEY`는 32자 이상의 무작위 값으로 설정하고 운영 중 임의로 변경하지 마세요. 값을 변경하면 기존에 저장된 협력사 API Key는 복호화할 수 없으며 각 협력사가 다시 등록해야 합니다.

AI Draft, BDW, AI FIT처럼 외부 모델을 호출하는 함수의 제한시간은 `vercel.json`에서 60초로 설정되어 있습니다. 사용하는 Vercel 요금제의 함수 실행시간 한도도 함께 확인해야 합니다.
