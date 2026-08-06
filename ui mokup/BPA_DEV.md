# AX 비즈니스 프로세스 분석 웹앱 개발 백로그 및 코딩 지시서

## 0. v1 범위 확정 사항 (2026-07-31 결정)

`BPA_Tool_UI_Preview.html` 목업을 실제 배포 가능한 서비스로 전환하면서, 기존 문서(본 파일)와
`UX_시나리오_설계.md` 사이에 상충되던 항목을 아래와 같이 확정했다. 상세 실행 계획은
`optimized-swimming-bunny` 코딩 계획(2026-07-31) 기준.

| 항목 | 확정 내용 | 비고 |
|---|---|---|
| 백엔드 언어 | **Python + FastAPI** | 아래 "1. 기술 스택" 갱신 |
| 인증/RBAC | **v1 제외** — 계정 없이 프로젝트 목록에서 바로 시작 | Epic 1은 **Phase 7 백로그**로 이관 (UX_시나리오_설계.md "계정/인증 불필요" 기준 채택) |
| AI 엔진 연동 | **Mock 응답으로 v1 우선 구현** | Provider 인터페이스로 추상화해 후속에 실제 Gemini/ChatGPT/Claude로 무중단 교체 |
| 실시간 공동편집 | **v1 제외**, 자동저장(30초 간격)으로 대체 | WebSocket 커서 동기화는 Phase 7 백로그 |

## 1. 프로젝트 개요 및 기술 스택 (확정)
* **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS(목업 컬러 토큰 이식), Zustand(전역 상태), React Flow (양방향 플로우차트 동기화용), React Router
* **Backend:** Python 3.12 + FastAPI, SQLAlchemy 2.0 + Alembic, Pydantic v2
* **Database:** PostgreSQL 16 (docker-compose 서비스, 관계형 모델 관리)
* **리포트 생성:** python-pptx, python-docx, weasyprint/reportlab (PDF)
* **배포:** Docker Compose (postgres / backend / frontend) — on-prem·클라우드 무관하게 바로 구동
* **Security & Auth:** v1 미적용. Phase 7에서 JWT 인증 + Bcrypt 암호화 + Role(관리자/컨설턴트/고객사) 도입 예정
* **AI 연동:** Provider 추상 인터페이스 + Mock Provider(v1) → 다중 퍼블릭 LLM API(Gemini, ChatGPT, Claude) 실연동은 Phase 7. Data Masking 미들웨어는 v1부터 파이프라인 자리 확보(통과 처리)

## 2. 개발 백로그 (마일스톤 순서)

### Milestone 1: 스캐폴딩
* Docker Compose(postgres/backend/frontend), FastAPI 헬스체크, Alembic 초기화
* React+Vite+TS+Tailwind+Router 골격, 목업 CSS 변수 → Tailwind 테마 이식
* 공통 UI 컴포넌트(Button/Card/Input/Tabs/Modal) 구현

### Milestone 2: 프로젝트 및 과제 관리 
* **[Backend]** Project·Task·Participant 모델/스키마/CRUD 라우터 구현 (Tenant Isolation은 v1 미적용, Phase 7에서 인증 도입 시 추가)
* **[Frontend]** ProjectList / NewProject / TaskList / Step1_TaskRegistration 페이지 (L1~L4 계층 입력 UI 포함)

### Milestone 3: 인터뷰 및 AI 자동 분해 
* **[Frontend]** Step2 페이지: 인터뷰 질문 5개 + 답변 텍스트 입력 UI (v1은 타이핑 입력만, 녹음/파일업로드 실연동은 Phase 7)
* **[Backend]** Data Masking 전처리 자리 확보(`services/ai/masking.py`, v1은 통과 처리)
* **[Backend]** `draft_service`: Mock Provider 기반 인터뷰→L4~L6 분해 오케스트레이션 (프롬프트 체인 설계는 Phase 7 실연동 시 적용)
* **[Backend]** AI 응답 파싱 결과를 ProcessNode(L4~L6) 테이블에 적재하는 로직

### Milestone 4: 프로세스 동기화 및 BDW 진단 
* **[Frontend]** Step3 페이지: L4~L6 프로세스 테이블 뷰 (CRUD, 행 드래그앤드롭 편집)
* **[Frontend]** React Flow 기반 양방향 동기화 (Table ↔ Flowchart) — `useProcessStore` 단일 소스로 별도 동기화 로직 없이 구현
* **[Frontend]** Step4 페이지: BDW 태그 부착 및 비효율 지수 실시간 계산 UI
* **[Backend]** 프로세스 및 태그 업데이트 API(`routers/process.py`, `routers/bdw.py`), `services/metrics/bdw_service.py`

### Milestone 5: AI FIT 분석 및 TO-BE 설계 
* **[Frontend]** Step5 3탭: 인라인 분석 / 2x2 매트릭스 뷰 / As-Is vs To-Be 플로우차트 병렬 뷰
* **[Backend]** `services/ai/aifit_service.py` — AI 적용 가능성/비효율성 평가 점수 Mock 산출 및 저장, To-Be 매핑 API

### Milestone 6: 결과 리포트 및 지표 산출 
* **[Backend]** `services/metrics/fte_service.py` — 핵심 성과 지표(절감 시간 ÷ 2,248 = FTE), 외주 개발비, 토성비 산식 구현
* **[Backend]** `services/reports/*` — PPTX/DOCX/PDF 실제 생성 로직
* **[Frontend]** Step6 페이지: 리포트 섹션 토글, FTE 지표 패널, 다운로드(PPT/PDF/Word) 및 웹링크 공유 뷰

### Milestone 7 (백로그, v1 이후)
* ** 인증 및 권한 관리 (RBAC)** — 아래 Task 1.1~1.4 그대로 유지, v1 이후 착수
  * **[Backend]** Task 1.1: Bcrypt 기반 패스워드 암호화 및 회원가입 API 구현
  * **[Backend]** Task 1.2: JWT 기반 로그인/세션 발급 및 Role(관리자/컨설턴트/고객사) 검증 미들웨어 구현
  * **[Backend]** Task 1.3: 이메일 기반 1회용 JWT 패스워드 초기화(비밀번호 찾기) 링크 발송 API 구현
  * **[Frontend]** Task 1.4: 로그인, 비밀번호 찾기, 권한별 라우팅 및 접근 제어(Private Route) UI 구현
* 실제 다중 LLM API(Gemini/ChatGPT/Claude) 연동 및 프롬프트 체인 설계
* 프로젝트 CRUD의 Tenant Isolation(고객사 데이터 격리) — 인증 도입과 함께 적용

---

## 3. 코딩 에이전트 지시사항 (Prompting Instructions)

코딩 담당 에이전트는 본 지시서에 따라 개발을 진행해 주십시오.

1. **토큰 최적화 및 경량화:** 하네스 설계 방침에 따라 불필요한 코드 중복을 최소화하십시오. 공통적으로 사용되는 UI 컴포넌트(버튼, 모달 등)와 API 호출 유틸리티를 반드시 분리하여 모듈화하세요.
2. **플로우차트 렌더링 성능 확보:** `React Flow` 라이브러리를 사용할 때, 상태 변경에 따른 전체 리렌더링을 방지하기 위해 Memoization (`React.memo`, `useMemo`, `useCallback`)을 철저히 적용하십시오.
3. **데이터 조회 범위:** v1은 인증이 없으므로 `Tenant_ID` 필터링은 적용하지 않되, 모든 비즈니스 로직 쿼리는 `Project_ID`/`Task_ID` 기준으로 명확히 스코프를 제한하십시오. Phase 7에서 인증 도입 시 `Tenant_ID` 필터링을 추가하기 쉽도록 쿼리 계층을 서비스 함수로 분리해 두십시오.
4. **LLM 모듈 추상화 및 전처리:** 특정 LLM 모델에 강결합되지 않도록 인터페이스(Interface)를 추상화하고(v1은 Mock Provider 구현), LLM 호출 파이프라인의 최전단에 반드시 정규식 기반의 데이터 마스킹(Data Masking) 함수를 배치하십시오(v1은 통과 처리라도 자리 확보 필수).
5. **안정적인 상태 관리:** 6단계의 워크플로우(Phase 1~6) 상태 데이터를 전역으로 관리하고 양방향 동기화를 원활히 하기 위해, Zustand 전역 상태 관리 라이브러리를 사용하십시오.
6. **컴퓨터 개인설정 및 환경에 위험한 작업이 아닌 경우 및 일반적으로 코딩에 필요한 라이브러리 설치의 경우는 질문 없이 자율적으로 명령프롬프트를 실행하십시오.

