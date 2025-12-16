import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { usePreferencesStore, type AiChatPreset, type QuickBranchPreset } from '@/store/preferencesStore';
import { useThemeStore, ACCENT_COLORS } from '@/store/themeStore';
import { Sun, Moon, Check, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { prefs, updatePrefs, resetPrefs } = usePreferencesStore();
  const { theme, accentColor, customAccentColor, setTheme, setAccentColor, setCustomAccentColor } = useThemeStore();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(prefs);
  const [customAccentDraft, setCustomAccentDraft] = useState(customAccentColor);

  useEffect(() => {
    setDraft(prefs);
  }, [prefs]);

  useEffect(() => {
    setCustomAccentDraft(customAccentColor);
  }, [customAccentColor]);

  const handleSave = () => {
    const cleanedQuickBranchPresets = (draft.quickBranchPresets || [])
      .map((p) => ({ label: String(p.label || '').trim(), value: String(p.value || '').trim() }))
      .filter((p) => p.label && p.value)
      .slice(0, 24);

    const cleanedAiChatPresets = (draft.aiChatPresets || [])
      .map((p) => ({ id: String(p.id || '').trim(), title: String(p.title || '').trim(), prompt: String(p.prompt || '').trim() }))
      .filter((p) => p.id && p.title && p.prompt)
      .slice(0, 24);

    const clampScore = (n: any, fallback: number) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : fallback;
    };

    const aiChatMaxMessages = (() => {
      const v = Number(draft.aiChatMaxMessages);
      if (!Number.isFinite(v)) return prefs.aiChatMaxMessages;
      return Math.max(6, Math.min(80, v));
    })();

    const canvasCollapsedPreviewDepth = (() => {
      const v = Number(draft.canvasCollapsedPreviewDepth);
      if (!Number.isFinite(v)) return prefs.canvasCollapsedPreviewDepth;
      return Math.max(1, Math.min(6, v));
    })();

    const canvasVisibleLatestLevels = (() => {
      const v = Number(draft.canvasVisibleLatestLevels);
      if (!Number.isFinite(v)) return prefs.canvasVisibleLatestLevels;
      return Math.max(0, Math.min(50, v));
    })();

    updatePrefs({
      ...draft,
      quickBranchPresets: cleanedQuickBranchPresets,
      canvasCollapsedPreviewDepth,
      canvasVisibleLatestLevels,
      aiPromptHighQualityThreshold: clampScore(draft.aiPromptHighQualityThreshold, prefs.aiPromptHighQualityThreshold),
      aiImageHighQualityThreshold: clampScore(draft.aiImageHighQualityThreshold, prefs.aiImageHighQualityThreshold),
      aiChatMaxMessages,
      aiChatSystemPrompt: String(draft.aiChatSystemPrompt || '').trim().slice(0, 2000),
      aiChatPresets: cleanedAiChatPresets,
      aiImageAnalysisPrompt: String(draft.aiImageAnalysisPrompt || '').trim().slice(0, 4000),
    });
    toast.success('已保存');
  };

  const handleChange = (field: keyof typeof draft, value: any) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateQuickBranchPreset = (index: number, field: keyof QuickBranchPreset, value: string) => {
    setDraft((prev) => ({
      ...prev,
      quickBranchPresets: prev.quickBranchPresets.map((it, i) => (i === index ? { ...it, [field]: value } : it)),
    }));
  };

  const addQuickBranchPreset = () => {
    setDraft((prev) => ({
      ...prev,
      quickBranchPresets: [...prev.quickBranchPresets, { label: '', value: '' }].slice(0, 24),
    }));
  };

  const removeQuickBranchPreset = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      quickBranchPresets: prev.quickBranchPresets.filter((_, i) => i !== index),
    }));
  };

  const updateAiChatPreset = (index: number, field: keyof AiChatPreset, value: string) => {
    setDraft((prev) => ({
      ...prev,
      aiChatPresets: (prev.aiChatPresets || []).map((it, i) => (i === index ? { ...it, [field]: value } : it)),
    }));
  };

  const addAiChatPreset = () => {
    setDraft((prev) => ({
      ...prev,
      aiChatPresets: [
        ...(prev.aiChatPresets || []),
        { id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title: '', prompt: '' },
      ].slice(0, 24),
    }));
  };

  const removeAiChatPreset = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      aiChatPresets: (prev.aiChatPresets || []).filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="container mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">偏好设置</h1>
          <p className="text-muted-foreground">这里仅保存工作台默认参数；模型与密钥请到“API配置”页面配置（保存在本地浏览器）。</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 外观设置 */}
          <div className="space-y-5 p-5 rounded-xl border bg-card">
            <div>
              <h3 className="font-semibold mb-3">外观</h3>
              
              {/* 深色/浅色模式 */}
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium">显示模式</label>
                <div className="flex gap-2">
                  <button
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border transition-colors",
                      theme === 'light' 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border hover:bg-secondary"
                    )}
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="w-4 h-4" />
                    浅色
                  </button>
                  <button
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border transition-colors",
                      theme === 'dark' 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border hover:bg-secondary"
                    )}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="w-4 h-4" />
                    深色
                  </button>
                </div>
              </div>

              {/* 主题色选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">主题色</label>
                <div className="grid grid-cols-4 gap-2">
                  {ACCENT_COLORS.filter((c) => c.id !== 'slate').map((color) => (
                    <button
                      key={color.id}
                      className={cn(
                        "relative h-12 rounded-lg border-2 transition-all",
                        accentColor === color.id 
                          ? "border-foreground scale-105" 
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color.color }}
                      onClick={() => setAccentColor(color.id)}
                      title={color.name}
                    >
                      {accentColor === color.id && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Check className="w-5 h-5 text-white drop-shadow-md" />
                        </div>
                      )}
                    </button>
                  ))}
                  <button
                    key="custom"
                    className={cn(
                      "relative h-12 rounded-lg border-2 transition-all",
                      accentColor === 'custom'
                        ? "border-foreground scale-105"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: customAccentColor }}
                    onClick={() => setAccentColor('custom')}
                    title="自定义"
                  >
                    <span className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-black/40 text-white backdrop-blur-sm">
                      自定义
                    </span>
                    {accentColor === 'custom' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white drop-shadow-md" />
                      </div>
                    )}
                  </button>
                </div>
                {accentColor === 'custom' && (
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-8 h-9"
                      value={customAccentDraft}
                      onChange={(e) => setCustomAccentDraft(e.target.value)}
                      onBlur={() => setCustomAccentColor(customAccentDraft)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setCustomAccentColor(customAccentDraft);
                        }
                      }}
                      placeholder="#8b5cf6"
                    />
                    <Input
                      className="col-span-4 h-9 px-2"
                      type="color"
                      value={customAccentColor}
                      onChange={(e) => {
                        setCustomAccentColor(e.target.value);
                      }}
                      title="选择颜色"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  当前：{accentColor === 'custom' ? `自定义（${customAccentColor}）` : ACCENT_COLORS.find(c => c.id === accentColor)?.name}
                </p>
              </div>
            </div>
          </div>

          {/* 生成默认值 */}
          <div className="space-y-4 p-5 rounded-xl border bg-card">
            <h3 className="font-semibold">生成默认值</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">默认张数</label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={draft.defaultCount}
                  onChange={(e) => handleChange('defaultCount', Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">默认尺寸</label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.defaultImageSize}
                  onChange={(e) => handleChange('defaultImageSize', e.target.value)}
                >
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">默认比例</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.defaultAspectRatio}
                onChange={(e) => handleChange('defaultAspectRatio', e.target.value)}
              >
                <option value="auto">auto</option>
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>

            <div className="pt-3 border-t border-border space-y-3">
              <h4 className="text-sm font-semibold">画布</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">生成方向</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.canvasGenerateDirection}
                    onChange={(e) =>
                      handleChange('canvasGenerateDirection', e.target.value === 'right' ? 'right' : 'down')
                    }
                  >
                    <option value="down">向下（横向排列）</option>
                    <option value="right">向右（纵向排列）</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">默认继续模式</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.defaultGenerationBaseMode}
                    onChange={(e) =>
                      handleChange('defaultGenerationBaseMode', e.target.value === 'prompt' ? 'prompt' : 'image')
                    }
                  >
                    <option value="image">基于图片</option>
                    <option value="prompt">纯提示词</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(draft.canvasCollapsedPreviewImages)}
                      onChange={(e) => handleChange('canvasCollapsedPreviewImages', e.target.checked)}
                    />
                    收起子树时在父节点显示子树图片
                  </label>
                  <p className="text-xs text-muted-foreground">关闭可降低超大画布的渲染开销。</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">收起预览深度（默认 3 级）</label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={Number(draft.canvasCollapsedPreviewDepth || 3)}
                    onChange={(e) => handleChange('canvasCollapsedPreviewDepth', Number(e.target.value) || 1)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">仅显示最新 N 级（从叶子向上裁剪）</label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={Number(draft.canvasVisibleLatestLevels || 0)}
                  onChange={(e) => handleChange('canvasVisibleLatestLevels', Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  0 = 不限制；&gt;0 仅保留距离叶子最近的 N 级节点，用于超大量节点时的性能/视觉优化。
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-sm font-medium">快速分支预设标签</label>
                <Button size="sm" variant="outline" onClick={addQuickBranchPreset}>
                  添加
                </Button>
              </div>
              <div className="space-y-2">
                {draft.quickBranchPresets.map((p, idx) => (
                  <div key={`${p.label}-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-4 h-9"
                      placeholder="显示名"
                      value={p.label}
                      onChange={(e) => updateQuickBranchPreset(idx, 'label', e.target.value)}
                    />
                    <Input
                      className="col-span-7 h-9"
                      placeholder="追加到提示词的内容"
                      value={p.value}
                      onChange={(e) => updateQuickBranchPreset(idx, 'value', e.target.value)}
                    />
                    <Button
                      className="col-span-1 h-9"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeQuickBranchPreset(idx)}
                      title="删除"
                    >
                      删除
                    </Button>
                  </div>
                ))}
                {!draft.quickBranchPresets.length ? (
                  <div className="text-xs text-muted-foreground">暂无预设标签（你可以点击“添加”创建）</div>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                说明：点击预设标签会创建新分支，并把右侧“追加内容”拼接到当前提示词末尾。
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>保存</Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetPrefs();
                  toast.success('已恢复默认');
                }}
              >
                恢复默认
              </Button>
            </div>
          </div>

          {/* AI 特性 */}
          <div className="space-y-4 p-5 rounded-xl border bg-card">
            <h3 className="font-semibold">AI 特性</h3>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(draft.aiAutoAnalyzeAfterGenerate)}
                  onChange={(e) => handleChange('aiAutoAnalyzeAfterGenerate', e.target.checked)}
                />
                生成后自动分析（标签 / 评分 / 摘要）
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(draft.aiAutoTagPromptAssets)}
                  onChange={(e) => handleChange('aiAutoTagPromptAssets', e.target.checked)}
                />
                新建/更新提示词资产后自动补全 AI 标签
              </label>
              <p className="text-xs text-muted-foreground">
                以上功能需要在「API配置」里填写分析模型的 Key（可与生成模型不同）。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border">
              <div className="space-y-2">
                <label className="text-sm font-medium">提示词优质阈值（0-100）</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.aiPromptHighQualityThreshold}
                  onChange={(e) => handleChange('aiPromptHighQualityThreshold', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">图片优质阈值（0-100）</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.aiImageHighQualityThreshold}
                  onChange={(e) => handleChange('aiImageHighQualityThreshold', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium">图片分析/打分提示词（可选）</label>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                value={String(draft.aiImageAnalysisPrompt || '')}
                onChange={(e) => handleChange('aiImageAnalysisPrompt', e.target.value)}
                placeholder="留空使用默认提示词。自定义时需要求 AI 输出 JSON 格式，包含 caption、overallScore、aestheticScore、promptAlignment.score、tags 等字段。"
              />
              <p className="text-xs text-muted-foreground">
                用于「AI 分析」功能。留空则使用内置默认提示词，自定义时请确保输出 JSON 结构包含 overallScore (0-100)、tags 等字段。
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium">AI 对话系统提示（可选）</label>
              <textarea
                className="w-full min-h-[90px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                value={String(draft.aiChatSystemPrompt || '')}
                onChange={(e) => handleChange('aiChatSystemPrompt', e.target.value)}
                placeholder="例如：你是文生图结果优化助手，请给出改进建议与可直接用于继续生成的提示词。"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(draft.aiChatIncludeHistory)}
                    onChange={(e) => handleChange('aiChatIncludeHistory', e.target.checked)}
                  />
                  对话默认携带历史
                </label>
                <div className="space-y-1">
                  <label className="text-sm font-medium">对话最多保留消息数</label>
                  <Input
                    type="number"
                    min={6}
                    max={80}
                    value={draft.aiChatMaxMessages}
                    onChange={(e) => handleChange('aiChatMaxMessages', Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">AI 对话快捷预设</div>
                  <div className="text-xs text-muted-foreground">在节点图片「AI对话」里一键发送。</div>
                </div>
                <Button size="sm" variant="outline" onClick={addAiChatPreset}>
                  添加
                </Button>
              </div>

              <div className="space-y-3">
                {(draft.aiChatPresets || []).map((p, idx) => (
                  <div key={p.id || idx} className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <Input
                        className="col-span-11 h-9"
                        placeholder="预设名称"
                        value={p.title}
                        onChange={(e) => updateAiChatPreset(idx, 'title', e.target.value)}
                      />
                      <Button
                        className="col-span-1 h-9"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeAiChatPreset(idx)}
                        title="删除"
                      >
                        删除
                      </Button>
                    </div>
                    <textarea
                      className="w-full min-h-[90px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      placeholder="要发送给 AI 的指令 / 提示词"
                      value={p.prompt}
                      onChange={(e) => updateAiChatPreset(idx, 'prompt', e.target.value)}
                    />
                    <div className="text-[11px] text-muted-foreground">
                      提示：建议在结尾要求输出“改进后提示词：...”方便直接拿来生成。
                    </div>
                  </div>
                ))}
                {!(draft.aiChatPresets || []).length ? (
                  <div className="text-xs text-muted-foreground">暂无预设（你可以点击“添加”创建）</div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>保存</Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetPrefs();
                  toast.success('已恢复默认');
                }}
              >
                恢复默认
              </Button>
            </div>
          </div>

          <div className="space-y-3 p-5 rounded-xl border bg-card">
            <h3 className="font-semibold">数据</h3>
            <p className="text-sm text-muted-foreground">导出/导入图片库、提示词库和画布数据。</p>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/backup')}
            >
              <HardDrive className="w-4 h-4" />
              数据备份
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold mb-2">说明</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li>“默认张数/尺寸/比例”仅影响新建节点与画布双击创建节点的默认值。</li>
              <li>每个节点可在右侧面板单独调整并保存。</li>
              <li>生成与分析模型、API Key 等在 `API配置` 页面配置并保存在本地浏览器。</li>
            </ul>
          </div>

          {/* 快捷键 */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold mb-3">画布快捷键</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4 py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">双击空白</span>
                <span className="font-medium">新建节点</span>
              </div>
              <div className="flex justify-between gap-4 py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Ctrl/⌘ + Enter</span>
                <span className="font-medium">生成</span>
              </div>
              <div className="flex justify-between gap-4 py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Ctrl/⌘ + D</span>
                <span className="font-medium">复制节点</span>
              </div>
              <div className="flex justify-between gap-4 py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Delete</span>
                <span className="font-medium">删除节点</span>
              </div>
              <div className="flex justify-between gap-4 py-1.5">
                <span className="text-muted-foreground">滚轮</span>
                <span className="font-medium">缩放画布</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
