import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function AIFitAnalysisStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState([]);
  const [activeTab, setActiveTab] = useState('inline');

  useEffect(() => {
    // 모의 데이터
    setAnalysis([
      {
        id: 1,
        name: '트렌드 키워드 검색',
        ai_possibility: 5,
        inefficiency: 4,
        fit_category: 'A',
        recommended_tech: 'LLM (웹검색)',
        time_savings: 8
      },
      {
        id: 2,
        name: '초안 작성',
        ai_possibility: 5,
        inefficiency: 5,
        fit_category: 'A',
        recommended_tech: 'LLM (생성AI)',
        time_savings: 25
      },
      {
        id: 3,
        name: '검토 요청 발송',
        ai_possibility: 5,
        inefficiency: 5,
        fit_category: 'A',
        recommended_tech: 'RPA',
        time_savings: 3
      },
      {
        id: 4,
        name: '수정사항 반영',
        ai_possibility: 3,
        inefficiency: 4,
        fit_category: 'A',
        recommended_tech: 'LLM (협업편집)',
        time_savings: 12
      }
    ]);
  }, []);

  const categoryA = analysis.filter((a) => a.fit_category === 'A');
  const totalSavings = analysis.reduce((sum, a) => sum + a.time_savings, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Step 5: AI FIT 분석</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
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
            <p className="text-3xl font-bold text-blue-600">
              {Math.round((categoryA.length / analysis.length) * 100)}%
            </p>
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
                    <tr key={proc.id} className="border-b hover:bg-gray-50">
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
                      <td className="px-4 py-2 font-bold">{proc.time_savings}</td>
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
                <p className="text-sm text-gray-700">AI 가능성↓ + 비효율↑</p>
              </div>
              <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
                <h3 className="font-bold text-lg mb-2">🟢 A: 즉시 적용</h3>
                <p className="text-sm text-gray-700">AI 가능성↑ + 비효율↑</p>
                {categoryA.map((a) => (
                  <p key={a.id} className="text-sm mt-1">• {a.name}</p>
                ))}
              </div>
              <div className="border-2 border-gray-400 rounded-lg p-4 bg-gray-50">
                <h3 className="font-bold text-lg mb-2">⚫ D: 현상 유지</h3>
                <p className="text-sm text-gray-700">AI 가능성↓ + 비효율↓</p>
              </div>
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
                <h3 className="font-bold text-lg mb-2">🔵 C: 장기 검토</h3>
                <p className="text-sm text-gray-700">AI 가능성↑ + 비효율↓</p>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="grid grid-cols-2 gap-6">
              <div className="border border-red-300 rounded-lg p-4">
                <h3 className="font-bold text-lg text-red-600 mb-4">현재 (As-Is)</h3>
                <p className="text-sm">• 수작업 위주</p>
                <p className="text-sm">• 총 88분 소요</p>
                <p className="text-sm">• 승인 대기 24h</p>
              </div>
              <div className="border border-green-300 rounded-lg p-4">
                <h3 className="font-bold text-lg text-green-600 mb-4">개선 후 (To-Be)</h3>
                <p className="text-sm">• AI 자동화 적용</p>
                <p className="text-sm">• 총 28분 소요 (↓60분)</p>
                <p className="text-sm">• 승인 대기 2시간</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => navigate(`/projects/${projectId}/step6`)}
              className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90"
            >
              다음: 결과 리포트 →
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
