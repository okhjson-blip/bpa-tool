import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = searchParams.get('token');

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary to-purple flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-danger font-bold">유효하지 않은 링크입니다</p>
        </div>
      </div>
    );
  }

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }

    setLoading(true);

    try {
      await authAPI.resetPassword(token, password);
      setMessage('비밀번호가 변경되었습니다');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || '비밀번호 변경에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-purple flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">비밀번호 재설정</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-danger px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-100 border border-success text-success px-4 py-3 rounded mb-4">
            {message}
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">새 비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-2 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
          >
            {loading ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  );
}
