# 🔍 BPA Tool - 비즈니스 프로세스 분석 플랫폼

**Business Process Analysis Tool**

Samsung Electronics를 위한 비즈니스 프로세스 분석 및 AI 자동화 평가 웹 애플리케이션

---

## 📋 개요

BPA Tool은 기업의 업무 프로세스를 분석하고 AI를 활용한 자동화 가능성을 평가하는 플랫폼입니다. 
인터뷰를 통해 현재 프로세스를 수집하고, BDW 분석(Bottleneck/Delay/Waste), AI FIT 점수 산출, 
최종 보고서 생성까지 6단계의 완전한 BPA 워크플로우를 제공합니다.

### 주요 특징
- ✅ **인증 불필요** - 로그인 없이 즉시 사용 가능
- ✅ **초기 설정** - 회사명 및 AI API(ChatGPT/Gemini/Claude) 설정
- ✅ **6단계 분석 프로세스** - 인터뷰 → 프로세스 편집 → BDW 진단 → AI FIT 분석 → To-Be 설계 → 보고서
- ✅ **AI 기반 초안 생성** - 인터뷰 내용으로부터 프로세스 L4~L6 자동 생성
- ✅ **텍스트 기반 인터뷰** - 음성 녹음, 파일 업로드 불필요
- ✅ **자동화 효과 계산** - 자동화율, 절감 시간, FTE 절감량 자동 산출
- ✅ **로컬 배포 지원** - 단일 서버로 여러 팀 및 PC에 배포 가능

---

## 🛠️ 기술 스택

### Backend
- **Node.js** + **Express.js** - REST API 서버
- **SimpleDB** - JSON 파일 기반 데이터베이스 (PostgreSQL 불필요)
- **LLM Service** - ChatGPT, Gemini, Claude 통합 지원
- **Data Masking** - PII(개인정보) 자동 마스킹

### Frontend
- **React 18** - UI 라이브러리
- **React Router v6** - SPA 라우팅
- **Zustand** - 간단한 상태 관리 (인증 제거됨)
- **Tailwind CSS** - 유틸리티 CSS
- **Vite** - 빌드 도구
- **LocalStorage** - 회사명 및 API 토큰 저장

---

## 📦 설치 및 실행

### 사전 요구사항
- **Node.js** 16+ (npm 포함)
- **인터넷 연결** (AI API 호출용)

### 빠른 시작 (Windows)

#### 1. 저장소 클론
```bash
git clone -b initial-setup https://gitlab.com/okhjson/bpa-tool.git
cd bpa-tool
```

#### 2. 백엔드 설정 및 실행
```bash
cd backend
npm install
npm start
```
✅ 서버 시작: `http://localhost:5000`

#### 3. 프론트엔드 빌드 (별도 터미널)
```bash
cd frontend
npm install
npm run build
```

#### 4. 브라우저에서 접속
```
http://localhost:5000
```

### 개발 모드 실행

**백엔드 (자동 재시작)**
```bash
cd backend
npm install
npm run dev
```

**프론트엔드 (개발 서버)**
```bash
cd frontend
npm install
npm run dev
# http://localhost:3000에서 실행 (프록시: localhost:5000/api)
```

---

## 🎯 6단계 BPA 워크플로우

### Step 1️⃣: 초기 설정
- **회사명** 입력
- **AI 엔진** 선택 (ChatGPT / Gemini / Claude)
- **API 토큰** 입력
- LocalStorage에 자동 저장

### Step 2️⃣: 인터뷰 & AI Draft 생성
- 현재 프로세스를 **텍스트로 입력**
- AI가 자동으로 **L4~L6 프로세스** 생성
- 프로세스 목록 확인

### Step 3️⃣: 프로세스 편집
- 생성된 프로세스 **검토 및 수정**
- 작업 시간(분), 작업 방식, 도구 입력
- 통계 자동 계산

### Step 4️⃣: BDW 진단
- **Bottleneck** (병목) 지점 태깅
- **Delay** (지연) 지점 태깅
- **Waste** (낭비) 지점 태깅
- 비효율성 지수 자동 계산

### Step 5️⃣: AI FIT 분석
- 각 프로세스의 **자동화 가능성** 평가 (1~5점)
- **비효율성** 지수 반영
- **FIT 점수** 산출 및 **카테고리 분류** (A/B/C/D)
- 자동화 추천 기술 제시

### Step 6️⃣: 최종 리포트
- **핵심 성과** 지표
  - **자동화율**: (A영역 프로세스 수 / 전체 프로세스 수) × 100
  - **절감 효과**: (절감 시간 × 52주 / 2248시간/년) = FTE 절감
- 분석 결과 요약
- 기대 효과 제시

---

## 🗂️ 프로젝트 구조

```
bpa-tool/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # SimpleDB (JSON 파일 기반)
│   │   ├── controllers/
│   │   │   ├── projectController.js # 과제 CRUD
│   │   │   ├── interviewController.js # 인터뷰 & AI 분석
│   │   │   ├── bdwController.js     # BDW & FIT 분석
│   │   │   └── domainController.js  # 도메인 관리
│   │   ├── middleware/
│   │   │   ├── errorHandler.js
│   │   │   └── dataMasking.js       # PII 마스킹
│   │   ├── routes/
│   │   │   ├── projects.js
│   │   │   ├── domains.js
│   │   │   ├── interviews.js
│   │   │   └── analysis.js
│   │   ├── services/
│   │   │   └── llmService.js        # LLM 통합
│   │   └── app.js                   # Express 앱
│   ├── data/
│   │   └── db.json                  # SimpleDB 데이터 파일
│   ├── .env
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── SetupPage.jsx         # 초기 설정 (회사명 + AI API)
│   │   │   ├── ProjectDashboard.jsx  # 과제 목록
│   │   │   ├── NewProject.jsx        # 새 과제 생성
│   │   │   ├── ProjectDetail.jsx     # 과제 상세정보
│   │   │   ├── InterviewStep.jsx     # Step 2: 인터뷰 & AI Draft
│   │   │   ├── ProcessEditStep.jsx   # Step 3: 프로세스 편집
│   │   │   ├── BDWDiagnosisStep.jsx  # Step 4: BDW 진단
│   │   │   ├── AIFitAnalysisStep.jsx # Step 5: AI FIT 분석
│   │   │   └── FinalReportStep.jsx   # Step 6: 최종 리포트
│   │   ├── services/
│   │   │   └── api.js               # Axios API 클라이언트
│   │   ├── store/
│   │   │   └── authStore.js         # Zustand (현재 미사용)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── .gitignore
├── .claude/
│   └── launch.json
└── README.md
```

---

## 🔌 API 엔드포인트

### 프로젝트 API
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/projects` | 새 과제 생성 |
| GET | `/api/projects` | 과제 목록 조회 |
| GET | `/api/projects/:id` | 과제 상세 조회 |
| PUT | `/api/projects/:id` | 과제 수정 |
| DELETE | `/api/projects/:id` | 과제 삭제 |

### 인터뷰 & 프로세스 API
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/interviews/project/:projectId` | 인터뷰 저장 |
| GET | `/api/interviews/project/:projectId` | 저장된 인터뷰 목록 |
| POST | `/api/interviews/:interviewId/analyze` | AI Draft 생성 |
| GET | `/api/interviews/project/:projectId/processes` | 생성된 프로세스 목록 |
| PUT | `/api/interviews/process/:processId` | 프로세스 수정 |

### 분석 API
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/analysis/bdw/:projectId` | BDW 태깅 |
| GET | `/api/analysis/bdw/:projectId` | BDW 진단 결과 |
| POST | `/api/analysis/ai-fit/:projectId` | AI FIT 분석 |
| POST | `/api/analysis/to-be/:projectId` | To-Be 프로세스 생성 |
| GET | `/api/analysis/report/:projectId` | 최종 리포트 생성 |

### 도메인 API
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/domains/project/:projectId` | 도메인 트리 조회 |
| POST | `/api/domains/project/:projectId` | 도메인 추가 |
| PUT | `/api/domains/:id` | 도메인 수정 |
| DELETE | `/api/domains/:id` | 도메인 삭제 |

---

## 🔐 보안 및 데이터 관리

### 데이터 저장소
- **SimpleDB**: JSON 파일 기반 (PostgreSQL 불필요)
- **파일 경로**: `backend/data/db.json`
- **자동 저장**: 모든 변경사항은 자동으로 db.json에 저장됨

### PII 자동 마스킹
- 이메일: `e***@domain.com`
- 전화번호: `###-****-####`
- 주민번호: `###-##-####`
- 회사명: 맞춤 마스킹 패턴 적용

### API 토큰 관리
- **저장 위치**: 브라우저 LocalStorage
- **저장 항목**: 
  - `company_name`: 회사명
  - `ai_engine`: AI 엔진 선택 (chatgpt/gemini/claude)
  - `ai_token`: API 토큰 (암호화 권장)

---

## 📊 주요 계산 공식

### 자동화율 (Automation Rate)
```
자동화율(%) = (A영역 프로세스 수 / 전체 프로세스 수) × 100
```

### 절감 효과 (Time Savings)
```
연간 FTE 절감 = (절감 시간 × 52주) / 2248시간/년
```

### BDW 비효율성 지수
```
비효율성율(%) = (병목시간 + 지연시간) / 총실행시간 × 100
```

### AI FIT 점수
```
FIT 점수 = (AI자동화가능성 1~5 × 비효율성지수 1~5) / 25

분류:
- A: 양쪽 모두 2.5 이상 (즉시 추진)
- B: 비효율성 높음, AI 가능성 낮음
- C: AI 가능성 높음, 비효율성 낮음
- D: 양쪽 모두 낮음 (미추진)
```

---

## 🚀 배포 및 운영

### 로컬 Windows 서버 배포

#### 1. 서버 구성
```
서버 PC: Windows 10/11 Enterprise
프로그램: Node.js 16+, npm
포트: 5000 (HTTP)
```

#### 2. 자동 시작 설정 (PM2 사용)
```bash
npm install -g pm2

# 백엔드 서버 등록
cd backend
pm2 start src/app.js --name "bpa-tool-backend"

# 시작 시 자동 실행
pm2 startup
pm2 save
```

#### 3. 다른 PC에서 접속
```
http://<서버IP>:5000
```

---

## 📝 사용 예시

### 새로운 분석 프로젝트 시작

1. **초기 설정 (SetupPage)**
   ```
   회사명: Samsung Electronics
   AI 엔진: ChatGPT
   API 토큰: sk-proj-xxx...
   ```

2. **프로젝트 생성 (NewProject)**
   ```
   과제명: 고객 서비스 자동화
   L1 도메인: CS 팀
   분석 기간: 2026-08-01 ~ 2026-08-31
   ```

3. **인터뷰 입력 (InterviewStep)**
   ```
   "고객이 질문한 사항에 대해 담당자가 메일로 응답합니다. 
    평균 응답 시간은 2-3시간이며, 반복되는 문의(배송 상태, 반품 방법 등)는 
    AI 챗봇으로 자동 응답할 수 있습니다."
   ```

4. **최종 리포트 확인**
   ```
   자동화율: 68%
   연간 절감: 0.03 FTE
   기대 효과: 연간 약 67시간 절감
   ```

---

## 🐛 문제 해결

### 포트 5000이 이미 사용 중인 경우
```bash
# 포트 5000 사용 중인 프로세스 확인
netstat -ano | findstr :5000

# PID로 프로세스 종료
taskkill /PID <PID> /F

# 또는 .env에서 포트 변경
PORT=8080
```

### API 토큰 오류
- 토큰이 만료되었거나 유효하지 않은 경우
- SetupPage로 돌아가서 새 토큰 입력

### 데이터가 저장되지 않음
- `backend/data/` 디렉토리 권한 확인
- db.json 파일 쓰기 권한 확인

---

## 📋 라이센스

내부 사용 (Samsung Electronics)

---

## 👥 기여 및 문의

**개발자**: hjson@samsung.com  
**GitLab Repository**: https://gitlab.com/okhjson/bpa-tool.git  
**Branch**: `initial-setup` (현재 활성 브랜치)

---

## 📅 버전 히스토리

### v2.0.0 (2026-07-28)
✅ 완전 리팩토링
- 로그인/인증 제거
- SetupPage 추가 (회사명 + AI API)
- 텍스트 기반 인터뷰로 단순화
- 다운로드 기능 제거
- 계산식 주석 추가

### v1.0.0 (2026-07-01)
- 초기 6단계 BPA 워크플로우 구현
- JWT 기반 인증
- PostgreSQL 연동
- 전체 분석 기능 완성
