import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import CanvasesPage from './pages/CanvasesPage';
import CanvasPage from './pages/CanvasPage';
import GalleryPage from './pages/GalleryPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import BackupPage from './pages/BackupPage';
import WorkbenchPage from './pages/WorkbenchPage';
import Header from './components/Header';
import { ToastContainer } from './components/ui/toast';
import MobileNav from './components/MobileNav';
import { cn } from './lib/utils';

function Layout() {
  const location = useLocation();
  const isCanvasPage = location.pathname.includes('/canvases/');

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* 画布页面不显示Header，使用沉浸式体验 */}
      {!isCanvasPage && <Header />}
      <main className={cn(!isCanvasPage && 'pb-24 md:pb-0')}>
        <Routes>
          <Route path="/" element={<Navigate to="/workbench" replace />} />
          <Route path="/workbench" element={<WorkbenchPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId/canvases" element={<CanvasesPage />} />
          <Route path="/projects/:projectId/canvases/:canvasId" element={<CanvasPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupPage />} />
        </Routes>
      </main>
      <MobileNav />
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

export default App;
