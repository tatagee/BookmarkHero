import { useState, useMemo } from 'react';
import { useSettingsStore, useSettingsActions } from '../../stores/settings.store';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { AIProviderFactory } from '../../core/providers';
import { Button } from '../ui/button';
import { useT } from '../../i18n';
import { Settings2, Loader2, CheckCircle2, AlertCircle, Sliders } from 'lucide-react';
import { validateGeminiKey, validateOllamaUrl, sanitizeSettingValue } from '../../lib/validators';

export function AIProviderSettings() {
  const settings = useSettingsStore();
  const actions = useSettingsActions();
  const tree = useBookmarkStore((state) => state.tree);
  const t = useT();
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [valErrors, setValErrors] = useState<Record<string, string>>({});

  // 计算当前用户自建的一级文件夹数量
  const currentFolderCount = useMemo(() => {
    const allRootNodes = tree[0]?.children || [];
    let count = 0;
    for (const root of allRootNodes) {
      for (const child of root.children || []) {
        if (!child.url) count++;
      }
    }
    return count;
  }, [tree]);


  const providers = AIProviderFactory.getAvailableProviders();

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage(t('settings.test.testing'));
    
    try {
      const provider = AIProviderFactory.createProvider(settings.activeAiProvider);
      const isOk = await provider.isAvailable();
      
      if (isOk) {
        setTestStatus('success');
        setTestMessage(t('settings.test.success'));
      } else {
        setTestStatus('error');
        setTestMessage(
          settings.activeAiProvider === 'gemini-cloud'
            ? t('settings.test.failGemini')
            : t('settings.test.failOllama')
        );
      }
    } catch (err) {
       setTestStatus('error');
       setTestMessage(t('settings.test.failException', { err: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <div className="space-y-6">

      {/* ──────────────── 上半部分：模型连接 ──────────────── */}
      <div className="bg-card border rounded-lg p-6">
        <h4 className="text-sm font-semibold flex items-center gap-2 mb-5">
          <Settings2 className="w-4 h-4 text-primary" />
          {settings.activeAiProvider === 'gemini-cloud' ? 'Gemini API' : 'Ollama'} — {t('settings.test.btn')}
        </h4>

        {/* Provider 切换 Tab */}
        <div className="flex gap-4 p-1 bg-muted rounded-lg w-max mb-6">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                actions.setActiveAiProvider(p.id);
                setTestStatus('idle');
                setTestMessage('');
              }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                settings.activeAiProvider === p.id 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Gemini 配置 */}
        {settings.activeAiProvider === 'gemini-cloud' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Gemini API Key</label>
              <input 
                type="password" 
                value={settings.geminiApiKey} 
                onChange={(e) => {
                  const val = sanitizeSettingValue(e.target.value);
                  actions.setGeminiApiKey(val);
                  if (val && !validateGeminiKey(val)) {
                    setValErrors(p => ({...p, geminiKey: 'API Key 格式不正确 / Invalid format'}));
                  } else {
                    setValErrors(p => ({...p, geminiKey: ''}));
                  }
                }}
                placeholder="YOUR_API_KEY"
                className={`w-full sm:max-w-md flex h-9 rounded-md border ${valErrors.geminiKey ? 'border-destructive' : 'border-input'} bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
              />
              {valErrors.geminiKey && <p className="text-xs text-destructive mt-1">{valErrors.geminiKey}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.gemini.keyTip')} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-primary">{t('settings.gemini.keyLink')}</a>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.gemini.model')}</label>
              <input 
                type="text" 
                value={settings.geminiModel} 
                onChange={(e) => actions.setGeminiModel(e.target.value)}
                placeholder="gemini-flash-lite-latest"
                className="w-full sm:max-w-xs flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.gemini.modelTip')}
              </p>
            </div>
          </div>
        )}

        {/* Ollama 配置 */}
        {settings.activeAiProvider === 'ollama' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.ollama.url')}</label>
              <input 
                type="text" 
                value={settings.ollamaUrl} 
                onChange={(e) => {
                  const val = sanitizeSettingValue(e.target.value);
                  actions.setOllamaUrl(val);
                  if (val && !validateOllamaUrl(val)) {
                    setValErrors(p => ({...p, ollamaUrl: 'URL 格式不正确 / Invalid URL'}));
                  } else {
                    setValErrors(p => ({...p, ollamaUrl: ''}));
                  }
                }}
                placeholder="http://localhost:11434"
                className={`w-full sm:max-w-md flex h-9 rounded-md border ${valErrors.ollamaUrl ? 'border-destructive' : 'border-input'} bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
              />
              {valErrors.ollamaUrl && <p className="text-xs text-destructive mt-1">{valErrors.ollamaUrl}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.ollama.model')}</label>
              <input 
                type="text" 
                value={settings.ollamaModel} 
                onChange={(e) => actions.setOllamaModel(e.target.value)}
                placeholder="llama3"
                className="w-full sm:max-w-xs flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.ollama.modelTip')}
              </p>
            </div>
          </div>
        )}

        {/* 测试连接按钮 */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Button
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
            className="w-full sm:w-auto min-w-[120px]"
            variant="outline"
          >
            {testStatus === 'testing' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('settings.test.testing')}</>
            ) : (
              t('settings.test.btn')
            )}
          </Button>

          {testStatus !== 'idle' && (
            <div className={`text-sm flex items-center gap-2 animate-in fade-in ${
              testStatus === 'success' ? 'text-emerald-500' : 
              testStatus === 'testing' ? 'text-muted-foreground' : 'text-destructive'
            }`}>
              {testStatus === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {testStatus === 'error' && <AlertCircle className="w-4 h-4" />}
              {testMessage}
            </div>
          )}
        </div>
      </div>

      {/* ──────────────── 下半部分：分类偏好 ──────────────── */}
      <div className="bg-card border rounded-lg p-6">
        <h4 className="text-sm font-semibold flex items-center gap-2 mb-5">
          <Sliders className="w-4 h-4 text-primary" />
          {t('settings.prefsTitle')}
        </h4>

        <div className="space-y-3">
          {/* 分类语言 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
            <div className="flex-1 pr-2">
              <label className="text-[13px] font-semibold">{t('settings.general.catLang')}</label>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {t('settings.general.catLangTip')}
              </p>
            </div>
            <div className="flex gap-1 p-0.5 bg-muted rounded-lg shrink-0">
              <button
                onClick={() => actions.setCategoryLanguage('zh')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  settings.categoryLanguage === 'zh'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('settings.general.catLangZh')}
              </button>
              <button
                onClick={() => actions.setCategoryLanguage('en')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  settings.categoryLanguage === 'en'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('settings.general.catLangEn')}
              </button>
            </div>
          </div>

          {/* 最大分类层数 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
            <div className="flex-1 pr-2">
              <label className="text-[13px] font-semibold">{t('settings.general.maxDepth')}</label>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {t('settings.general.maxDepthTip')}
              </p>
            </div>
            <div className="flex gap-1 p-0.5 bg-muted rounded-lg shrink-0">
              <button
                onClick={() => actions.setMaxCategoryDepth(1)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  settings.maxCategoryDepth === 1
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('settings.general.maxDepth1')}
              </button>
              <button
                onClick={() => actions.setMaxCategoryDepth(2)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  settings.maxCategoryDepth === 2
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('settings.general.maxDepth2')}
              </button>
            </div>
          </div>

          {/* 最大分类数量 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
            <div className="flex-1 pr-2">
              <label className="text-[13px] font-semibold">
                {t('settings.general.maxCount', { count: settings.maxCategoryCount })}
              </label>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {t('settings.general.maxCountTip')}
              </p>
              {currentFolderCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('settings.general.currentFolderCount', { count: currentFolderCount })}
                </p>
              )}
              {settings.maxCategoryCount < currentFolderCount && (
                <p className="text-[11px] text-red-500 font-medium mt-1">
                  {t('settings.general.maxCountWarning', { current: currentFolderCount })}
                </p>
              )}
            </div>
            <div className="w-full sm:w-40 shrink-0 flex flex-col pt-1 sm:pt-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">10</span>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="1"
                  value={settings.maxCategoryCount}
                  onChange={(e) => actions.setMaxCategoryCount(parseInt(e.target.value, 10))}
                  className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground">50</span>
              </div>
            </div>
          </div>
          
          {/* 最大并发 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card">
            <div className="flex-1 pr-2">
              <label className="text-[13px] font-semibold">
                {t('settings.general.concurrency', { count: settings.maxConcurrency })}
              </label>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                {t('settings.general.concurTip')}
              </p>
            </div>
            <div className="w-full sm:w-40 shrink-0 flex flex-col pt-1 sm:pt-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">1</span>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={settings.maxConcurrency}
                  onChange={(e) => actions.setMaxConcurrency(parseInt(e.target.value, 10))}
                  className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground">30</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
