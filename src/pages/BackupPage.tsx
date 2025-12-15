import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  Cloud,
  Download,
  Eye,
  EyeOff,
  FolderSync,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
  UploadCloud,
  DownloadCloud,
} from 'lucide-react';
import {
  backupToWebDAV,
  clearWebDAVConfig,
  downloadBackupAsJSON,
  exportBackupData,
  importBackupData,
  listWebDAVFiles,
  loadWebDAVConfig,
  restoreFromWebDAV,
  saveWebDAVConfig,
  testWebDAVConnection,
  type ImportResult,
  type WebDAVConfig,
} from '@/services/backupService';

type TabKey = 'local' | 'webdav';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'local', label: '本地备份', icon: HardDrive },
  { key: 'webdav', label: 'WebDAV 云备份', icon: Cloud },
];

export default function BackupPage() {
  const [tab, setTab] = useState<TabKey>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local backup state
  const [includeCanvases, setIncludeCanvases] = useState(true);
  const [mergeMode, setMergeMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // WebDAV state
  const [webdavConfig, setWebdavConfig] = useState<WebDAVConfig>({
    serverUrl: '',
    username: '',
    password: '',
    remotePath: '/GenCanvas/',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');

  // Load saved WebDAV config
  useEffect(() => {
    const saved = loadWebDAVConfig();
    if (saved) {
      setWebdavConfig(saved);
    }
  }, []);

  // ============ Local Backup ============

  const handleExport = () => {
    try {
      downloadBackupAsJSON({ includeCanvases });
      toast.success('备份文件已下载');
    } catch (e: any) {
      toast.error(e?.message || '导出失败');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const result = await importBackupData(file, { mergeMode });
      setImportResult(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err?.message || '导入失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getPreviewStats = () => {
    const data = exportBackupData({ includeCanvases });
    return {
      galleryImages: data.galleryImages.length,
      promptLibrary: data.promptLibrary.length,
      projects: data.projects?.length || 0,
      canvases: Object.values(data.canvases || {}).flat().length,
      canvasSnapshots: Object.keys(data.canvasSnapshots || {}).length,
    };
  };

  const [previewStats, setPreviewStats] = useState<ReturnType<typeof getPreviewStats> | null>(null);

  useEffect(() => {
    setPreviewStats(getPreviewStats());
  }, [includeCanvases]);

  // ============ WebDAV ============

  const handleSaveWebDAVConfig = () => {
    if (!webdavConfig.serverUrl.trim()) {
      toast.error('请填写服务器地址');
      return;
    }
    saveWebDAVConfig(webdavConfig);
    toast.success('WebDAV 配置已保存');
  };

  const handleClearWebDAVConfig = () => {
    clearWebDAVConfig();
    setWebdavConfig({
      serverUrl: '',
      username: '',
      password: '',
      remotePath: '/GenCanvas/',
    });
    setRemoteFiles([]);
    toast.success('已清除配置');
  };

  const handleTestConnection = async () => {
    if (!webdavConfig.serverUrl.trim()) {
      toast.error('请填写服务器地址');
      return;
    }
    setTesting(true);
    try {
      const result = await testWebDAVConnection(webdavConfig);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e?.message || '连接失败');
    } finally {
      setTesting(false);
    }
  };

  const handleUploadToWebDAV = async () => {
    if (!webdavConfig.serverUrl.trim()) {
      toast.error('请先配置 WebDAV');
      return;
    }
    setUploading(true);
    try {
      const result = await backupToWebDAV(webdavConfig, { includeCanvases });
      if (result.success) {
        toast.success(result.message);
        handleRefreshFiles();
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleRefreshFiles = async () => {
    if (!webdavConfig.serverUrl.trim()) return;
    setLoadingFiles(true);
    try {
      const result = await listWebDAVFiles(webdavConfig);
      if (result.success && result.files) {
        setRemoteFiles(result.files);
        if (result.files.length > 0 && !selectedFile) {
          setSelectedFile(result.files[0]);
        }
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e?.message || '获取文件列表失败');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleRestoreFromWebDAV = async () => {
    if (!selectedFile) {
      toast.error('请选择要恢复的备份文件');
      return;
    }
    setDownloading(true);
    try {
      const result = await restoreFromWebDAV(webdavConfig, selectedFile, { mergeMode });
      if (result.success) {
        toast.success(result.message);
        setImportResult(result);
      } else {
        toast.error(result.message);
      }
    } catch (e: any) {
      toast.error(e?.message || '恢复失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl pb-24 md:pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">数据备份</h1>
          <p className="text-sm text-muted-foreground mt-1">
            导出/导入图片库、提示词库和画布数据，或同步到 WebDAV 云存储（坚果云/Nextcloud）。
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-auto pb-2 mb-4">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                className={cn(
                  'shrink-0 px-3 py-2 rounded-xl border text-sm flex items-center gap-2',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary/40'
                )}
                onClick={() => setTab(t.key)}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Local Backup Tab */}
        {tab === 'local' && (
          <div className="space-y-4">
            {/* Export */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">导出备份</h2>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input bg-background"
                  checked={includeCanvases}
                  onChange={(e) => setIncludeCanvases(e.target.checked)}
                />
                <span className="text-muted-foreground">包含项目与画布数据</span>
              </div>

              {previewStats && (
                <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-secondary/30">
                  <div>将导出：</div>
                  <div className="grid grid-cols-2 gap-1">
                    <span>图片库：{previewStats.galleryImages} 张</span>
                    <span>提示词库：{previewStats.promptLibrary} 条</span>
                    {includeCanvases && (
                      <>
                        <span>项目：{previewStats.projects} 个</span>
                        <span>画布：{previewStats.canvases} 个</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Button onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                下载备份文件
              </Button>
            </div>

            {/* Import */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">导入备份</h2>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">导入模式</label>
                <div className="flex gap-2">
                  <button
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm',
                      mergeMode === 'merge'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary/40'
                    )}
                    onClick={() => setMergeMode('merge')}
                  >
                    合并（保留现有 + 添加新的）
                  </button>
                  <button
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm',
                      mergeMode === 'replace'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary/40'
                    )}
                    onClick={() => setMergeMode('replace')}
                  >
                    替换（覆盖现有数据）
                  </button>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={handleFileChange}
              />

              <Button onClick={handleImportClick} disabled={importing} variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                {importing ? '导入中...' : '选择备份文件'}
              </Button>

              {importResult && (
                <div
                  className={cn(
                    'text-sm p-3 rounded-lg',
                    importResult.success ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                  )}
                >
                  <div className="font-medium">{importResult.message}</div>
                  {importResult.stats && (
                    <div className="mt-1 text-xs opacity-80">
                      图片：{importResult.stats.galleryImages} · 提示词：{importResult.stats.promptLibrary}
                      {importResult.stats.projects !== undefined && ` · 项目：${importResult.stats.projects}`}
                      {importResult.stats.canvases !== undefined && ` · 画布：${importResult.stats.canvases}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* WebDAV Tab */}
        {tab === 'webdav' && (
          <div className="space-y-4">
            {/* Config */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <FolderSync className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">WebDAV 配置</h2>
              </div>

              <div className="text-xs text-muted-foreground p-3 rounded-lg bg-secondary/30 space-y-1">
                <div>
                  <strong>坚果云示例：</strong>
                </div>
                <div>服务器：https://dav.jianguoyun.com/dav</div>
                <div>用户名：你的邮箱</div>
                <div>密码：应用密码（非登录密码，在 账户设置 → 安全选项 → 第三方应用管理 创建）</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">服务器地址</label>
                  <Input
                    value={webdavConfig.serverUrl}
                    onChange={(e) => setWebdavConfig((p) => ({ ...p, serverUrl: e.target.value }))}
                    placeholder="https://dav.jianguoyun.com/dav"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">远程目录</label>
                  <Input
                    value={webdavConfig.remotePath}
                    onChange={(e) => setWebdavConfig((p) => ({ ...p, remotePath: e.target.value }))}
                    placeholder="/GenCanvas/"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">用户名</label>
                  <Input
                    value={webdavConfig.username}
                    onChange={(e) => setWebdavConfig((p) => ({ ...p, username: e.target.value }))}
                    placeholder="your@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">密码 / 应用密码</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={webdavConfig.password}
                      onChange={(e) => setWebdavConfig((p) => ({ ...p, password: e.target.value }))}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveWebDAVConfig} variant="outline">
                  保存配置
                </Button>
                <Button onClick={handleTestConnection} variant="outline" disabled={testing}>
                  {testing ? '测试中...' : '测试连接'}
                </Button>
                <Button onClick={handleClearWebDAVConfig} variant="ghost" size="icon" title="清除配置">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Upload */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">上传备份</h2>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input bg-background"
                  checked={includeCanvases}
                  onChange={(e) => setIncludeCanvases(e.target.checked)}
                />
                <span className="text-muted-foreground">包含项目与画布数据</span>
              </div>

              <Button onClick={handleUploadToWebDAV} disabled={uploading || !webdavConfig.serverUrl}>
                <UploadCloud className="h-4 w-4 mr-2" />
                {uploading ? '上传中...' : '上传到 WebDAV'}
              </Button>
            </div>

            {/* Download */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DownloadCloud className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">从云端恢复</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshFiles}
                  disabled={loadingFiles || !webdavConfig.serverUrl}
                >
                  <RefreshCw className={cn('h-4 w-4', loadingFiles && 'animate-spin')} />
                </Button>
              </div>

              {remoteFiles.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">选择备份文件</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedFile}
                    onChange={(e) => setSelectedFile(e.target.value)}
                  >
                    {remoteFiles.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {webdavConfig.serverUrl ? '点击右上角刷新按钮获取文件列表' : '请先配置 WebDAV'}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">恢复模式</label>
                <div className="flex gap-2">
                  <button
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm',
                      mergeMode === 'merge'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary/40'
                    )}
                    onClick={() => setMergeMode('merge')}
                  >
                    合并
                  </button>
                  <button
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg border text-sm',
                      mergeMode === 'replace'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-secondary/40'
                    )}
                    onClick={() => setMergeMode('replace')}
                  >
                    替换
                  </button>
                </div>
              </div>

              <Button
                onClick={handleRestoreFromWebDAV}
                disabled={downloading || !selectedFile}
                variant="outline"
              >
                <DownloadCloud className="h-4 w-4 mr-2" />
                {downloading ? '恢复中...' : '恢复选中的备份'}
              </Button>

              {importResult && tab === 'webdav' && (
                <div
                  className={cn(
                    'text-sm p-3 rounded-lg',
                    importResult.success ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                  )}
                >
                  <div className="font-medium">{importResult.message}</div>
                  {importResult.stats && (
                    <div className="mt-1 text-xs opacity-80">
                      图片：{importResult.stats.galleryImages} · 提示词：{importResult.stats.promptLibrary}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
