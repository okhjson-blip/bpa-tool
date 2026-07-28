import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function FinalReportStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [reportTitle, setReportTitle] = useState('마케팅 SNS 운영 AX 분석 결과');
  const [downloadFormat, setDownloadFormat] = useState(null);

  // 모의 리포트 데이터
  const report = {
    project_name: '디지털마케팅 콘텐츠 제작 프로세스',
    analysis_period: '2026-07-01 ~ 2026-07-31',
    statistics: {
      total_processes: 8,
      as_is_total_time: 88,
      to_be_total_time: 28,
      time_savings: 60,
      automation_rate: 68,
      fte_equivalent: '0.03'
    },
    bdw_diagnosis: {
      bottlenecks: 1,
      delays: 1,
      wastes: 0
    }
  };

  const handleDownload = (format) => {
    alert(`${format} 형식으로 다운로드 준비 중입니다...`);
    setDownloadFormat(null);
  };

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

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">리포트 구성</h2>
            <div className="space-y-3">
              {[
                '✓ STATIK 업무 구조 (L1~L3)',
                '✓ As-Is 프로세스 분석',
                '✓ BDW 진단 결과',
                '✓ AI FIT 분석',
                '✓ To-Be 재설계',
                '✓ AX 성과 지표 (FTE)'
              ].map((item, i) => (
                <p key={i} className="text-gray-700">
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">핵심 성과</h2>
            <div className="space-y-3">
              <div className="bg-blue-50 p-3 rounded">
                <p className="font-bold text-sm">자동화율</p>
                {/* 자동화율 계산식: (A영역 프로세스 수 / 전체 프로세스 수) × 100 */}
                <p className="text-2xl font-bold text-blue-600">{report.statistics.automation_rate}%</p>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <p className="font-bold text-sm">절감 효과</p>
                {/* 절감 효과 계산식: (절감 시간 × 52주 / 2248시간/년) = FTE 절감 */}
                <p className="text-lg font-bold text-green-600">
                  연간 {Math.round((report.statistics.time_savings * 52) / 2248)} FTE 절감
                </p>
              </div>
              <div className="bg-orange-50 p-3 rounded">
                <p className="font-bold text-sm">BDW 이슈</p>
                <p className="text-sm text-gray-700">
                  Bottleneck {report.bdw_diagnosis.bottlenecks}개, Delay {report.bdw_diagnosis.delays}개
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">리포트 설정</h2>
          <div className="mb-4">
            <label className="block text-sm font-bold mb-2">리포트 제목</label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">다운로드 형식</label>
            <div className="grid grid-cols-4 gap-4">
              {[
                { format: 'PPT', icon: '📊', color: 'orange' },
                { format: 'Word', icon: '📄', color: 'blue' },
                { format: 'PDF', icon: '📕', color: 'red' },
                { format: '웹', icon: '🔗', color: 'gray' }
              ].map((item) => (
                <button
                  key={item.format}
                  onClick={() => handleDownload(item.format)}
                  className={`py-3 rounded-lg font-bold transition ${
                    color_map[item.color] || 'bg-gray-200 text-gray-700'
                  } hover:opacity-90`}
                >
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <div className="text-sm">{item.format}</div>
                </button>
              ))}
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
              <span className="font-bold">분석 기간:</span> {report.analysis_period}
            </p>
            <p>
              <span className="font-bold">분석 결과:</span> 총 {report.statistics.total_processes}개
              프로세스 중 {Math.round((report.statistics.automation_rate / 100) * report.statistics.total_processes)}개(
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
              ✓ 분석 완료 & 프로젝트 목록
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

const color_map = {
  orange: 'bg-orange-500 text-white',
  blue: 'bg-blue-600 text-white',
  red: 'bg-red-600 text-white',
  gray: 'bg-gray-200 text-gray-800'
};
