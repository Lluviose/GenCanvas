import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { FolderKanban, Image, Settings, SlidersHorizontal, Sparkles } from 'lucide-react';

const navItems = [
  { path: '/workbench', label: '工作台', icon: Sparkles },
  { path: '/projects', label: '项目', icon: FolderKanban },
  { path: '/gallery', label: '资产', icon: Image },
  { path: '/admin', label: 'API', icon: SlidersHorizontal },
  { path: '/settings', label: '设置', icon: Settings },
];

export default function MobileNav() {
  const location = useLocation();
  const isCanvasPage = location.pathname.includes('/canvases/');
  if (isCanvasPage) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/85 backdrop-blur-xl md:hidden animate-slide-in-bottom">
      <div className="grid grid-cols-5 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs transition-all duration-300',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {active && (
                <div className="absolute inset-0 bg-primary/10 rounded-xl -z-10 animate-fade-in" />
              )}
              <Icon className={cn('h-5 w-5 transition-transform duration-300', active && 'scale-110')} />
              <span className={cn('transition-all duration-300', active ? 'font-medium' : '')}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
