import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await authAPI.requestPasswordReset(email);
      setMessage('비밀번호 초기화 링크가 이메일로 발송되었습니다');
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || '요청에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-purple flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">비밀번호 찾기</h1>

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

        <form onSubmit={handleRequest} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              가입하신 이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="your@email.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-2 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
          >
            {loading ? '전송 중...' : '초기화 링크 발송'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          <Link to="/login" className="text-primary font-bold hover:underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
