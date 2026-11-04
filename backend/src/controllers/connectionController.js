import { getSystemAiAvailability } from '../services/systemAiRunner.js';

/** 협력사는 더 이상 Key를 등록하지 않으며, 시스템 AI 풀 사용 가능 여부만 조회한다. */
export async function getConnections(_req, res) {
  try {
    const availability = await getSystemAiAvailability();
    res.json({
      system_managed: true,
      available: availability.available,
      active_count: availability.active_count,
      primary_provider: availability.primary_provider,
      message: availability.available
        ? '시스템 관리자가 등록한 AI API로 연결됩니다. 사용한도 초과 시 우선순위 다음 API로 자동 전환됩니다.'
        : '시스템 관리자가 AI API를 아직 등록하지 않았습니다. 관리자에게 문의해 주세요.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '시스템 AI API 상태를 확인할 수 없습니다.' });
  }
}

export async function saveConnection(_req, res) {
  res.status(410).json({
    error: '협력사별 AI API 등록은 종료되었습니다. 시스템 관리자가 AI API를 등록·관리합니다.'
  });
}

export async function deleteConnection(_req, res) {
  res.status(410).json({
    error: '협력사별 AI API 삭제는 지원하지 않습니다. 시스템 관리자 AI API 관리를 이용해 주세요.'
  });
}

export async function setDefaultConnection(_req, res) {
  res.status(410).json({
    error: '협력사 기본 AI 엔진 설정은 종료되었습니다. 시스템 AI API 우선순위를 사용합니다.'
  });
}
