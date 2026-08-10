# BPA Tool 개발 기준

## 1. 확정 구조

- UI 진입점: 저장소 루트 `index.html`
- 프런트엔드 도구: Vite
- 백엔드: Node.js + Express (로컬 서버 및 Vercel Function)
- 인증: 협력사 Supabase 익명 세션 자동 복원, 관리자 HttpOnly 서명 세션
- 데이터베이스: Supabase PostgreSQL + JWT 기반 RLS
- 개발 API 주소: `http://localhost:5000/api`
- 개발 UI 주소: `http://localhost:3000`
- 프로덕션 주소: `http://localhost:5000`
- 배포: Vercel 정적 프런트엔드 + Express Function
- 운영 DB: Supabase PostgreSQL

`ui mokup` 폴더는 디자인 및 요구사항 참고용입니다. 실행 환경은 해당 폴더의 파일을 직접 참조하지 않습니다.

AI API Key는 로그인 화면과 분리된 협력사 설정에서 관리합니다. `PUT /api/connections/:engine`이 공급자의 실제 API를 호출하고 인증 성공을 반환한 경우에만 AES-256-GCM 암호문으로 저장합니다.

Provider별 운영 모델과 구조화 출력 방식은 다음과 같습니다.

- OpenAI: `gpt-5-nano`, Responses API `text.format` JSON Schema (환경변수 `OPENAI_MODEL`로 재정의 가능)
- Gemini: `gemini-3.5-flash-lite`, `generationConfig.responseFormat.text`의 `APPLICATION_JSON` 및 JSON Schema (환경변수 `GEMINI_MODEL`로 재정의 가능)
- Claude: `claude-sonnet-5`, Messages API `output_config.format` JSON Schema

응답 스키마를 L4 모듈·L5 단위·L6 Act 프로세스, BDW, AI FIT 구조로 제한합니다. 후속 분석 요청은 `task_id`만 전달하며 API Key를 포함하지 않습니다. 백엔드는 프로젝트의 `ai_engine`과 로그인 사용자의 `company_id`로 암호화된 협력사 Key를 조회·복호화합니다.

루트 `index.html`은 Supabase Auth 모듈과 API 프록시를 사용하므로 Vite 또는 Express를 통해 실행합니다. 프런트엔드 API는 동일 출처 상대 경로 `/api`를 사용합니다.

## 2. 실행 연결

Vite의 `root`는 저장소 루트이며 `index.html`을 읽습니다. 빌드 결과는 `frontend/dist`에 생성됩니다. Express는 `/api/*`를 먼저 처리하고 나머지 요청에 `frontend/dist/index.html`을 반환합니다.

```text
개발: index.html → Vite :3000 → /api 프록시 → Express :5000
운영: Vercel CDN(index.html) → /api/* → Express Function → Supabase
```

## 3. 인증·테넌트 모델

- `companies`: 관리자가 협력사명과 컨설팅 연도·상/하반기로 등록하며 `active` 또는 `suspended` 상태를 가집니다. 동일 협력사는 서로 다른 컨설팅 차수로 등록할 수 있습니다.
- `profiles`: Supabase Auth `user_id`와 이름·이메일·애플리케이션 역할을 연결합니다.
- `company_memberships`: 사용자와 협력사를 연결하고 `company_admin`, `company_editor`, `company_viewer` 역할을 관리합니다.
- `company_user_accounts`: 관리자 사용자 선등록과 자유 가입을 연결하는 디렉터리입니다. `auth_user_id`는 최초 로그인 전에는 `NULL`이며, 같은 협력사·이메일로 접속하면 익명 Auth 사용자와 연결됩니다. 최근 세션 복원 시 `last_access_at`을 갱신합니다.
- `panel_drafts`: 협력사·사용자·패널 키·화면 범위별 최신 수동 임시 저장 payload를 JSONB로 보관합니다. 프로젝트·과제 외래키 삭제 시 연관 저장본도 정리됩니다.
- `interviews.task_id`, `interviews.answers`: 인터뷰를 과제에 직접 연결하고 화면 질문 순서의 답변 배열을 저장하여 재접속·이전 단계 이동 시 복원합니다. 기존 인터뷰는 연결된 프로세스의 `task_id`로 역연결합니다.
- 협력사 사용자는 활성 협력사와 이름·이메일을 입력하고 `시작하기`를 클릭합니다. 같은 협력사·이메일의 기존 디렉터리 계정은 기존 로그인 세션을 유지하면서 현재 Supabase 익명 세션에도 접근 멤버십을 연결합니다. 미등록 사용자는 안내 후 `등록`을 직접 클릭한 경우에만 프로필과 `company_editor` 멤버십을 생성합니다. 이메일 승인 절차는 사용하지 않습니다.
- 브라우저는 Supabase 세션을 자동 복원하고 모든 보호 API에 Access Token을 전달합니다.
- 백엔드 업무 데이터 클라이언트는 Publishable Key와 사용자 JWT를 사용합니다. 클라이언트 요청의 회사명이나 `company_id`를 신뢰하지 않고 RLS가 허용한 회사 데이터만 조회·변경합니다.
- 관리자 비밀번호는 Supabase Edge Function Secret `BPA_ADMIN_PASSWORD`에만 저장합니다. Vercel 백엔드는 Secret Key로 `admin-password-verify` 함수를 호출해 일치 여부만 받은 뒤 8시간 유효한 HttpOnly 서명 쿠키를 발급합니다.
- `202608070003_password_admin_only.sql`은 기존 `super_admin` 프로필을 일반 사용자로 전환하고 사용자 JWT 기반 관리자 우회를 차단합니다. 관리자 조회는 비밀번호 세션을 확인한 백엔드의 Service Role 경로에서만 수행합니다.
- 관리자가 협력사를 완료 처리하면 DB 함수가 협력사와 소속 프로젝트·과제를 한 트랜잭션에서 내부 상태 `suspended`로 변경하고, 미들웨어와 RLS가 해당 멤버의 업무 데이터 접근을 차단합니다. 재활성화 시 각 프로젝트·과제의 완료 처리 전 상태를 복원합니다.
- 협력사 모드의 결과 리포트 조회 API는 저장 없이 PDF 프리뷰 데이터를 생성합니다. 사용자가 저장 API를 실행하면 산출 결과 전체를 `task_reports.report_data` JSONB에 과제별 최신 PDF 스냅샷으로 저장합니다. `report_title`, `report_format`, `report_version`, `saved_at`을 함께 관리하며 관리자 상세 조회 API는 분석을 재실행하지 않고 이 저장본만 Service Role로 읽습니다.
- 관리자 삭제 API는 Service Role 전용 Supabase RPC를 사용합니다. 협력사·프로젝트·과제 삭제는 PostgreSQL 트랜잭션 안에서 외래키 cascade와 함께 처리하며, 브라우저에서 직접 RPC를 호출할 수 없도록 `anon`, `authenticated` 실행 권한을 회수합니다.

## 4. 업무 모델

- 외부 AI API Key는 연결 검증 후 `company_ai_credentials`에 협력사·공급자별 AES-256-GCM 암호문으로 저장합니다. 암호화 키는 `BPA_CREDENTIAL_ENCRYPTION_KEY`로 Vercel 환경 변수에서 관리하며 브라우저에 노출하지 않습니다.
- Key 원문은 등록 요청에서만 전달되고 목록 API는 마스킹 힌트·모델·검증일만 반환합니다.
- 여러 공급자를 등록할 수 있으며 `companies.default_ai_provider`가 새 프로젝트의 기본 엔진을 결정합니다.
- Project: 회사, `department_name`(L1 구분·조직 기능), `description/business_name`(L2 대분류·업무 도메인), `name`(L3 중분류·핵심 기능), 목적, 시작·종료일, AI 엔진, 참여자
- Task: 프로젝트 L1~L3를 서버에서 상속받는 하위 L4 모듈 분석 과제
- ProcessNode: L4 모듈, L5 단위, L6 Act
- Interview: 기본 질문 및 담당자 답변
- BDWTag: bottleneck, delay, waste, normal
- AIFit: AI 적용 가능성, 비효율성, A/B/C/D 분류, 비개발자 관점 구현 난이도(low/medium/high)
- ToBeProcess: AI 적용 후 시간과 자동화 방식

## 5. 구현 원칙

1. 업무 조회와 변경은 로그인 사용자의 활성 `company_id`, `project_id`, `task_id`로 제한합니다.
2. L6 Act 수행시간은 분 단위 필수 값입니다.
3. 대기시간과 승인 대기시간은 별도 필드로 관리합니다.
4. AI Provider는 교체 가능한 인터페이스로 분리합니다.
5. LLM 전달 전 개인정보 마스킹 단계를 유지합니다.
6. API Key, 토큰, `.env`는 저장소에 커밋하지 않습니다.
7. 프런트엔드 API는 상대 경로 `/api`를 사용합니다.
8. 편집 테이블과 플로우차트는 동일한 `sort_order` 순서의 API 응답 상태를 렌더링하며 저장 성공 후 함께 갱신합니다. 동기화는 프로세스별 병렬 HTTP 요청 대신 행 추가·이동·삭제·레벨 변경을 처리하는 단일 일괄 API를 사용합니다. 작업방식과 도구는 L6 Act에만 저장·편집·표시하고, L4·L5는 항상 `NULL`로 정규화합니다.
9. AI FIT As-Is/To-Be 비교 노드는 프로세스 순서로 정렬하며 작업방식은 배지, 도구·수행시간은 보조 문장으로 표시합니다. To-Be의 `ai_applied` 또는 시스템 작업방식에 따라 자동화 배지를 표시합니다.
10. 프로젝트는 프로젝트 리더·담당자·컨설턴트를, 과제는 과제 리더·담당자를 최소 1명씩 포함해야 합니다.
11. 프로젝트·과제 기간은 ISO 날짜 시작일/종료일로 저장하고 종료일이 시작일보다 빠를 수 없습니다. 과제 기간은 상위 프로젝트 기간을 벗어날 수 없습니다.
12. Service Role Key는 브라우저로 전달하지 않으며 업무 데이터 CRUD에 사용하지 않습니다.
13. 관리자 프로젝트·과제 화면은 조회 전용으로 유지하고 협력사 등록 및 활성/완료 처리만 허용합니다. 협력사·프로젝트·과제 통계는 각각 전체와 활성으로 구분하며, 과제 상세는 협력사 모드에서 저장된 최신 결과 리포트만 팝업으로 표시합니다. 관리자 CSV는 선택한 컨설팅 연도·반기에 해당하는 과제만 협력사명·프로젝트명·과제명 세 컬럼으로 과제당 한 행을 출력합니다.
14. 관리자 사용자 화면은 프로젝트·과제 화면과 분리하며 협력사, 사용자 이름, 이메일 주소, 최근 접속 시간을 표시합니다. 선등록·수정·삭제는 관리자 세션이 확인된 Service Role API만 수행하고, 삭제 시 연결된 Supabase Auth 사용자·프로필·멤버십도 함께 제거합니다.
15. AI 자격증명 테이블은 authenticated/anon 직접 권한과 RLS 정책을 제공하지 않고 권한 검사를 마친 백엔드 Service Role만 접근합니다.
16. 임시 저장은 자동 실행하지 않고 패널별 `저장` 버튼에서만 수행합니다. 범위는 프로젝트 기본정보, 과제 기본정보, 인터뷰 답변, 프로세스 수정, 수행 빈도이며 재접속 시 최신 저장본을 자동 로딩합니다. 정식 등록·AI Draft 저장·프로세스 동기화·결과 리포트 저장이 끝나면 해당 임시 저장본을 삭제합니다.
17. L6 행의 수행·대기·승인대기 합계는 부모 L5에, L5 합계는 부모 L4에 계산해 표시·저장합니다.
18. 등록 과제를 다시 열거나 이전 단계로 이동할 때 과제 기본정보와 최신 인터뷰·AI Draft를 Supabase 공식 데이터에서 먼저 읽고 사용자 임시 저장본이 있으면 그 값을 우선 적용합니다.
19. As-Is/To-Be 비교의 As-Is 작업방식 배지는 원본 프로세스 `method`만 사용하며 To-Be 자동화 여부를 역전파하지 않습니다.
20. 결과 리포트 스냅샷 저장과 과제 `status=completed`, `current_step=6` 갱신은 같은 API 흐름에서 처리합니다. 관리자 활성 과제 통계는 완료 과제를 제외합니다.
21. 과제의 명시적 저장·분석 API는 `current_step`을 함께 갱신합니다. 진행 중 과제 재접속 시 해당 단계와 공식 데이터·최신 임시 저장본을 복원하고, 완료 과제는 저장된 `task_reports` 스냅샷을 6단계 및 상세 팝업에서 조회합니다.
22. 협력사 과제 삭제 API는 프로젝트 소속 여부와 `requireCompanyWrite` 권한을 확인한 뒤 `tasks` 행을 삭제합니다. 프로세스·인터뷰·BDW·AI FIT·To-Be·임시 저장·리포트는 Supabase 외래키의 `ON DELETE CASCADE`로 함께 정리합니다.

## 6. 핵심 계산식

```text
비효율 지수 = 비효율 시간 / 전체 시간 × 100
연간 수행 횟수 = 기간당 수행 횟수 × 환산계수(일 365, 주 52, 월 12, 년 1)
자동화율 = 사용자가 수락하여 To-Be에 반영한 L6 Act 수 / 전체 L6 Act 수 × 100
연간 절감시간(h) = 건당 절감시간(분) × 연간 수행 횟수 / 60
절감 FTE = 연간 절감시간(h) / 2,248h
외주 개발비 = 수락·반영 L6 Act 수 × 1.0 M/M × 8,321,500원
```

결과 리포트 API는 `project_id`와 `task_id`에 속한 L6 Act, BDW, AI FIT, To-Be 데이터만 집계합니다. PDF 출력은 과제 참여자, BDW 요약·전체 목록, 작업방식·도구를 포함한 L6 AS-IS·To-Be 등 전체 분석 섹션을 숨김 인쇄 프레임으로 구성합니다. `GET /api/analysis/project/:projectId/report.csv?task_id=:taskId`는 UTF-8 과제정보 CSV를 첨부파일로 반환합니다. CSV는 과제당 한 행이며 헤더는 `과제명, 시작일, 완료일, 성과목표, As-Is, To-Be, 난이도`입니다. As-Is와 To-Be는 플로우차트와 같은 L6 순서로 `업무명 [작업방식 | 도구 | 수행시간] > ...` 형식으로 기록하고, 난이도는 수락되어 AI 자동화된 전체 Act의 구현 난이도 평균을 상·중·하로 환산합니다.

To-Be 생성 API는 클라이언트가 전달한 분석 수치를 신뢰하지 않고 `accepted_process_ids`만 받아, 서버에 저장된 해당 프로젝트·과제의 AI FIT 결과로 처리시간과 적용 방식을 계산합니다.

AI Draft 프롬프트에는 STATIK L1 구분(조직 기능), L2 대분류(업무 도메인), L3 중분류(핵심 기능), L4 모듈, L5 단위(독립 업무), L6 Act(최소 행위)의 전체 정의와 등록 과제의 L1~L4 컨텍스트를 포함합니다. 백엔드는 L6 Act 명칭이 목적어와 하나의 동사로 구성되었는지 검증한 후 저장합니다.

## 7. 배포 전 확인

- `npm run build`
- API 헬스 체크 `/api/health`의 `db=supabase`, `data_api=true`
- 실제 데이터 API `/api/auth/companies` HTTP 200
- 프로젝트 목록과 과제 목록
- Step 1~6 이동
- 팝업 및 AI FIT 탭
- 브라우저 콘솔 오류
- 비밀정보 포함 여부
- Supabase migration·Edge Function 배포 여부와 Supabase/Vercel 환경 변수 등록 여부
- 이메일 형식 검증, 승인 없는 자유 등록, 새로고침 후 세션 복원, 협력사별 데이터 격리
- 협력사 완료 처리 후 접근 차단 및 관리자 프로젝트·과제 변경 불가
- Vercel 배포 후 `npm run check:deployment -- https://<deployment-url>` 통과

테스트 실행은 작업 지침에 따라 사용자 승인 후 수행합니다.
