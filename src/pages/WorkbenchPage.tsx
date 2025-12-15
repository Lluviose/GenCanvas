import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '@/store/projectsStore';

const LAST_CANVAS_KEY = 'photopro:last-canvas';

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const { projects, hydrate } = useProjectsStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_CANVAS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as any;
        const projectId = String(parsed?.projectId || '').trim();
        const canvasId = String(parsed?.canvasId || '').trim();
        if (projectId && canvasId) {
          navigate(`/projects/${projectId}/canvases/${canvasId}`, { replace: true });
          return;
        }
      }
    } catch {
      // ignore
    }

    const first = projects?.[0];
    if (first?.id) {
      navigate(`/projects/${first.id}/canvases/default`, { replace: true });
      return;
    }

    navigate('/projects', { replace: true });
  }, [navigate, projects]);

  return null;
}

