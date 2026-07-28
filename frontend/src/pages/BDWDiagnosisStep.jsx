import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function BDWDiagnosisStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [diagnosis, setDiagnosis] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDiagnosis = async () => {
      try {
        // 모의 데이터
        setDiagnosis({
          bottleneck_count: 1,
          delay_count: 1,
          waste_count: 0,
          total_execution_time: 88,
          inefficient_time: 23,
          inefficiency_rate: 26
        });
        setProcesses([
          {
            id: 1,
            level: 'L6',
            name: '검토 요청 메일 발송',
            execution_time: 3,
            bdw_tag: 'delay'
          },
          {
            id: 2,
            level: 'L6',
            name: '수정사항 반영',
            execution_time: 20,
            bdw_tag: 'bottleneck'
          },
          {
            id: 3,
            level: 'L6',
            name: '초안 작성',
            execution_time: 30,
            bdw_tag: 'normal'
          }
        ]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiagnosis();
  }, [projectId]);

  if (loading) return <div className="text-center py-12">분석 중...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Step 4: BDW 진단 (Bottleneck·Delay·Waste)</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
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
                    <td className="px-4 py-2">{proc.execution_time}</td>
                    <td className="px-4 py-2">
                      {proc.bdw_tag === 'bottleneck' && (
                        <span className="bg-red-100 text-red-800 px-3 py-1 rounded text-sm font-bold">
                          🔴 Bottleneck
                        </span>
                      )}
                      {proc.bdw_tag === 'delay' && (
                        <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded text-sm font-bold">
                          🟡 Delay
                        </span>
                      )}
                      {proc.bdw_tag === 'normal' && (
                        <span className="bg-green-100 text-green-800 px-3 py-1 rounded text-sm font-bold">
                          ✅ 정상
                        </span>
                      )}
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
