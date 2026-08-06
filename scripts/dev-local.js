import { spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const children = [];
let stopping = false;

function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(stopChild);
  process.exit(exitCode);
}

function start(scriptName, label) {
  const args = isWindows ? ['/d', '/s', '/c', `npm run ${scriptName}`] : ['run', scriptName];
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`${label} 실행 실패: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (!stopping && code !== 0) {
      console.error(`${label}가 종료되었습니다. (exit ${code})`);
      shutdown(code || 1);
    }
  });
}

console.log('BPA Tool 로컬 테스트 환경을 시작합니다.');
console.log('- UI: http://localhost:3000');
console.log('- API 상태: http://localhost:5000/api/health');
console.log('- 종료: Ctrl+C\n');

start('dev:backend', '백엔드');
start('dev:frontend', '프런트엔드');

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => children.forEach(stopChild));
