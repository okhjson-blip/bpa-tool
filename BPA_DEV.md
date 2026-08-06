# BPA Tool 개발 기준

## 1. 확정 구조

- UI 진입점: 저장소 루트 `index.html`
- 프런트엔드 도구: Vite
- 백엔드: Node.js + Express (로컬 서버 및 Vercel Function)
- 데이터베이스: Supabase PostgreSQL (`@supabase/supabase-js` 서버 전용 클라이언트)
- 개발 API 주소: `http://localhost:5000/api`
- 개발 UI 주소: `http://localhost:3000`
- 프로덕션 주소: `http://localhost:5000`
- 배포: Vercel 정적 프런트엔드 + Express Function
- 운영 DB: Supabase PostgreSQL

`ui mokup` 폴더는 디자인 및 요구사항 참고용입니다. 실행 환경은 해당 폴더의 파일을 직접 참조하지 않습니다.

AI API Key는 브라우저에서 성공으로 가정하지 않습니다. `POST /api/connections/test`가 선택한 공급자의 모델 목록 API를 호출하고 인증 성공을 반환한 경우에만 연결 완료 상태를 표시합니다.

Provider별 운영 모델과 구조화 출력 방식은 다음과 같습니다.

- OpenAI: `gpt-5.6-sol`, Responses API `text.format` JSON Schema
- Gemini: `gemini-2.5-flash`, `generationConfig.responseSchema`
- Claude: `claude-sonnet-5`, Messages API `output_config.format` JSON Schema

응답 스키마를 L4/L5/L6 프로세스, BDW, AI FIT 구조로 제한합니다. 저장된 프로세스의 `task_id`와 세션 API Key는 후속 분석 API에도 전달하되 API Key는 브라우저 저장소와 데이터베이스에 저장하지 않습니다. 백엔드는 요청 본문의 엔진명을 신뢰하지 않고 프로젝트의 `ai_engine`으로 Provider를 선택합니다.

`file://`로 루트 `index.html`을 직접 실행하는 경우 API 기준 주소는 `http://localhost:5000/api`입니다. HTTP/Vite/Express를 통해 실행하는 경우에는 동일 출처 상대 경로 `/api`를 사용합니다.

## 2. 실행 연결

Vite의 `root`는 저장소 루트이며 `index.html`을 읽습니다. 빌드 결과는 `frontend/dist`에 생성됩니다. Express는 `/api/*`를 먼저 처리하고 나머지 요청에 `frontend/dist/index.html`을 반환합니다.

```text
개발: index.html → Vite :3000 → /api 프록시 → Express :5000
운영: Vercel CDN(index.html) → /api/* → Express Function → Supabase
```

## 3. 업무 모델

- 접속 첫 화면의 회사명은 브라우저에 저장되며 프로젝트 조회 시 `company_name` 필터로 전달합니다.
- 외부 AI API Key는 연결 검증과 현재 세션에만 사용하며 브라우저 저장소나 데이터베이스에 저장하지 않습니다.
- Project: 회사, 부서, 목적, 기간, AI 엔진, 참여자
- Task: 프로젝트 하위 L4 분석 과제
- ProcessNode: L4 모듈, L5 단위 업무, L6 Action
- Interview: 기본 질문 및 담당자 답변
- BDWTag: bottleneck, delay, waste, normal
- AIFit: AI 적용 가능성, 비효율성, A/B/C/D 분류
- ToBeProcess: AI 적용 후 시간과 자동화 방식

## 4. 구현 원칙

1. 업무 조회와 변경은 항상 `project_id` 및 `task_id`로 제한합니다.
2. L6 수행시간은 분 단위 필수 값입니다.
3. 대기시간과 승인 대기시간은 별도 필드로 관리합니다.
4. AI Provider는 교체 가능한 인터페이스로 분리합니다.
5. LLM 전달 전 개인정보 마스킹 단계를 유지합니다.
6. API Key, 토큰, `.env`는 저장소에 커밋하지 않습니다.
7. 프런트엔드 API는 상대 경로 `/api`를 사용합니다.
8. 편집 테이블과 플로우차트는 동일한 API 응답 상태를 렌더링하며 저장 성공 후 함께 갱신합니다.

## 5. 핵심 계산식

```text
비효율 지수 = 비효율 시간 / 전체 시간 × 100
자동화율 = A영역 L6 수 / 전체 L6 수 × 100
연간 절감시간(h) = 건당 절감시간(분) × 과제별 연간 수행 횟수 / 60
절감 FTE = 연간 절감시간(h) / 2,248h
외주 개발비 = A영역 수 × 1.0 M/M × 8,321,500원
```

결과 리포트 API는 `project_id`와 `task_id`에 속한 L6, BDW, AI FIT, To-Be 데이터만 집계합니다. PDF 출력은 사용자가 선택한 섹션만 인쇄 문서로 구성하고, CSV 출력은 섹션 선택과 무관하게 프로젝트명·과제명·AS-IS 프로세스·To-Be 프로세스 네 열만 생성합니다.

## 6. 배포 전 확인

- `npm run build`
- API 헬스 체크 `/health`
- 프로젝트 목록과 과제 목록
- Step 1~6 이동
- 팝업 및 AI FIT 탭
- 브라우저 콘솔 오류
- 비밀정보 포함 여부
- Supabase migration 적용 여부와 Vercel 환경 변수 등록 여부

테스트 실행은 작업 지침에 따라 사용자 승인 후 수행합니다.
