import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SetupPage from './pages/SetupPage';
import ProjectDashboard from './pages/ProjectDashboard';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import InterviewStep from './pages/InterviewStep';
import ProcessEditStep from './pages/ProcessEditStep';
import BDWDiagnosisStep from './pages/BDWDiagnosisStep';
import AIFitAnalysisStep from './pages/AIFitAnalysisStep';
import FinalReportStep from './pages/FinalReportStep';

function RootRedirect() {
  const companyName = localStorage.getItem('company_name');
  if (companyName) {
    return <Navigate to="/projects" />;
  }
  return <Navigate to="/setup" />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 초기 설정 페이지 */}
        <Route path="/setup" element={<SetupPage />} />

        {/* 프로젝트 페이지 */}
        <Route path="/projects" element={<ProjectDashboard />} />
        <Route path="/projects/new" element={<NewProject />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/projects/:projectId/step2" element={<InterviewStep />} />
        <Route path="/projects/:projectId/step3" element={<ProcessEditStep />} />
        <Route path="/projects/:projectId/step4" element={<BDWDiagnosisStep />} />
        <Route path="/projects/:projectId/step5" element={<AIFitAnalysisStep />} />
        <Route path="/projects/:projectId/step6" element={<FinalReportStep />} />

        {/* 리다이렉트 */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
