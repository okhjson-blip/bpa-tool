import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectsAPI, domainsAPI } from '../services/api';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomain, setNewDomain] = useState({ level: 'L2', name: '', parentId: null });
  const navigate = useNavigate();

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const [projectRes, domainsRes] = await Promise.all([
        projectsAPI.get(projectId),
        domainsAPI.getTree(projectId)
      ]);
      setProject(projectRes.data);
      setDomains(domainsRes.data);
    } catch (err) {
      setError('과제를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    try {
      await domainsAPI.add(projectId, newDomain);
      setNewDomain({ level: 'L2', name: '', parentId: null });
      setShowAddDomain(false);
      loadProject();
    } catch (err) {
      setError('도메인 추가에 실패했습니다');
    }
  };

  if (loading) {
    return <div className="text-center py-12">과제를 불러오는 중...</div>;
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">과제를 찾을 수 없습니다</p>
        <Link to="/projects" className="text-primary font-bold">
          과제 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate('/projects')}
            className="text-sm opacity-80 hover:opacity-100 mb-2"
          >
            ← 과제 목록
          </button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">L1 도메인</p>
            <p className="text-2xl font-bold text-primary">{project.l1_domain}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">총 도메인</p>
            <p className="text-2xl font-bold text-primary">{domains.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">AI 엔진</p>
            <p className="text-2xl font-bold text-primary capitalize">{project.ai_engine}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">업무 구조 (L1~L3)</h2>
            <button
              onClick={() => setShowAddDomain(!showAddDomain)}
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-opacity-90"
            >
              {showAddDomain ? '취소' : '+ 도메인 추가'}
            </button>
          </div>

          {showAddDomain && (
            <form onSubmit={handleAddDomain} className="bg-gray-50 p-4 rounded-lg mb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">레벨</label>
                  <select
                    value={newDomain.level}
                    onChange={(e) =>
                      setNewDomain({ ...newDomain, level: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="L2">L2 (기능)</option>
                    <option value="L3">L3 (프로세스)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">부모 도메인</label>
                  <select
                    value={newDomain.parentId || ''}
                    onChange={(e) =>
                      setNewDomain({
                        ...newDomain,
                        parentId: e.target.value ? parseInt(e.target.value) : null
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="">없음</option>
                    {domains
                      .filter(
                        (d) =>
                          d.level === 'L2' || (newDomain.level === 'L3' && d.level === 'L2')
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">이름</label>
                <input
                  type="text"
                  value={newDomain.name}
                  onChange={(e) => setNewDomain({ ...newDomain, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="도메인 이름"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-success text-white px-4 py-2 rounded hover:bg-opacity-90"
                >
                  추가
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDomain(false)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded"
                >
                  취소
                </button>
              </div>
            </form>
          )}

          {domains.length === 0 ? (
            <p className="text-gray-600 text-center py-8">도메인이 없습니다</p>
          ) : (
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              {domains.map((domain) => (
                <div
                  key={domain.id}
                  className="border-b border-gray-300 p-4 hover:bg-gray-50 flex items-center gap-4"
                  style={{ marginLeft: `${domain.level === 'L3' ? '24px' : '0'}` }}
                >
                  <div
                    className={`px-3 py-1 rounded text-xs font-bold text-white ${
                      domain.level === 'L1' || domain.level === 'L2'
                        ? 'bg-primary'
                        : 'bg-success'
                    }`}
                  >
                    {domain.level}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold">{domain.name}</p>
                    {domain.description && (
                      <p className="text-sm text-gray-600">{domain.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 flex gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}/step2`)}
            className="bg-primary text-white font-bold px-6 py-3 rounded-lg hover:bg-opacity-90"
          >
            다음 단계: 인터뷰 & AI Draft →
          </button>
          <button
            onClick={() => navigate('/projects')}
            className="bg-gray-300 text-gray-700 font-bold px-6 py-3 rounded-lg"
          >
            목록으로
          </button>
        </div>
      </main>
    </div>
  );
}
