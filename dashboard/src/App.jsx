import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ScrapePlayground from './pages/ScrapePlayground';
import CrawlsPage from './pages/CrawlsPage';
import RequestsPage from './pages/RequestsPage';
import SearchPage from './pages/SearchPage';
import DatasetsPage from './pages/DatasetsPage';
import SchedulesPage from './pages/SchedulesPage';
import ProxyHealthPage from './pages/ProxyHealthPage';
import WorkersPage from './pages/WorkersPage';
import WebhooksPage from './pages/WebhooksPage';
import UsagePage from './pages/UsagePage';
import SettingsPage from './pages/SettingsPage';
import DocsPage from './pages/DocsPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="main-content"><div className="skeleton" style={{ height: 300 }} /></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="playground" element={<ScrapePlayground />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="crawls" element={<CrawlsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="datasets" element={<DatasetsPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="proxies" element={<ProxyHealthPage />} />
        <Route path="workers" element={<WorkersPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="docs" element={<DocsPage />} />
      </Route>
    </Routes>
  );
}
