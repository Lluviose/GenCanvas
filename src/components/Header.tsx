import { Link, useLocation, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  ChevronLeft,
  FolderKanban, 
  Image,
  SlidersHorizontal,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Aperture
} from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/workbench', label: '工作台', icon: Sparkles },
  { path: '/projects', label: '项目', icon: FolderKanban },
  { path: '/gallery', label: '资产', icon: Image },
  { path: '/admin', label: 'API配置', icon: SlidersHorizontal },
  { path: '/settings', label: '设置', icon: Settings },
];

export default function Header() {
  const location = useLocation();
  const { projectId } = useParams();
  const { theme, setTheme } = useThemeStore();
  
  // 在画布页面隐藏导航（使用更沉浸式的体验）
  const isCanvasPage = location.pathname.includes('/canvases/');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const ThemeIcon = theme === 'light' ? Sun : Moon;

  return (
    <header className={cn(
      "h-14 border-b border-border/40 bg-background/60 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-between px-4 sticky top-0 z-50 transition-all duration-300",
      isCanvasPage && "border-b-0 bg-transparent backdrop-blur-none pointer-events-none absolute w-full p-3 md:p-4"
    )}>
      {/* 画布页面的返回按钮 - 左上角第一位置 */}
      {isCanvasPage ? (
        <Link 
          to={projectId ? `/projects/${projectId}/canvases` : "/projects"}
          className="pointer-events-auto flex items-center gap-1.5 h-10 px-3 rounded-full text-sm font-medium bg-background/80 backdrop-blur-xl border border-border/40 shadow-lg text-foreground hover:bg-background transition-all active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>返回</span>
        </Link>
      ) : (
        /* Logo - 非画布页 */
        <div className="flex items-center gap-4 pointer-events-auto">
          <Link to="/workbench" className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-sm">
              {/* 流动彩虹背景 */}
              <div className="absolute inset-0 bg-gradient-to-tr from-rose-500 via-amber-500 via-emerald-500 via-cyan-500 via-blue-500 to-violet-500 animate-gradient-xy opacity-90"></div>
              {/* 璃璃光泽 */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent"></div>
              {/* 图标 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Aperture className="w-4.5 h-4.5 text-white drop-shadow-md" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-base tracking-tight text-foreground/90">GenCanvas</span>
            </div>
          </Link>
        </div>
      )}

      {/* Navigation */}
      {!isCanvasPage && (
        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          <div className="flex items-center p-1 bg-secondary/50 backdrop-blur-md rounded-full border border-border/20 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-background text-foreground shadow-sm scale-100" 
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50 scale-95 hover:scale-100"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* 右侧控制区 */}
      <div className={cn(
        "flex items-center gap-2 pointer-events-auto",
        isCanvasPage && "bg-background/80 backdrop-blur-xl rounded-full p-1 border border-border/40 shadow-lg"
      )}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={`切换到${theme === 'light' ? '深色' : '浅色'}模式`}
          className="h-9 w-9 rounded-full hover:bg-secondary/80"
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
