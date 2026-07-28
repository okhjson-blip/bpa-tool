import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analysisAPI } from '../services/api';

const BDW_OPTIONS = [
  { value: 'normal', label: '✅ 정상' },
  { value: 'bottleneck', label: '🔴 Bottleneck' },
  { value: 'delay', label: '🟡 Delay' },
  { value: 'waste', label: '⚫ Waste' }
];

export default function BDWDiagnosisStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [diagnosis, setDiagnosis] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    loadDiagnosis();
  }, [projectId]);

  const loadDiagnosis = async () => {
    try {
      const response = await analysisAPI.getBDWDiagnosis(projectId);
      setProcesses(response.data.processes);
      setDiagnosis(response.data.diagnosis);
    } catch (err) {
      setError('BDW 진단 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleTagChange = async (processId, bdw_type) => {
    setSavingId(processId);
    setError('');
    try {
      await analysisAPI.tagBDW(processId, { bdw_type });
      await loadDiagnosis();
    } catch (err) {
      setError('BDW 태그 저장 실패');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="text-center py-12">분석 중...</div>;

  if (processes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary text-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Step 4: BDW 진단 (Bottleneck·Delay·Waste)</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">
              진단할 프로세스가 없습니다. 먼저 인터뷰 & AI Draft를 생성하세요
            </p>
            <button
              onClick={() => navigate(`/projects/${projectId}/step2`)}
              className="text-primary font-bold hover:underline"
            >
              ← Step 2로 이동
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Step 4: BDW 진단 (Bottleneck·Delay·Waste)</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">🔴 Bottleneck</p>
            <p className="text-3xl font-bold text-red-600">{diagnosis.bottleneck_count}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">🟡 Delay</p>
            <p className="text-3xl font-bold text-yellow-600">{diagnosis.delay_count}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">⚫ Waste</p>
            <p className="text-3xl font-bold text-gray-700">{diagnosis.waste_count}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">⏱ 비효율 지수</p>
            <p className="text-3xl font-bold text-primary">{Math.round(diagnosis.inefficiency_rate)}%</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">BDW 태그 부착</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left">레벨</th>
                  <th className="px-4 py-2 text-left">프로세스명</th>
                  <th className="px-4 py-2 text-left">시간(분)</th>
                  <th className="px-4 py-2 text-left">BDW 태그</th>
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
                    <td className="px-4 py-2">{proc.execution_time ?? '-'}</td>
                    <td className="px-4 py-2">
                      <select
                        value={proc.bdw_tag}
                        disabled={savingId === proc.id}
                        onChange={(e) => handleTagChange(proc.id, e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50"
                      >
                        {BDW_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => navigate(`/projects/${projectId}/step5`)}
              className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90"
            >
              다음: AI FIT 분석 →
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
