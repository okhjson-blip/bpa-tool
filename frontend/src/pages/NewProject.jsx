import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI } from '../services/api';

export default function NewProject() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    l1_domain: '',
    analysis_goal: '',
    analysis_period: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Get ai_engine from localStorage
      const aiEngine = localStorage.getItem('ai_engine') || 'chatgpt';
      const submitData = {
        ...formData,
        ai_engine: aiEngine
      };
      const response = await projectsAPI.create(submitData);
      navigate(`/projects/${response.data.project.id}`);
    } catch (err) {
      setError(err.response?.data?.error || '과제 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">▣ BPA Tool</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/projects')}
          className="text-primary font-bold mb-6 hover:underline"
        >
          ← 과제 목록으로
        </button>

        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-8">새 과제 생성</h2>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                과제명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="예: 디지털마케팅 콘텐츠 제작 프로세스"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                L1 구분 · 조직 기능 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="l1_domain"
                value={formData.l1_domain}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="예: 영업마케팅"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">설명</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="과제에 대한 설명을 작성하세요"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">분석 목표</label>
              <input
                type="text"
                name="analysis_goal"
                value={formData.analysis_goal}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="예: SNS 콘텐츠 운영 프로세스의 AI 자동화 방안 도출"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">분석 기간</label>
              <input
                type="text"
                name="analysis_period"
                value={formData.analysis_period}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="예: 2026-07-01 ~ 2026-07-31"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-primary text-white font-bold py-2 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
              >
                {loading ? '생성 중...' : '과제 생성'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/projects')}
                className="flex-1 bg-gray-200 text-gray-800 font-bold py-2 rounded-lg hover:bg-gray-300 transition"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
