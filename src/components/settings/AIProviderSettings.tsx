import { useState, useEffect } from 'react';
import { useSettingsStore, useSettingsActions } from '../../stores/settings.store';
import { AIProviderFactory } from '../../core/providers';
import { Button } from '../ui/button';
import { useT } from '../../i18n';
import { Settings2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { validateGeminiKey, validateOllamaUrl, sanitizeSettingValue } from '../../lib/validators';

export function AIProviderSettings() {
  const settings = useSettingsStore();
  const actions = useSettingsActions();
  const t = useT();
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [valErrors, setValErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setTestStatus('idle');
    setTestMessage('');
  }, [settings.activeAiProvider]);

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
      <div className="flex gap-4 p-1 bg-muted rounded-lg w-max mb-6">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => actions.setActiveAiProvider(p.id)}
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

      <div className="bg-card border rounded-lg p-6">
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

        <div className="col-span-full border-t border-border mt-4 pt-6 space-y-6">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            {t('settings.general.title')}
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-sm font-medium leading-none">
                {t('settings.general.catLang')}
              </label>
              <div className="flex gap-1 p-1 bg-muted rounded-lg w-max">
                <button
                  onClick={() => actions.setCategoryLanguage('zh')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    settings.categoryLanguage === 'zh'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('settings.general.catLangZh')}
                </button>
                <button
                  onClick={() => actions.setCategoryLanguage('en')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    settings.categoryLanguage === 'en'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('settings.general.catLangEn')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('settings.general.catLangTip')}
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  {t('settings.general.concurrency', { count: settings.maxConcurrency })}
                </label>
              </div>
              <div className="flex items-center gap-4 max-w-sm px-1 py-1">
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={settings.maxConcurrency}
                  onChange={(e) => actions.setMaxConcurrency(parseInt(e.target.value, 10))}
                  className="flex-1 w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/60 px-1">
                <span>1</span>
                <span>15</span>
                <span>30</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                {t('settings.general.concurTip')}
              </p>
            </div>
          </div>
        </div>

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
    </div>
  );
}
