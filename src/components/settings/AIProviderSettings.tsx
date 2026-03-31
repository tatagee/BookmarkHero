import { useState, useEffect } from 'react';
import { useSettingsStore, useSettingsActions } from '../../stores/settings.store';
import { AIProviderFactory } from '../../core/providers';
import { Button } from '../ui/button';

export function AIProviderSettings() {
  const settings = useSettingsStore();
  const actions = useSettingsActions();
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Clear test state when provider changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTestStatus('idle');
     
    setTestMessage('');
  }, [settings.activeAiProvider]);

  const providers = AIProviderFactory.getAvailableProviders();

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('测试连接中...');
    
    try {
      const provider = AIProviderFactory.createProvider(settings.activeAiProvider);
      const isOk = await provider.isAvailable();
      
      if (isOk) {
        setTestStatus('success');
        setTestMessage('连接成功！AI 引擎已准备就绪。');
      } else {
        setTestStatus('error');
        setTestMessage(
          settings.activeAiProvider === 'gemini-cloud'
            ? '连接失败，请检查 API Key 是否有效及网络状况。'
            : '连接失败，请确认本地 Ollama 服务已启动且允许跨域请求。'
        );
      }
    } catch (err) {
       setTestStatus('error');
       setTestMessage(`探测出现异常: ${err instanceof Error ? err.message : String(err)}`);
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
                onChange={(e) => actions.setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full sm:max-w-md flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-2">
                密钥仅保存在您的浏览器本地，不会上传到我们的服务器。<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-primary">获取免费 API Key</a>
              </p>
            </div>
          </div>
        )}

        {settings.activeAiProvider === 'ollama' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ollama 服务地址</label>
              <input 
                type="text" 
                value={settings.ollamaUrl} 
                onChange={(e) => actions.setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full sm:max-w-md flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">使用模型 (Model)</label>
              <input 
                type="text" 
                value={settings.ollamaModel} 
                onChange={(e) => actions.setOllamaModel(e.target.value)}
                placeholder="llama3"
                className="w-full sm:max-w-xs flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-2">
                需预先在终端执行 `ollama run 模型名`。推荐使用 llama3 或 qwen2。
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t flex items-center gap-4">
          <Button 
            onClick={handleTestConnection} 
            disabled={testStatus === 'testing' || (settings.activeAiProvider === 'gemini-cloud' && !settings.geminiApiKey)}
          >
            {testStatus === 'testing' ? '测试中...' : '测试连接'}
          </Button>
          
          {testStatus !== 'idle' && (
            <span className={`text-sm ${
              testStatus === 'success' ? 'text-green-600' : 
              testStatus === 'error' ? 'text-red-500' : 'text-muted-foreground'
            }`}>
              {testMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
