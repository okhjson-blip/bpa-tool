import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analysisAPI } from '../services/api';

export default function FinalReportStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReport();
  }, [projectId]);

  const loadReport = async () => {
    try {
      const response = await analysisAPI.generateReport(projectId);
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.error || '리포트 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-12">리포트 생성 중...</div>;

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary text-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold">Step 6: 최종 리포트</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600 mb-4">{error || '리포트를 불러올 수 없습니다'}</p>
            <button
              onClick={() => navigate(`/projects/${projectId}`)}
              className="text-primary font-bold hover:underline"
            >
              ← 과제 상세로 이동
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
          <h1 className="text-2xl font-bold">Step 6: 최종 리포트</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">현재 소요시간</p>
            <p className="text-3xl font-bold text-red-600">{report.statistics.as_is_total_time}분</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">개선 후 시간</p>
            <p className="text-3xl font-bold text-green-600">{report.statistics.to_be_total_time}분</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">절감 시간</p>
            <p className="text-3xl font-bold text-blue-600">{report.statistics.time_savings}분</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">연간 FTE</p>
            <p className="text-3xl font-bold text-purple-600">{report.statistics.fte_equivalent}명</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">핵심 성과</h2>
          <div className="space-y-3">
            <div className="bg-blue-50 p-4 rounded">
              <p className="font-bold text-sm">자동화율</p>
              <p className="text-2xl font-bold text-blue-600">{report.statistics.automation_rate}%</p>
              <p className="text-xs text-gray-600 mt-1">
                계산식: (A영역 프로세스 수 / 전체 프로세스 수) × 100
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="font-bold text-sm">절감 효과</p>
              <p className="text-lg font-bold text-green-600">
                연간 {report.statistics.fte_equivalent} FTE 절감
              </p>
              <p className="text-xs text-gray-600 mt-1">
                계산식: (절감 시간(분) × 52주 ÷ 60분 ÷ 2248시간/년) — 주 1회 반복 업무 기준
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded">
              <p className="font-bold text-sm">BDW 이슈</p>
              <p className="text-sm text-gray-700">
                Bottleneck {report.bdw_diagnosis.bottlenecks}개, Delay {report.bdw_diagnosis.delays}개,
                Waste {report.bdw_diagnosis.wastes}개
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">분석 요약</h2>
          <div className="space-y-4 text-gray-700">
            <p>
              <span className="font-bold">과제:</span> {report.project_name}
            </p>
            <p>
              <span className="font-bold">분석 기간:</span> {report.analysis_period || '-'}
            </p>
            <p>
              <span className="font-bold">분석 결과:</span> 총 {report.statistics.total_processes}개
              프로세스 중{' '}
              {Math.round((report.statistics.automation_rate / 100) * report.statistics.total_processes)}개(
              {report.statistics.automation_rate}%)를 AI로 자동화 가능합니다.
            </p>
            <p>
              <span className="font-bold">기대 효과:</span> 연간{' '}
              {report.statistics.fte_equivalent}명의 인력을 다른 고부가가치 업무로 배치 가능합니다.
            </p>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => navigate('/projects')}
              className="flex-1 bg-primary text-white font-bold px-6 py-3 rounded-lg hover:bg-opacity-90"
            >
              ✓ 분석 완료 & 과제 목록
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
