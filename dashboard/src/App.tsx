import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import DashboardPage from './pages/DashboardPage';
import ScenariosPage from './pages/ScenariosPage';
import ScenarioEditorPage from './pages/ScenarioEditorPage';
import GroupsPage from './pages/GroupsPage';
import AuthProfilesPage from './pages/AuthProfilesPage';
import StreamsPage from './pages/StreamsPage';
import SchedulesPage from './pages/SchedulesPage';
import RunsPage from './pages/RunsPage';
import RunReportPage from './pages/RunReportPage';
import RunnersPage from './pages/RunnersPage';
import WebhooksPage from './pages/WebhooksPage';
import QueuePage from './pages/QueuePage';
import DevicesPage from './pages/DevicesPage';
import MirrorPage from './pages/MirrorPage';
import TestDataPage from './pages/TestDataPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/scenarios" element={<ScenariosPage />} />
                <Route path="/scenarios/:id" element={<ScenarioEditorPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/auth-profiles" element={<AuthProfilesPage />} />
                <Route path="/streams" element={<StreamsPage />} />
                <Route path="/devices" element={<DevicesPage />} />
                <Route path="/devices/mirror/:sessionId" element={<MirrorPage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
                <Route path="/runs" element={<RunsPage />} />
                <Route path="/runs/:id/report" element={<RunReportPage />} />
                <Route path="/runners" element={<RunnersPage />} />
                <Route path="/queue" element={<QueuePage />} />
                <Route path="/webhooks" element={<WebhooksPage />} />
                <Route path="/test-data" element={<TestDataPage />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
