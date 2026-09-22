import { Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import { MonitorProvider } from './context/MonitorContext'
import Alerts from './pages/Alerts'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Insights from './pages/Insights'
import Reports from './pages/Reports'

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h2 className="text-2xl font-bold text-white">Page not found</h2>
      <p className="mt-2 text-sm text-slate-500">
        That route does not exist in this dashboard.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <MonitorProvider>
      <Layout>
        <ErrorBoundary label="This page">
            <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </MonitorProvider>
  )
}
