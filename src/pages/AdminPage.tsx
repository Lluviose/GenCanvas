import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { DEFAULT_WORKBENCH_SETTINGS, useWorkbenchSettingsStore } from '@/store/workbenchSettingsStore';
import { Image as ImageIcon, KeyRound, Settings2, ShieldCheck, Wand2 } from 'lucide-react';

type TabKey = 'generation' | 'analysis' | 'image' | 'safety' | 'keys';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'generation', label: '生成模型', icon: Settings2 },
  { key: 'analysis', label: '分析模型', icon: Wand2 },
  { key: 'image', label: '图片配置', icon: ImageIcon },
  { key: 'safety', label: '安全', icon: ShieldCheck },
  { key: 'keys', label: '密钥', icon: KeyRound },
];

const verifyConnectivity = async (config: any) => {
  const apiFormat = (config?.apiFormat || 'gemini') as 'gemini' | 'openai';

  if (apiFormat === 'openai') {
    const key = String(config?.openaiApiKey || config?.apiKey || '').trim();
    if (!key) return { success: false, error: 'API Key 未配置' };
    const base = String(config?.openaiBaseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const url = `${base}/v1/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { success: false, error: `API 错误 (${res.status}): ${text.substring(0, 120)}` };
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const models = Array.isArray(data?.data) ? data.data : [];
    return { success: true, modelCount: models.length };
  }

  const key = String(config?.apiKey || '').trim();
  if (!key) return { success: false, error: 'API Key 未配置' };

  const base = String(config?.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const apiVersion = String(config?.apiVersion || 'v1beta').trim() || 'v1beta';
  const isOfficial = base.includes('generativelanguage.googleapis.com');
  const url = isOfficial ? `${base}/${apiVersion}/models?key=${encodeURIComponent(key)}` : `${base}/${apiVersion}/models`;

  const headers: Record<string, string> = {};
  if (!isOfficial) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text().catch(() => '');
  if (!res.ok) return { success: false, error: `API 错误 (${res.status}): ${text.substring(0, 120)}` };
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  const models = Array.isArray(data?.models) ? data.models : [];
  return { success: true, modelCount: models.length };
};

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('generation');
  const [saving, setSaving] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);

  const storeConfig = useWorkbenchSettingsStore((s) => s.settings);
  const updateSettings = useWorkbenchSettingsStore((s) => s.updateSettings);
  const resetSettings = useWorkbenchSettingsStore((s) => s.resetSettings);

  const [config, setConfig] = useState<any>(storeConfig || DEFAULT_WORKBENCH_SETTINGS);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [analysisKeyInput, setAnalysisKeyInput] = useState('');

  const apiFormat = (config?.apiFormat || 'gemini') as 'gemini' | 'openai';
  const hasGeminiKey = Boolean(config?.apiKey);
  const hasOpenAiKey = Boolean(config?.openaiApiKey);
  const hasAnalysisKey = Boolean(config?.analysis?.apiKey);

  const safetyOptions = useMemo(
    () => [
      { value: 'BLOCK_NONE', label: '不拦截' },
      { value: 'BLOCK_ONLY_HIGH', label: '仅高风险' },
      { value: 'BLOCK_MEDIUM_AND_ABOVE', label: '中风险及以上' },
      { value: 'BLOCK_LOW_AND_ABOVE', label: '低风险及以上' },
      { value: 'OFF', label: '关闭' },
    ],
    []
  );

  useEffect(() => {
    setConfig(storeConfig || DEFAULT_WORKBENCH_SETTINGS);
  }, [storeConfig]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      updateSettings(config);
      toast.success('配置已保存');
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const saveKeys = async () => {
    if (!apiKeyInput.trim() && !openaiKeyInput.trim() && !analysisKeyInput.trim()) {
      toast.info('请输入要更新的 Key（留空则不修改）');
      return;
    }
    setSavingKeys(true);
    try {
      updateSettings({
        apiKey: apiKeyInput.trim() || undefined,
        openaiApiKey: openaiKeyInput.trim() || undefined,
        analysis: {
          ...(config?.analysis || {}),
          apiKey: analysisKeyInput.trim() || undefined,
        },
      });
      toast.success('密钥已保存');
      setApiKeyInput('');
      setOpenaiKeyInput('');
      setAnalysisKeyInput('');
    } catch (e: any) {
      toast.error(e?.message || '保存密钥失败');
    } finally {
      setSavingKeys(false);
    }
  };

  const verify = async () => {
    try {
      const data = await verifyConnectivity(config);
      if (data?.success) toast.success(`验证成功，模型数 ${data?.modelCount || 0}`);
      else toast.error(data?.error || '验证失败');
    } catch (e: any) {
      toast.error(e?.message || '验证失败（可能是跨域 CORS 限制）');
    }
  };

  if (!config) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-background">
        <div className="container mx-auto px-6 py-10">
          <div className="text-muted-foreground">暂无配置</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl pb-24 md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">API 配置</h1>
            <p className="text-sm text-muted-foreground mt-1">配置生成/分析模型与 API Key（仅保存在本地浏览器）。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setConfig(storeConfig || DEFAULT_WORKBENCH_SETTINGS)}>
              刷新
            </Button>
            <Button onClick={save} isLoading={saving} disabled={saving}>
              保存配置
            </Button>
          </div>
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
                  active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/40'
                )}
                onClick={() => setTab(t.key)}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'generation' && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">生成模型</h2>
                <div className="text-xs text-muted-foreground">
                  当前格式：<span className="text-foreground">{apiFormat}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">API 格式</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={apiFormat}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, apiFormat: e.target.value }))}
                  >
                    <option value="gemini">Gemini 原生</option>
                    <option value="openai">OpenAI 兼容（chat/completions）</option>
                  </select>
                  {apiFormat === 'openai' ? (
                    <div className="text-xs text-amber-600 dark:text-amber-500">
                      提示：OpenAI 模式当前仅用于文本分析/标签，不支持图片生成；生成请切换到 Gemini。
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">启用流式（Gemini）</label>
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border border-input bg-background"
                      checked={Boolean(config?.enableStream)}
                      onChange={(e) => setConfig((prev: any) => ({ ...prev, enableStream: e.target.checked }))}
                      disabled={apiFormat === 'openai'}
                    />
                    <span className="text-muted-foreground">{apiFormat === 'openai' ? 'OpenAI 模式暂不支持' : 'SSE 实时输出'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Gemini Base URL</label>
                  <Input
                    value={config?.baseUrl || ''}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="https://generativelanguage.googleapis.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gemini API Version</label>
                  <Input
                    value={config?.apiVersion || ''}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, apiVersion: e.target.value }))}
                    placeholder="v1beta"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gemini Model</label>
                  <Input
                    value={config?.model || ''}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, model: e.target.value }))}
                    placeholder="gemini-3-pro-image-preview"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">OpenAI Base URL（可选）</label>
                  <Input
                    value={config?.openaiBaseUrl || ''}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, openaiBaseUrl: e.target.value }))}
                    placeholder="https://api.openai.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">OpenAI Model（可选）</label>
                  <Input
                    value={config?.openaiModel || ''}
                    onChange={(e) => setConfig((prev: any) => ({ ...prev, openaiModel: e.target.value }))}
                    placeholder="gpt-4o-mini"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={verify}>
                  验证 Key
                </Button>
                <div className="text-xs text-muted-foreground">
                  Gemini Key：{hasGeminiKey ? '已配置' : '未配置'} · OpenAI Key：{hasOpenAiKey ? '已配置' : '未配置'}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'analysis' && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h2 className="font-semibold">分析模型（用于提示词/图片分析）</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL</label>
                  <Input
                    value={config?.analysis?.baseUrl || ''}
                    onChange={(e) =>
                      setConfig((prev: any) => ({ ...prev, analysis: { ...(prev?.analysis || {}), baseUrl: e.target.value } }))
                    }
                    placeholder={config?.baseUrl || 'https://generativelanguage.googleapis.com'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Version</label>
                  <Input
                    value={config?.analysis?.apiVersion || ''}
                    onChange={(e) =>
                      setConfig((prev: any) => ({ ...prev, analysis: { ...(prev?.analysis || {}), apiVersion: e.target.value } }))
                    }
                    placeholder={config?.apiVersion || 'v1beta'}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model</label>
                  <Input
                    value={config?.analysis?.model || ''}
                    onChange={(e) =>
                      setConfig((prev: any) => ({ ...prev, analysis: { ...(prev?.analysis || {}), model: e.target.value } }))
                    }
                    placeholder="gemini-2.0-flash"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">分析 Key：{hasAnalysisKey ? '已配置' : '未配置（默认继承主 Key）'}</div>
            </div>
          </div>
        )}

        {tab === 'image' && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h2 className="font-semibold">图片配置（默认）</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">imageSize</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={config?.imageConfig?.imageSize || '2K'}
                    onChange={(e) =>
                      setConfig((prev: any) => ({ ...prev, imageConfig: { ...(prev?.imageConfig || {}), imageSize: e.target.value } }))
                    }
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">aspectRatio</label>
                  <Input
                    value={config?.imageConfig?.aspectRatio || 'auto'}
                    onChange={(e) =>
                      setConfig((prev: any) => ({
                        ...prev,
                        imageConfig: { ...(prev?.imageConfig || {}), aspectRatio: e.target.value },
                      }))
                    }
                    placeholder="auto / 1:1 / 16:9 …"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'safety' && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h2 className="font-semibold">安全设置</h2>
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-input bg-background"
                  checked={config?.enableSafetySettings !== false}
                  onChange={(e) => setConfig((prev: any) => ({ ...prev, enableSafetySettings: e.target.checked }))}
                />
                <span className="text-muted-foreground">启用 Safety Settings</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.keys(config?.safetySettings || {}).map((k) => (
                  <div key={k} className="space-y-2">
                    <label className="text-sm font-medium">{k}</label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={config?.safetySettings?.[k] || 'BLOCK_NONE'}
                      onChange={(e) =>
                        setConfig((prev: any) => ({
                          ...prev,
                          safetySettings: { ...(prev?.safetySettings || {}), [k]: e.target.value },
                        }))
                      }
                    >
                      {safetyOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h2 className="font-semibold">保存密钥（仅本地浏览器）</h2>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gemini API Key</label>
                <Input value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value.trim())} placeholder="AIza..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OpenAI API Key（可选）</label>
                <Input value={openaiKeyInput} onChange={(e) => setOpenaiKeyInput(e.target.value.trim())} placeholder="sk-..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Analysis API Key（可选）</label>
                <Input value={analysisKeyInput} onChange={(e) => setAnalysisKeyInput(e.target.value.trim())} placeholder="若留空则继承主 Key" />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveKeys} isLoading={savingKeys} disabled={savingKeys}>
                  保存密钥
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetSettings();
                    toast.success('已恢复默认');
                  }}
                >
                  刷新状态
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Gemini Key：{hasGeminiKey ? '已配置' : '未配置'} · OpenAI Key：{hasOpenAiKey ? '已配置' : '未配置'} · Analysis Key：
                {hasAnalysisKey ? '已配置' : '未配置'}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

