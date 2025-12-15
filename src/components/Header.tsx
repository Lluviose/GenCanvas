import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Layers, 
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
  const { theme, setTheme } = useThemeStore();
  
  // 在画布页面隐藏导航（使用更沉浸式的体验）
  const isCanvasPage = location.pathname.includes('/canvases/');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const ThemeIcon = theme === 'light' ? Sun : Moon;

  return (
    <header className={cn(
      "h-14 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-50",
      isCanvasPage && "border-b-0 bg-transparent absolute w-full"
    )}>
      {/* Logo */}
      <Link to="/workbench" className="flex items-center gap-2 hover:opacity-90 transition-opacity group">
        <div className="relative w-9 h-9 rounded-xl overflow-hidden">
          {/* 流动彩虹背景 */}
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500 via-amber-500 via-emerald-500 via-cyan-500 via-blue-500 to-violet-500 animate-gradient-xy"></div>
          {/* 毛玻璃层 */}
          <div className="absolute inset-0 backdrop-blur-md bg-white/20 dark:bg-black/20"></div>
          {/* 图标 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Aperture className="w-5 h-5 text-white drop-shadow-sm" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-lg tracking-tight">GenCanvas</span>
          <span className="text-xs text-muted-foreground">智绘画布</span>
        </div>
      </Link>

      {/* Navigation */}
      {!isCanvasPage && (
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Canvas Page: Back button */}
      {isCanvasPage && (
        <div className="flex items-center gap-2">
          <Link 
            to="/projects" 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <Layers className="w-4 h-4" />
            返回项目
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={`切换到${theme === 'light' ? '深色' : '浅色'}模式`}
            className="h-9 w-9"
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Theme toggle for non-canvas pages */}
      {!isCanvasPage && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={`切换到${theme === 'light' ? '深色' : '浅色'}模式`}
          className="h-9 w-9"
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>
      )}
    </header>
  );
}
