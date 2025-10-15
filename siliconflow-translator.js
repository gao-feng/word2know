// 硅基流动翻译服务
class SiliconFlowTranslator {
  constructor() {
    this.apiKey = '';
    this.baseUrl = 'https://api.siliconflow.cn/v1/chat/completions';
    this.model = 'Qwen/Qwen2.5-7B-Instruct';
    this.cache = new Map();
    this.loadApiKey();
  }

  // 从存储中加载API密钥
  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['siliconFlowApiKey']);
      this.apiKey = result.siliconFlowApiKey || '';
    } catch (error) {
      console.error('加载硅基流动API密钥失败:', error);
    }
  }

  // 设置API密钥
  async setApiKey(apiKey) {
    this.apiKey = apiKey;
    try {
      await chrome.storage.sync.set({ siliconFlowApiKey: apiKey });
    } catch (error) {
      console.error('保存硅基流动API密钥失败:', error);
    }
  }

  // 翻译文本
  async translate(text, targetLang = 'zh') {
    if (!text || !text.trim()) {
      throw new Error('翻译文本不能为空');
    }

    if (!this.apiKey) {
      throw new Error('请先设置硅基流动API密钥');
    }

    const cleanText = text.trim();
    const cacheKey = `${cleanText}_${targetLang}`;

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
      console.error('硅基流动翻译失败:', error);
      throw error;
    }
  }

  // 调用硅基流动API
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
      max_tokens: 1000,
      stream: false
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
      "englishExample": "英文例句",
      "chineseExample": "中文例句翻译"
    }
  ],
  "synonyms": ["同义词1", "同义词2"],
  "phrases": ["常用短语1", "常用短语2"]
}

注意：
1. 如果是单词，请提供音标；如果是短语，请提供发音指导
2. 提供2-3个主要释义即可
3. 同义词和常用短语各提供2-3个即可
4. 每个释义都要提供英文例句和对应的中文翻译
5. 英文例句要简洁实用，便于学习
6. 只返回JSON格式，不要其他说明文字`;
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
        source: 'SiliconFlow'
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
        source: 'SiliconFlow'
      };
    }
  }

  // 检查API密钥是否有效
  async validateApiKey(apiKey = null) {
    const keyToTest = apiKey || this.apiKey;
    
    if (!keyToTest) {
      return { valid: false, error: 'API密钥为空' };
    }

    try {
      const testResult = await this.callTranslationAPI('hello', 'zh');
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
  module.exports = SiliconFlowTranslator;
} else {
  window.SiliconFlowTranslator = SiliconFlowTranslator;
}