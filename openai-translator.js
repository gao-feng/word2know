// OpenAI API兼容翻译服务
class OpenAITranslator {
  constructor() {
    this.apiKey = '';
    this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo';
    this.cache = new Map();
    this.loadSettings();
  }

  // 从存储中加载设置
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'openaiApiKey', 
        'openaiBaseUrl', 
        'openaiModel'
      ]);
      this.apiKey = result.openaiApiKey || '';
      this.baseUrl = result.openaiBaseUrl || 'https://api.openai.com/v1/chat/completions';
      this.model = result.openaiModel || 'gpt-3.5-turbo';
    } catch (error) {
      console.error('加载OpenAI设置失败:', error);
    }
  }

  // 设置API配置
  async setConfig(config) {
    this.apiKey = config.apiKey || this.apiKey;
    this.baseUrl = config.baseUrl || this.baseUrl;
    this.model = config.model || this.model;
    
    try {
      await chrome.storage.sync.set({
        openaiApiKey: this.apiKey,
        openaiBaseUrl: this.baseUrl,
        openaiModel: this.model
      });
    } catch (error) {
      console.error('保存OpenAI设置失败:', error);
    }
  }

  // 翻译文本
  async translate(text, targetLang = 'zh') {
    if (!text || !text.trim()) {
      throw new Error('翻译文本不能为空');
    }

    if (!this.apiKey) {
      throw new Error('请先设置OpenAI API密钥');
    }

    const cleanText = text.trim();
    const cacheKey = `${cleanText}_${targetLang}_${this.model}`;

    // 检查缓存
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const result = await this.callTranslationAPI(cleanText, targetLang);
      
      // 缓存结果
      this.cache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('OpenAI翻译失败:', error);
      throw error;
    }
  }

  // 调用OpenAI API
  async callTranslationAPI(text, targetLang) {
    const prompt = this.buildTranslationPrompt(text, targetLang);
    
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API请求失败: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API返回数据格式错误');
    }

    const content = data.choices[0].message.content;
    return this.parseTranslationResponse(content, text);
  }

  // 构建翻译提示词
  buildTranslationPrompt(text, targetLang) {
    const langMap = {
      'zh': '中文',
      'en': '英文',
      'ja': '日文',
      'ko': '韩文',
      'fr': '法文',
      'de': '德文',
      'es': '西班牙文',
      'ru': '俄文'
    };

    const targetLanguage = langMap[targetLang] || '中文';
    
    return `请将以下英文单词或短语翻译成${targetLanguage}，并提供详细的释义信息。

要翻译的内容：${text}

请按照以下JSON格式返回结果：
{
  "word": "原文",
  "translation": "主要翻译",
  "pronunciation": "音标或发音",
  "definitions": [
    {
      "partOfSpeech": "词性",
      "meaning": "释义",
      "example": "例句"
    }
  ],
  "synonyms": ["同义词1", "同义词2"],
  "phrases": ["常用短语1", "常用短语2"]
}

注意：
1. 如果是单词，请提供音标；如果是短语，请提供发音指导
2. 提供2-3个主要释义即可
3. 同义词和常用短语各提供2-3个即可
4. 例句要简洁明了
5. 只返回JSON格式，不要其他说明文字`;
  }

  // 解析翻译响应
  parseTranslationResponse(content, originalText) {
    try {
      // 尝试解析JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('未找到有效的JSON响应');
      }

      const data = JSON.parse(jsonMatch[0]);
      
      return {
        word: data.word || originalText,
        translation: data.translation || '翻译失败',
        pronunciation: data.pronunciation || `/${originalText}/`,
        definitions: data.definitions || [],
        synonyms: data.synonyms || [],
        phrases: data.phrases || [],
        source: 'OpenAI'
      };
    } catch (error) {
      console.error('解析翻译响应失败:', error);
      
      // 如果JSON解析失败，尝试提取基本翻译
      const lines = content.split('\n').filter(line => line.trim());
      let translation = '翻译失败';
      
      for (const line of lines) {
        if (line.includes('翻译') || line.includes('意思') || line.includes('：')) {
          const parts = line.split(/[：:]/);
          if (parts.length > 1) {
            translation = parts[1].trim();
            break;
          }
        }
      }
      
      return {
        word: originalText,
        translation: translation,
        pronunciation: `/${originalText}/`,
        definitions: [],
        synonyms: [],
        phrases: [],
        source: 'OpenAI'
      };
    }
  }

  // 检查API配置是否有效
  async validateConfig(config = null) {
    const testConfig = config || {
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.model
    };
    
    if (!testConfig.apiKey) {
      return { valid: false, error: 'API密钥为空' };
    }

    if (!testConfig.baseUrl) {
      return { valid: false, error: 'API地址为空' };
    }

    try {
      // 临时设置配置进行测试
      const originalConfig = {
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model
      };

      this.apiKey = testConfig.apiKey;
      this.baseUrl = testConfig.baseUrl;
      this.model = testConfig.model;

      const testResult = await this.callTranslationAPI('hello', 'zh');
      
      // 恢复原配置
      this.apiKey = originalConfig.apiKey;
      this.baseUrl = originalConfig.baseUrl;
      this.model = originalConfig.model;

      return { valid: true, result: testResult };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // 获取支持的语言列表
  getSupportedLanguages() {
    return [
      { code: 'zh', name: '中文' },
      { code: 'en', name: '英文' },
      { code: 'ja', name: '日文' },
      { code: 'ko', name: '韩文' },
      { code: 'fr', name: '法文' },
      { code: 'de', name: '德文' },
      { code: 'es', name: '西班牙文' },
      { code: 'ru', name: '俄文' }
    ];
  }

  // 获取常用的OpenAI兼容服务提供商
  getCommonProviders() {
    return [
      {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo-preview']
      },
      {
        name: 'Azure OpenAI',
        baseUrl: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-12-01-preview',
        models: ['gpt-35-turbo', 'gpt-4']
      },
      {
        name: 'Deepseek',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        models: ['deepseek-chat', 'deepseek-coder']
      },
      {
        name: 'Moonshot',
        baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
      },
      {
        name: 'Zhipu AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        models: ['glm-4', 'glm-3-turbo']
      }
    ];
  }

  // 清除缓存
  clearCache() {
    this.cache.clear();
  }

  // 获取缓存统计
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpenAITranslator;
} else {
  window.OpenAITranslator = OpenAITranslator;
}