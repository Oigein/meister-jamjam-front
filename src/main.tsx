import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
// 전역 스타일을 먼저 불러와야 각 화면 CSS가 덮어쓸 수 있음
import './styles/global.css';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import RankingPage from './pages/RankingPage';
import StudentDetailPage from './pages/StudentDetailPage';
import RulesPage from './pages/RulesPage';
import ContestsPage from './pages/ContestsPage';
import ContestDetailPage from './pages/ContestDetailPage';
import EvidencesPage from './pages/EvidencesPage';
import GradingPage from './pages/GradingPage';
import SelfReportsPage from './pages/SelfReportsPage';
import SelfReportDetailPage from './pages/SelfReportDetailPage';
import TeacherSelfReportsPage from './pages/TeacherSelfReportsPage';
import DrawPage from './pages/DrawPage';
import SettingsPage from './pages/SettingsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import { MyStudentRedirect } from './components/MyStudentRedirect';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/ranking" replace />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/students/me" element={<MyStudentRedirect />} />
          <Route path="/students/:studentId" element={<StudentDetailPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/contests" element={<ContestsPage />} />
          <Route path="/contests/:contestId" element={<ContestDetailPage />} />
          <Route path="/me/evidences" element={<EvidencesPage />} />
          <Route path="/me/evidences/:evidenceId" element={<EvidencesPage />} />
          <Route path="/grading" element={<GradingPage />} />
          <Route path="/reports" element={<SelfReportsPage />} />
          <Route path="/me/self-reports/:reportId" element={<SelfReportDetailPage />} />
          <Route path="/teacher/self-reports" element={<TeacherSelfReportsPage />} />
          <Route path="/teacher/self-reports/:reportId" element={<SelfReportDetailPage />} />
          <Route path="/draw" element={<DrawPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<PlaceholderPage title="페이지를 찾을 수 없습니다" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
