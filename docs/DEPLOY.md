# Supabase + Vercel 배포 체크리스트

## 1. Supabase 준비

1. Supabase CLI 로그인 계정과 프로젝트 소유 계정이 같은지 확인합니다.
2. `supabase/config.toml`과 `supabase/migrations/`를 검토합니다.
3. `npx supabase db push --linked`로 마이그레이션을 적용합니다.
4. `admin-password-verify` Edge Function을 배포하고 Supabase Secrets에 `BPA_ADMIN_PASSWORD`를 등록합니다.
5. 직접 Postgres 연결이 필요하면 Direct URL 대신 Dashboard가 제공하는 Transaction pooler URL을 사용합니다.
   - 포트: `6543`
   - 사용자: `postgres.<PROJECT_REF>`
   - 호스트: `aws-0-<region>.pooler.supabase.com`

## 2. Vercel 환경변수

Production, Preview, Development 환경에 필요한 값을 각각 등록합니다.

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `BPA_CREDENTIAL_ENCRYPTION_KEY`

`SUPABASE_SECRET_KEY`, 레거시 Service Role Key, 암호화 키를 `VITE_` 변수나 Git 파일에 넣지 않습니다. 관리자 비밀번호는 Vercel이 아니라 Supabase Edge Function Secret으로 관리합니다.

## 3. Vercel 라우팅

- 정적 UI는 Vite가 `frontend/dist`로 빌드하며 Vercel `outputDirectory`가 CDN으로 제공합니다.
- Node API 진입점은 `api/index.js`입니다.
- `vercel.json`의 `functions`에는 `api/index.js`만 지정합니다.
- `/api/:path*`는 `api/index.js`로 rewrite합니다.
- Vercel Function에서는 `express.static`이나 로컬 JSON 파일 저장에 의존하지 않습니다.

## 4. 검증

로컬:

```bash
npm run doctor
npm run dev:local
curl http://localhost:5000/api/health
curl http://localhost:5000/api/auth/companies
```

배포:

```bash
npm run check:deployment -- https://your-app.vercel.app
```

다음 두 요청이 모두 성공해야 배포 연동이 완료된 것입니다.

- `/api/health`: `status=OK`, `db=supabase`, `data_api=true`
- `/api/auth/companies`: HTTP 200과 배열 응답

UI가 열리는 것만으로 배포 성공을 판정하지 않습니다.
