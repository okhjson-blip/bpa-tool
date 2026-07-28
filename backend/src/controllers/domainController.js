import { db } from '../config/database.js';

export const getDomainTree = async (req, res) => {
  const { projectId } = req.params;

  try {
    const domains = db
      .select('domains', { project_id: parseInt(projectId) })
      .sort((a, b) => (a.level + a.sort_order).localeCompare(b.level + b.sort_order));

    res.json(domains);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '도메인 조회 중 오류가 발생했습니다' });
  }
};

export const addDomain = async (req, res) => {
  const { projectId } = req.params;
  const { parentId, level, name, description } = req.body;

  try {
    // 부모 도메인 존재 여부 확인
    if (parentId) {
      const parent = db.selectOne('domains', {
        id: parseInt(parentId),
        project_id: parseInt(projectId)
      });
      if (!parent) {
        return res.status(404).json({ error: '부모 도메인을 찾을 수 없습니다' });
      }
    }

    // 최대 sort_order 조회
    const projectDomains = db.select('domains', { project_id: parseInt(projectId) });
    const sameLevelDomains = projectDomains.filter((d) => d.level === level);
    const maxSort =
      sameLevelDomains.length > 0 ? Math.max(...sameLevelDomains.map((d) => d.sort_order)) : -1;

    const domain = db.insert('domains', {
      project_id: parseInt(projectId),
      parent_id: parentId ? parseInt(parentId) : null,
      level,
      name,
      description,
      sort_order: maxSort + 1
    });

    res.status(201).json({
      message: '도메인이 추가되었습니다',
      domain
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '도메인 추가 중 오류가 발생했습니다' });
  }
};

export const updateDomain = async (req, res) => {
  const { domainId } = req.params;
  const { name, description } = req.body;

  try {
    const domain = db.selectOne('domains', { id: parseInt(domainId) });

    if (!domain) {
      return res.status(404).json({ error: '도메인을 찾을 수 없습니다' });
    }

    const updated = db.update('domains', parseInt(domainId), { name, description });

    res.json({
      message: '도메인이 업데이트되었습니다',
      domain: updated
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '도메인 업데이트 중 오류가 발생했습니다' });
  }
};

export const deleteDomain = async (req, res) => {
  const { domainId } = req.params;

  try {
    db.delete('domains', parseInt(domainId));

    res.json({ message: '도메인이 삭제되었습니다' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '도메인 삭제 중 오류가 발생했습니다' });
  }
};
