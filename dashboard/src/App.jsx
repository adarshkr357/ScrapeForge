import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ScrapePlayground from './pages/ScrapePlayground';
import CrawlsPage from './pages/CrawlsPage';
import ScrapeHistoryPage from './pages/ScrapeHistoryPage';
import SerpSearchPage from './pages/SerpSearchPage';
import DatasetsPage from './pages/DatasetsPage';
import SchedulesPage from './pages/SchedulesPage';
import ProxyCheckerPage from './pages/ProxyCheckerPage';
import WorkersPage from './pages/WorkersPage';
import WebhooksPage from './pages/WebhooksPage';
import UsageBillingPage from './pages/UsageBillingPage';
import SettingsPage from './pages/SettingsPage';
import ApiDocsPage from './pages/ApiDocsPage';

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
        <Route path="scrape-history" element={<ScrapeHistoryPage />} />
        <Route path="crawls" element={<CrawlsPage />} />
        <Route path="serp-search" element={<SerpSearchPage />} />
        <Route path="datasets" element={<DatasetsPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="proxy-checker" element={<ProxyCheckerPage />} />
        <Route path="workers" element={<WorkersPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="usage-billing" element={<UsageBillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="api-docs" element={<ApiDocsPage />} />
      </Route>
    </Routes>
  );
}
