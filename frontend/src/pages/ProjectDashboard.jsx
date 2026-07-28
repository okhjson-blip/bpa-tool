import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projectsAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await projectsAPI.list();
      setProjects(response.data);
    } catch (err) {
      setError('과제를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">▣ BPA Tool</h1>
            <p className="text-sm opacity-80">비즈니스 프로세스 분석 플랫폼</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.name}</span>
            <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-xs font-bold">
              {user?.name?.charAt(0)}
            </div>
            <button
              onClick={handleLogout}
              className="text-sm bg-red-500 hover:bg-red-600 px-4 py-2 rounded"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800">과제</h2>
          <Link
            to="/projects/new"
            className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:bg-opacity-90"
          >
            + 새 과제
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">프로젝트를 불러오는 중...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">아직 프로젝트가 없습니다</p>
            <Link
              to="/projects/new"
              className="text-primary font-bold hover:underline"
            >
              첫 번째 프로젝트 생성하기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
              >
                <h3 className="text-xl font-bold text-primary mb-2">{project.name}</h3>
                <p className="text-sm text-gray-600 mb-3">{project.description}</p>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    <span className="font-semibold">L1 도메인:</span> {project.l1_domain}
                  </p>
                  {project.analysis_goal && (
                    <p>
                      <span className="font-semibold">분석 목표:</span> {project.analysis_goal}
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  {new Date(project.created_at).toLocaleDateString('ko-KR')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
