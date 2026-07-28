import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SetupPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [aiEngine, setAiEngine] = useState('chatgpt');
  const [aiToken, setAiToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState('company'); // 'company' or 'ai'

  const handleSaveCompany = () => {
    if (!companyName.trim()) {
      setError('회사명을 입력해주세요');
      return;
    }
    localStorage.setItem('company_name', companyName.trim());
    setSuccess('회사명이 저장되었습니다');
    setError('');
    setTimeout(() => {
      setCurrentStep('ai');
      setSuccess('');
    }, 500);
  };

  const handleSaveAI = () => {
    if (!aiToken.trim()) {
      setError('API 토큰을 입력해주세요');
      return;
    }
    localStorage.setItem('ai_engine', aiEngine);
    localStorage.setItem('ai_token', aiToken.trim());
    setSuccess('AI API 설정이 저장되었습니다');
    setError('');
    setTimeout(() => {
      navigate('/projects');
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">▣ BPA Tool</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">
            Business Process Analysis
          </h2>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
              {success}
            </div>
          )}

          {/* Step 1: Company Name */}
          <div
            className={`mb-8 p-6 border-2 rounded-lg transition ${
              currentStep === 'company' ? 'border-primary bg-blue-50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              1단계: 회사명 입력
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                회사명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSaveCompany()}
                disabled={currentStep !== 'company'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                placeholder="예: Samsung Electronics"
              />
            </div>
            <button
              onClick={handleSaveCompany}
              disabled={currentStep !== 'company'}
              className="w-full bg-primary text-white font-bold py-2 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
            >
              저장 및 다음
            </button>
          </div>

          {/* Step 2: AI API Settings */}
          <div
            className={`p-6 border-2 rounded-lg transition ${
              currentStep === 'ai' ? 'border-primary bg-blue-50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              2단계: AI API 설정
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                AI 엔진 선택 <span className="text-red-500">*</span>
              </label>
              <select
                value={aiEngine}
                onChange={(e) => setAiEngine(e.target.value)}
                disabled={currentStep !== 'ai'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
              >
                <option value="chatgpt">ChatGPT</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                API 토큰 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={aiToken}
                onChange={(e) => setAiToken(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSaveAI()}
                disabled={currentStep !== 'ai'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                placeholder="API 토큰을 입력하세요"
              />
            </div>

            <button
              onClick={handleSaveAI}
              disabled={currentStep !== 'ai'}
              className="w-full bg-primary text-white font-bold py-2 rounded-lg hover:bg-opacity-90 transition disabled:opacity-50"
            >
              저장 및 시작
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
