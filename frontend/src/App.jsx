import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ProjectDashboard from './pages/ProjectDashboard';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import InterviewStep from './pages/InterviewStep';
import ProcessEditStep from './pages/ProcessEditStep';
import BDWDiagnosisStep from './pages/BDWDiagnosisStep';
import AIFitAnalysisStep from './pages/AIFitAnalysisStep';
import FinalReportStep from './pages/FinalReportStep';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 인증 페이지 */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* 보호된 페이지 */}
        <Route
          path="/projects"
          element={
            <PrivateRoute>
              <ProjectDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/new"
          element={
            <PrivateRoute>
              <NewProject />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <PrivateRoute>
              <ProjectDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/:projectId/step2"
          element={
            <PrivateRoute>
              <InterviewStep />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/:projectId/step3"
          element={
            <PrivateRoute>
              <ProcessEditStep />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/:projectId/step4"
          element={
            <PrivateRoute>
              <BDWDiagnosisStep />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/:projectId/step5"
          element={
            <PrivateRoute>
              <AIFitAnalysisStep />
            </PrivateRoute>
          }
        />
        <Route
          path="/projects/:projectId/step6"
          element={
            <PrivateRoute>
              <FinalReportStep />
            </PrivateRoute>
          }
        />

        {/* 리다이렉트 */}
        <Route path="/" element={<Navigate to="/projects" />} />
        <Route path="*" element={<Navigate to="/projects" />} />
      </Routes>
    </Router>
  );
}
