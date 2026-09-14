// 화면·CSV는 시간:분(12h:30s)으로 보이고, 저장과 계산은 분 단위 정수를 쓴다.
export function minutesToClock(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(total / 60)}h:${String(total % 60).padStart(2, '0')}s`;
}

export function hoursToClock(hours) {
  return minutesToClock(Math.round((Number(hours) || 0) * 60));
}

export function splitClock(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function parseClockToMinutes(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const labeled = text.match(/^(\d+)\s*h\s*:\s*(\d+)\s*s$/i);
  if (labeled) return Math.max(0, Number(labeled[1]) * 60 + Number(labeled[2]));
  const clock = text.match(/^(\d+)\s*:\s*(\d+)$/);
  if (clock) return Math.max(0, Number(clock[1]) * 60 + Number(clock[2]));
  const asNumber = Number(text);
  return Number.isFinite(asNumber) ? Math.max(0, Math.round(asNumber)) : 0;
}
