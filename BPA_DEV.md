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

`file://`로 루트 `index.html`을 직접 실행하는 경우 API 기준 주소는 `http://localhost:5000/api`입니다. HTTP/Vite/Express를 통해 실행하는 경우에는 동일 출처 상대 경로 `/api`를 사용합니다.

## 2. 실행 연결

Vite의 `root`는 저장소 루트이며 `index.html`을 읽습니다. 빌드 결과는 `frontend/dist`에 생성됩니다. Express는 `/api/*`를 먼저 처리하고 나머지 요청에 `frontend/dist/index.html`을 반환합니다.

```text
개발: index.html → Vite :3000 → /api 프록시 → Express :5000
운영: Vercel CDN(index.html) → /api/* → Express Function → Supabase
```

## 3. 업무 모델

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

## 5. 핵심 계산식

```text
비효율 지수 = 비효율 시간 / 전체 시간 × 100
자동화율 = A영역 L6 수 / 전체 L6 수 × 100
연간 절감시간 = 건당 절감시간 × 연간 수행 횟수
절감 FTE = 연간 절감시간(h) / 2,248h
외주 개발비 = A영역 수 × 1.0 M/M × 8,321,500원
```

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
