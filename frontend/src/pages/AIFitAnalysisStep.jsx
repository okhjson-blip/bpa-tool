import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analysisAPI, interviewsAPI } from '../services/api';

export default function AIFitAnalysisStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('inline');
  const [loading, setLoading] = useState(true);
  const [proceeding, setProceeding] = useState(false);
  const [error, setError] = useState('');
  const [asIsTotal, setAsIsTotal] = useState(0);

  useEffect(() => {
    runAnalysis();
  }, [projectId]);

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const [analysisRes, processesRes] = await Promise.all([
        analysisAPI.analyzeAIFit(projectId),
        interviewsAPI.getProcesses(projectId)
      ]);
      setAnalysis(analysisRes.data.analysis);
      setSummary(analysisRes.data.summary);
      const total = processesRes.data.reduce((sum, p) => sum + (p.execution_time || 0), 0);
      setAsIsTotal(total);
    } catch (err) {
      setError(err.response?.data?.error || 'AI FIT 분석 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = async () => {
    setProceeding(true);
    setError('');
    try {
      await analysisAPI.createToBe(projectId, { ai_analysis: analysis });
      navigate(`/projects/${projectId}/step6`);
    } catch (err) {
      setError(err.response?.data?.error || 'To-Be 생성 실패');
    } finally {
      setProceeding(false);
    }
  };

  if (loading) return <div className="text-center py-12">AI FIT 분석 중...</div>;

  if (error && analysis.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary text-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Step 5: AI FIT 분석</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600 mb-4">{error}</p>
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

  const categoryA = analysis.filter((a) => a.fit_category === 'A');
  const categoryB = analysis.filter((a) => a.fit_category === 'B');
  const categoryC = analysis.filter((a) => a.fit_category === 'C');
  const categoryD = analysis.filter((a) => a.fit_category === 'D');
  const totalSavings = summary?.estimated_total_time_savings ?? 0;
  const toBeTotal = Math.max(0, asIsTotal - totalSavings);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Step 5: AI FIT 분석</h1>
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
            <p className="text-gray-600 text-sm">전체 프로세스</p>
            <p className="text-3xl font-bold text-primary">{analysis.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">A영역 (즉시 적용)</p>
            <p className="text-3xl font-bold text-green-600">{categoryA.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">자동화율</p>
            <p className="text-3xl font-bold text-blue-600">{summary?.automation_rate ?? 0}%</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">절감 시간</p>
            <p className="text-3xl font-bold text-red-600">{totalSavings}분</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">AI FIT 스코어</h2>
          <div className="flex gap-4 mb-6">
            {['inline', 'matrix', 'comparison'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  activeTab === tab
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {tab === 'inline' && '📋 인라인 분석'}
                {tab === 'matrix' && '📊 매트릭스'}
                {tab === 'comparison' && '🔄 As-Is vs To-Be'}
              </button>
            ))}
          </div>

          {activeTab === 'inline' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-2 text-left">프로세스명</th>
                    <th className="px-4 py-2 text-left">AI 가능성</th>
                    <th className="px-4 py-2 text-left">비효율성</th>
                    <th className="px-4 py-2 text-left">분류</th>
                    <th className="px-4 py-2 text-left">추천 기술</th>
                    <th className="px-4 py-2 text-left">절감(분)</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.map((proc) => (
                    <tr key={proc.process_id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-bold">{proc.name}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center">
                          <span className="bg-green-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                            {proc.ai_possibility}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center">
                          <span className="bg-orange-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                            {proc.inefficiency}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="bg-green-100 text-green-800 px-3 py-1 rounded font-bold text-sm">
                          {proc.fit_category}
                        </span>
                      </td>
                      <td className="px-4 py-2">{proc.recommended_tech}</td>
                      <td className="px-4 py-2 font-bold">{proc.estimated_time_savings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'matrix' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="border-2 border-orange-500 rounded-lg p-4 bg-orange-50">
                <h3 className="font-bold text-lg mb-2">🟠 B: 수동 개선 先</h3>
                <p className="text-sm text-gray-700 mb-2">AI 가능성↓ + 비효율↑</p>
                {categoryB.map((a) => (
                  <p key={a.process_id} className="text-sm mt-1">• {a.name}</p>
                ))}
              </div>
              <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
                <h3 className="font-bold text-lg mb-2">🟢 A: 즉시 적용</h3>
                <p className="text-sm text-gray-700 mb-2">AI 가능성↑ + 비효율↑</p>
                {categoryA.map((a) => (
                  <p key={a.process_id} className="text-sm mt-1">• {a.name}</p>
                ))}
              </div>
              <div className="border-2 border-gray-400 rounded-lg p-4 bg-gray-50">
                <h3 className="font-bold text-lg mb-2">⚫ D: 현상 유지</h3>
                <p className="text-sm text-gray-700 mb-2">AI 가능성↓ + 비효율↓</p>
                {categoryD.map((a) => (
                  <p key={a.process_id} className="text-sm mt-1">• {a.name}</p>
                ))}
              </div>
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
                <h3 className="font-bold text-lg mb-2">🔵 C: 장기 검토</h3>
                <p className="text-sm text-gray-700 mb-2">AI 가능성↑ + 비효율↓</p>
                {categoryC.map((a) => (
                  <p key={a.process_id} className="text-sm mt-1">• {a.name}</p>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="border border-red-300 rounded-lg p-4">
                <h3 className="font-bold text-lg text-red-600 mb-4">현재 (As-Is)</h3>
                <p className="text-sm">• 수작업 위주</p>
                <p className="text-sm">• 총 {asIsTotal}분 소요</p>
              </div>
              <div className="border border-green-300 rounded-lg p-4">
                <h3 className="font-bold text-lg text-green-600 mb-4">개선 후 (To-Be)</h3>
                <p className="text-sm">• AI 자동화 적용 ({categoryA.length}개 프로세스)</p>
                <p className="text-sm">• 총 {toBeTotal}분 소요 (↓{totalSavings}분)</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleProceed}
              disabled={proceeding}
              className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-50"
            >
              {proceeding ? '생성 중...' : '다음: 결과 리포트 →'}
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
