export const STATIK_LEVEL_LABELS = Object.freeze({
  L1: 'L1 구분',
  L2: 'L2 대분류',
  L3: 'L3 중분류',
  L4: 'L4 모듈',
  L5: 'L5 단위',
  L6: 'L6 Act'
});

export function statikLevelLabel(level) {
  return STATIK_LEVEL_LABELS[level] || level;
}
