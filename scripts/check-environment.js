import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const failures = [];
const notes = [];

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 18) failures.push(`Node.js 18 이상이 필요합니다. 현재: ${process.version}`);
else notes.push(`Node.js ${process.version}`);

const envPath = path.join(projectRoot, '.env');
if (!fs.existsSync(envPath)) {
  failures.push('.env 파일이 없습니다. .env.example을 참고해 생성하세요.');
} else {
  const fileEnv = Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
  const env = { ...fileEnv, ...process.env };
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'BPA_CREDENTIAL_ENCRYPTION_KEY'
  ]) {
    if (!env[key] || /your-|placeholder|replace-with|change-this/i.test(env[key])) failures.push(`.env의 ${key} 값이 필요합니다.`);
  }
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || /your-|placeholder|replace-with|change-this/i.test(secretKey)) {
    failures.push('.env의 SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 값이 필요합니다.');
  } else {
    notes.push(`서버 비밀키 별칭: ${env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'}`);
  }
  if (env.SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.SUPABASE_URL)) {
    failures.push('SUPABASE_URL 형식이 올바르지 않습니다.');
  }
  if (env.BPA_CREDENTIAL_ENCRYPTION_KEY && env.BPA_CREDENTIAL_ENCRYPTION_KEY.length < 32) {
    failures.push('BPA_CREDENTIAL_ENCRYPTION_KEY는 32자 이상이어야 합니다.');
  }
  if (!failures.some((message) => message.includes('.env'))) notes.push('Supabase 환경 변수 형식 확인');
}

for (const requiredPath of [
  'index.html',
  'backend/src/app.js',
  'node_modules/vite/package.json',
  'node_modules/@supabase/supabase-js/package.json'
]) {
  if (!fs.existsSync(path.join(projectRoot, requiredPath))) failures.push(`필수 파일 또는 의존성이 없습니다: ${requiredPath}`);
}

if (failures.length) {
  console.error('환경 점검 실패');
  failures.forEach((message) => console.error(`- ${message}`));
  console.error('\n의존성이 없다면 npm install을 실행하세요.');
  process.exit(1);
}

console.log('환경 점검 완료');
notes.forEach((message) => console.log(`- ${message}`));
console.log('- UI: http://localhost:3000');
console.log('- API 상태: http://localhost:5000/api/health');
console.log('- 외부 AI API Key는 로그인 후 상단 AI API 관리에서 등록하세요.');
