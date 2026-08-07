import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { interviewsAPI, domainsAPI } from '../services/api';
import { statikLevelLabel } from '../utils/statik';

export default function InterviewStep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [interviewType, setInterviewType] = useState('text');
  const [interviewText, setInterviewText] = useState('');
  const [interviews, setInterviews] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const [interviewsRes, processesRes, domainsRes] = await Promise.all([
        interviewsAPI.list(projectId),
        interviewsAPI.getProcesses(projectId),
        domainsAPI.getTree(projectId)
      ]);
      setInterviews(interviewsRes.data);
      setProcesses(processesRes.data);
      setDomains(domainsRes.data);
    } catch (err) {
      setError('데이터 로드 실패');
    }
  };

  const handleCreateInterview = async (e) => {
    e.preventDefault();
    if (!interviewText.trim()) {
      setError('인터뷰 내용을 입력해주세요');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await interviewsAPI.create(projectId, {
        interview_type: 'text',
        text: interviewText
      });

      setSuccess('인터뷰가 저장되었습니다');
      setInterviewText('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || '인터뷰 저장 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeInterview = async (interviewId) => {
    setAnalyzing(true);
    setError('');
    setSuccess('');

    try {
      const response = await interviewsAPI.analyze(interviewId, projectId);
      setSuccess('✨ AI Draft가 생성되었습니다!');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'AI 분석 실패');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="text-sm opacity-80 hover:opacity-100 mb-2"
          >
            ← 과제 상세
          </button>
          <h1 className="text-2xl font-bold">인터뷰 & AI Draft 생성</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">저장된 인터뷰</p>
            <p className="text-3xl font-bold text-primary">{interviews.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">생성된 프로세스</p>
            <p className="text-3xl font-bold text-primary">{processes.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">진행 상태</p>
            <p className="text-3xl font-bold text-primary">
              {interviews.length > 0 ? '진행중' : '준비중'}
            </p>
          </div>
        </div>

        {/* 인터뷰 입력 */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6">인터뷰 입력</h2>


          <form onSubmit={handleCreateInterview} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                인터뷰 내용
              </label>
              <textarea
                value={interviewText}
                onChange={(e) => setInterviewText(e.target.value)}
                rows="6"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="인터뷰 녹취록 또는 프로세스 설명을 입력하세요..."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
            >
              {loading ? '저장 중...' : '인터뷰 저장'}
            </button>
          </form>
        </div>

        {/* 저장된 인터뷰 */}
        {interviews.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">저장된 인터뷰</h2>

            <div className="space-y-4">
              {interviews.map((interview) => (
                <div key={interview.id} className="border border-gray-300 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-sm text-gray-600">
                        {new Date(interview.created_at).toLocaleDateString('ko-KR')}
                      </p>
                      <p className="font-bold mt-1">
                        {interview.interview_type === 'voice'
                          ? '🎙 음성 녹음'
                          : interview.interview_type === 'upload'
                            ? '📁 파일'
                            : '📝 텍스트'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAnalyzeInterview(interview.id)}
                      disabled={analyzing}
                      className="bg-success text-white px-4 py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-50"
                    >
                      {analyzing ? '분석중...' : '✨ AI Draft 생성'}
                    </button>
                  </div>
                  <p className="text-gray-700 text-sm line-clamp-3">
                    {interview.text || interview.transcription}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 생성된 프로세스 */}
        {processes.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">AI Draft (L4 모듈·L5 단위·L6 Act)</h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-2 text-left text-sm font-bold">레벨</th>
                    <th className="px-4 py-2 text-left text-sm font-bold">프로세스명</th>
                    <th className="px-4 py-2 text-left text-sm font-bold">작업방식</th>
                    <th className="px-4 py-2 text-left text-sm font-bold">도구</th>
                    <th className="px-4 py-2 text-left text-sm font-bold">시간(분)</th>
                    <th className="px-4 py-2 text-left text-sm font-bold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((proc) => (
                    <tr key={proc.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">
                        <span className="bg-primary text-white px-2 py-1 rounded text-xs font-bold">
                          {statikLevelLabel(proc.level)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-bold">{proc.name}</td>
                      <td className="px-4 py-2 text-sm">{proc.method || '-'}</td>
                      <td className="px-4 py-2 text-sm">{proc.tool || '-'}</td>
                      <td className="px-4 py-2 text-sm">{proc.execution_time || '-'}</td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            proc.status === 'draft'
                              ? 'bg-yellow-100 text-yellow-800'
                              : proc.status === 'confirmed'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {proc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex gap-4">
              <button
                onClick={() => navigate(`/projects/${projectId}/step3`)}
                className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90"
              >
                다음: 프로세스 수정 →
              </button>
              <button
                onClick={() => navigate(`/projects/${projectId}`)}
                className="bg-gray-300 text-gray-700 font-bold px-6 py-2 rounded-lg"
              >
                목록으로
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
