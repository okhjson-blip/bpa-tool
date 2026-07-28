# BPA Tool - 비즈니스 프로세스 분석 웹앱

AX 컨설팅을 위한 비즈니스 프로세스 분석(BPA) 플랫폼

## 기술 스택

### Backend
- Node.js + Express.js
- PostgreSQL
- JWT 인증
- Bcrypt 암호화

### Frontend
- React 18
- React Router v6
- Zustand (상태 관리)
- Tailwind CSS
- Vite (빌드 도구)

## 설치 및 실행

### 사전 요구사항
- Node.js 16+
- PostgreSQL 12+

### Backend 설정

```bash
cd backend
npm install
```

`.env` 파일 설정 (PostgreSQL 연결):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bpa_tool_db
DB_USER=postgres
DB_PASSWORD=your_password
```

서버 실행:
```bash
npm run dev  # 개발 모드 (nodemon 사용)
npm start    # 프로덕션 모드
```

### Frontend 설정

```bash
cd frontend
npm install
npm run dev  # http://localhost:3000에서 실행
```

## Phase 1: 인증 및 프로젝트 관리

### 구현된 기능

#### Backend API
- `POST /api/auth/signup` - 회원가입
- `POST /api/auth/login` - 로그인
- `POST /api/auth/request-password-reset` - 비밀번호 초기화 요청
- `POST /api/auth/reset-password` - 비밀번호 변경
- `POST /api/projects` - 프로젝트 생성
- `GET /api/projects` - 프로젝트 목록 조회
- `GET /api/projects/:id` - 프로젝트 상세 조회
- `PUT /api/projects/:id` - 프로젝트 수정
- `DELETE /api/projects/:id` - 프로젝트 삭제
- `POST /api/projects/:id/members` - 프로젝트 멤버 추가
- `GET /api/domains/project/:projectId` - 도메인 트리 조회
- `POST /api/domains/project/:projectId` - 도메인 추가
- `PUT /api/domains/:id` - 도메인 수정
- `DELETE /api/domains/:id` - 도메인 삭제

#### Frontend 페이지
- 로그인 페이지
- 회원가입 페이지
- 비밀번호 찾기 페이지
- 비밀번호 재설정 페이지
- 프로젝트 대시보드
- 새 프로젝트 생성 페이지
- 프로젝트 상세 페이지 (도메인 관리)

#### 보안 기능
- JWT 기반 인증
- Bcrypt 비밀번호 암호화
- Private Route (인증된 사용자만 접근)
- 권한 검증 미들웨어
- Tenant Isolation (고객사 데이터 격리)

## 다음 단계

다음 Phase로 진행하기 전에 확인이 필요합니다.

Phase 1이 완성되었습니다. 다음으로 진행하시겠습니까?

---

## 프로젝트 구조

```
bpa-tool/
├── backend/
│   ├── src/
│   │   ├── config/        # 데이터베이스 설정
│   │   ├── controllers/   # 비즈니스 로직
│   │   ├── middleware/    # 미들웨어
│   │   ├── routes/        # API 라우트
│   │   ├── utils/         # 유틸리티 함수
│   │   └── app.js         # Express 앱
│   ├── .env               # 환경 변수
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/    # React 컴포넌트
│   │   ├── pages/         # 페이지
│   │   ├── services/      # API 호출
│   │   ├── store/         # Zustand 스토어
│   │   ├── styles/        # CSS
│   │   ├── App.jsx        # 메인 앱
│   │   └── main.jsx       # 진입점
│   ├── .env
│   └── package.json
│
└── README.md
```

## 라이센스

내부 사용

## 문의

hjson@ax.samsung.com
