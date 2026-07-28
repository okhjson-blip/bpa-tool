import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { interviewsAPI } from '../services/api';

export default function ProcessEditStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadProcesses();
  }, [projectId]);

  const loadProcesses = async () => {
    try {
      const response = await interviewsAPI.getProcesses(projectId);
      setProcesses(response.data);
    } catch (err) {
      setError('프로세스 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (processId, updates) => {
    try {
      await interviewsAPI.updateProcess(processId, updates);
      loadProcesses();
      setEditingId(null);
    } catch (err) {
      setError('업데이트 실패');
    }
  };

  const totalTime = processes.reduce((sum, p) => sum + (p.execution_time || 0), 0);

  if (loading) return <div className="text-center py-12">로드 중...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Step 3: 프로세스 수정 & 동기화</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && <div className="bg-red-100 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">총 프로세스</p>
            <p className="text-3xl font-bold text-primary">{processes.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">총 수행시간</p>
            <p className="text-3xl font-bold text-primary">{totalTime}분</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">평균 시간</p>
            <p className="text-3xl font-bold text-primary">
              {processes.length > 0 ? Math.round(totalTime / processes.length) : 0}분
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">프로세스 테이블</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">레벨</th>
                  <th className="px-4 py-2 text-left">프로세스명</th>
                  <th className="px-4 py-2 text-left">작업방식</th>
                  <th className="px-4 py-2 text-left">도구</th>
                  <th className="px-4 py-2 text-left">시간(분)</th>
                  <th className="px-4 py-2 text-left">상태</th>
                  <th className="px-4 py-2 text-left">작업</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((proc) => (
                  <tr key={proc.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-bold">
                      <span className="bg-primary text-white px-2 py-1 rounded text-xs">
                        {proc.level}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-bold">{proc.name}</td>
                    <td className="px-4 py-2">{proc.method || '-'}</td>
                    <td className="px-4 py-2">{proc.tool || '-'}</td>
                    <td className="px-4 py-2">{proc.execution_time || '-'}</td>
                    <td className="px-4 py-2">
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                        {proc.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setEditingId(proc.id)}
                        className="text-primary hover:underline text-sm"
                      >
                        편집
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => navigate(`/projects/${projectId}/step4`)}
              className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90"
            >
              다음: BDW 진단 →
            </button>
            <button
              onClick={() => navigate(`/projects/${projectId}`)}
              className="bg-gray-300 text-gray-700 font-bold px-6 py-2 rounded-lg"
            >
              돌아가기
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
