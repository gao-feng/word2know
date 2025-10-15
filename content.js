// 英文悬浮翻译插件
class WordTranslator {
  constructor() {
    this.tooltip = null;
    this.translateButton = null;
    this.currentWord = '';
    this.isLoading = false;
    this.cache = new Map();
    this.settings = {
      enabled: true,
      autoSpeak: false,
      translationService: 'google', // 默认使用Google翻译
      clipboardEnabled: true // 默认启用剪切板监听
    };
    this.selectedText = '';
    this.selectionRect = null;
    this.siliconFlowTranslator = new SiliconFlowTranslator();
    this.openaiTranslator = new OpenAITranslator();
    this.lastClipboardContent = '';
    this.clipboardCheckInterval = null;
    this.init();
  }

  init() {
    this.loadSettings();
    this.createTooltip();
    this.createTranslateButton();
    this.bindEvents();
    this.listenForMessages();
    this.initClipboardMonitoring();
  }

  loadSettings() {
    chrome.storage.sync.get(['enabled', 'autoSpeak', 'translationService', 'clipboardEnabled'], (result) => {
      this.settings.enabled = result.enabled !== false;
      this.settings.autoSpeak = result.autoSpeak === true;
      this.settings.translationService = result.translationService || 'google';
      this.settings.clipboardEnabled = result.clipboardEnabled !== false;

      // 根据设置启动或停止剪切板监听
      if (this.settings.clipboardEnabled) {
        this.startClipboardMonitoring();
      } else {
        this.stopClipboardMonitoring();
      }
    });
  }

  listenForMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'updateSettings') {
        Object.assign(this.settings, message.settings);

        // 如果剪切板设置发生变化，更新监听状态
        if ('clipboardEnabled' in message.settings) {
          if (message.settings.clipboardEnabled) {
            this.startClipboardMonitoring();
          } else {
            this.stopClipboardMonitoring();
          }
        }
      } else if (message.action === 'updateSiliconFlowApiKey') {
        this.siliconFlowTranslator.setApiKey(message.apiKey);
      } else if (message.action === 'updateOpenAIConfig') {
        this.openaiTranslator.setConfig(message.config);
      }
    });
  }

  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'word-translator-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
  }

  createTranslateButton() {
    this.translateButton = document.createElement('button');
    this.translateButton.className = 'translate-trigger-btn';
    this.translateButton.innerHTML = '🌐';
    this.translateButton.title = '翻译选中文本';
    this.translateButton.style.display = 'none';
    document.body.appendChild(this.translateButton);

    this.translateButton.onclick = (e) => {
      e.stopPropagation();
      this.handleTranslateClick();
    };
  }

  bindEvents() {
    document.addEventListener('mouseup', this.handleTextSelection.bind(this));
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));

    // 监听页面获得焦点事件，用于检查剪切板
    window.addEventListener('focus', this.checkClipboard.bind(this));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkClipboard();
      }
    });
  }

  handleTextSelection(event) {
    if (!this.settings.enabled) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && this.isEnglishWord(selectedText)) {
        this.selectedText = selectedText;
        this.showTranslateButton(selection);
      } else {
        this.hideTranslateButton();
      }
    }, 10); // 短暂延迟确保选择完成
  }

  handleSelectionChange() {
    if (!this.settings.enabled) return;

    const selection = window.getSelection();
    if (selection.isCollapsed) {
      this.hideTranslateButton();
    }
  }

  handleClick(event) {
    // 如果点击的不是tooltip或翻译按钮，则隐藏所有UI
    if (!this.tooltip.contains(event.target) &&
      !this.translateButton.contains(event.target)) {
      this.hideTooltip();
      this.hideTranslateButton();
    }
  }

  handleTranslateClick() {
    if (this.selectedText) {
      const rect = this.selectionRect;
      if (rect) {
        this.currentWord = this.selectedText;
        this.showTooltip(rect.right + 10, rect.top);
        this.translateWord(this.selectedText);
        this.hideTranslateButton();
      }
    }
  }

  showTranslateButton(selection) {
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.selectionRect = rect;

    // 定位翻译按钮到选中文本附近
    const buttonX = rect.right + 5;
    const buttonY = rect.top - 5;

    this.translateButton.style.left = buttonX + 'px';
    this.translateButton.style.top = buttonY + 'px';
    this.translateButton.style.display = 'block';
  }

  hideTranslateButton() {
    this.translateButton.style.display = 'none';
    this.selectedText = '';
    this.selectionRect = null;
  }

  isEnglishWord(word) {
    if (!word || typeof word !== 'string') return false;

    // 支持单词和短语（包含空格）
    const cleanWord = word.trim();

    // 检查是否包含英文字母，长度大于1，小于100
    const hasEnglish = /[a-zA-Z]/.test(cleanWord);
    const isValidLength = cleanWord.length > 1 && cleanWord.length < 100;

    // 允许字母、空格、连字符和撇号
    const isValidChars = /^[a-zA-Z\s\-']+$/.test(cleanWord);

    if (!hasEnglish || !isValidLength || !isValidChars) return false;

    // 过滤掉一些常见的无意义字符串
    const skipWords = ['www', 'http', 'https', 'com', 'org', 'net', 'html', 'css', 'js'];
    if (skipWords.includes(cleanWord.toLowerCase())) return false;

    return true;
  }

  showTooltip(x, y) {
    this.tooltip.style.display = 'block';
    this.tooltip.innerHTML = '<div class="loading">翻译中...</div>';
    // 设置tooltip位置，之后不再改变
    this.updateTooltipPosition(x, y);
  }

  hideTooltip() {
    this.tooltip.style.display = 'none';
    this.tooltip.classList.remove('clipboard-tooltip');
    this.currentWord = '';
  }

  updateTooltipPosition(x, y) {
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + 10;
    let top = y + 10;

    // 防止tooltip超出视窗
    if (left + tooltipRect.width > viewportWidth) {
      left = x - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > viewportHeight) {
      top = y - tooltipRect.height - 10;
    }

    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
  }

  async translateWord(word) {
    if (this.isLoading) return;

    // 检查缓存
    if (this.cache.has(word.toLowerCase())) {
      this.displayTranslation(this.cache.get(word.toLowerCase()));
      return;
    }

    this.isLoading = true;

    try {
      const translation = await this.fetchTranslation(word);
      this.cache.set(word.toLowerCase(), translation);

      if (this.currentWord === word) {
        this.displayTranslation(translation);
      }
    } catch (error) {
      console.error('翻译失败:', error);
      if (this.currentWord === word) {
        this.tooltip.innerHTML = '<div class="error">翻译失败</div>';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async fetchTranslation(word) {
    switch (this.settings.translationService) {
      case 'siliconflow':
        return await this.fetchSiliconFlowTranslation(word);
      case 'openai':
        return await this.fetchOpenAITranslation(word);
      case 'google':
      default:
        return await this.fetchGoogleTranslation(word);
    }
  }

  async fetchSiliconFlowTranslation(word) {
    try {
      const result = await this.siliconFlowTranslator.translate(word, 'zh');
      return {
        word: result.word,
        translation: result.translation,
        pronunciation: result.pronunciation,
        definitions: result.definitions,
        synonyms: result.synonyms,
        phrases: result.phrases,
        source: 'SiliconFlow'
      };
    } catch (error) {
      console.error('硅基流动翻译失败:', error);
      // 如果硅基流动失败，回退到Google翻译
      return await this.fetchGoogleTranslation(word);
    }
  }

  async fetchOpenAITranslation(word) {
    try {
      const result = await this.openaiTranslator.translate(word, 'zh');
      return {
        word: result.word,
        translation: result.translation,
        pronunciation: result.pronunciation,
        definitions: result.definitions,
        synonyms: result.synonyms,
        phrases: result.phrases,
        source: 'OpenAI'
      };
    } catch (error) {
      console.error('OpenAI翻译失败:', error);
      // 如果OpenAI失败，回退到Google翻译
      return await this.fetchGoogleTranslation(word);
    }
  }

  async fetchGoogleTranslation(word) {
    // 使用Google翻译API的简化版本（备用方案）
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh&dt=t&dt=bd&dj=1&q=${encodeURIComponent(word)}`;

    const response = await fetch(url);
    const data = await response.json();

    let translation = '';
    let pronunciation = '';
    let definitions = [];

    if (data.sentences && data.sentences[0]) {
      translation = data.sentences[0].trans;
    }

    if (data.dict && data.dict[0] && data.dict[0].entry) {
      const entries = data.dict[0].entry.slice(0, 3); // 取前3个释义
      translation = entries.map(entry => entry.word).join('; ');

      // 为Google翻译创建简单的定义结构，包含英文例句
      definitions = entries.map(entry => ({
        partOfSpeech: entry.pos || '',
        meaning: entry.word || '',
        englishExample: this.generateSimpleExample(word, entry.pos),
        chineseExample: this.translateSimpleExample(word, entry.word)
      }));
    }

    // 如果没有词典数据，创建基本定义
    if (definitions.length === 0) {
      definitions = [{
        partOfSpeech: '',
        meaning: translation,
        englishExample: this.generateSimpleExample(word),
        chineseExample: `这个例句展示了"${word}"的用法。`
      }];
    }

    // 获取发音（简化处理）
    pronunciation = `/${word}/`; // 实际应用中可以集成更好的发音API

    return {
      word,
      translation: translation || '未找到翻译',
      pronunciation,
      definitions,
      source: 'Google'
    };
  }

  // 生成简单的英文例句
  generateSimpleExample(word, partOfSpeech = '') {
    const examples = {
      // 动词例句
      verb: [
        `I ${word} every day.`,
        `She likes to ${word}.`,
        `We should ${word} more often.`,
        `They ${word} together.`
      ],
      // 名词例句
      noun: [
        `This is a beautiful ${word}.`,
        `The ${word} is very important.`,
        `I need a new ${word}.`,
        `She bought a ${word}.`
      ],
      // 形容词例句
      adjective: [
        `It looks very ${word}.`,
        `She is ${word} today.`,
        `The weather is ${word}.`,
        `This book is ${word}.`
      ],
      // 副词例句
      adverb: [
        `He speaks ${word}.`,
        `She works ${word}.`,
        `They move ${word}.`,
        `It happens ${word}.`
      ]
    };

    // 根据词性选择例句模板
    let templates = [];
    if (partOfSpeech) {
      const pos = partOfSpeech.toLowerCase();
      if (pos.includes('verb') || pos.includes('动词')) {
        templates = examples.verb;
      } else if (pos.includes('noun') || pos.includes('名词')) {
        templates = examples.noun;
      } else if (pos.includes('adj') || pos.includes('形容词')) {
        templates = examples.adjective;
      } else if (pos.includes('adv') || pos.includes('副词')) {
        templates = examples.adverb;
      }
    }

    // 如果没有匹配的词性，使用通用例句
    if (templates.length === 0) {
      templates = [
        `The word "${word}" is commonly used.`,
        `Here is an example with "${word}".`,
        `You can use "${word}" in this context.`,
        `This sentence contains "${word}".`
      ];
    }

    // 随机选择一个例句模板
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // 翻译简单例句
  translateSimpleExample(word, meaning) {
    const commonTranslations = {
      'every day': '每天',
      'likes to': '喜欢',
      'should': '应该',
      'more often': '更经常',
      'together': '一起',
      'beautiful': '美丽的',
      'very important': '非常重要',
      'need': '需要',
      'bought': '买了',
      'looks': '看起来',
      'today': '今天',
      'weather': '天气',
      'book': '书',
      'speaks': '说话',
      'works': '工作',
      'move': '移动',
      'happens': '发生'
    };

    // 简单的例句翻译逻辑
    return `这是一个包含"${meaning}"的中文例句。`;
  }

  displayTranslation(data) {
    let html = `
      <div class="translation-content">
        <div class="word-header">
          <span class="word">${data.word}</span>
          <button class="play-btn">🔊</button>
          <button class="add-word-btn" title="添加到生词表">⭐</button>
          <button class="close-btn">✕</button>
        </div>
        <div class="pronunciation">${data.pronunciation}</div>
        <div class="translation">${data.translation}</div>
    `;

    // 如果有详细定义（硅基流动返回的数据）
    if (data.definitions && data.definitions.length > 0) {
      html += `<div class="definitions">
        <strong>详细释义：</strong>
        <ul>`;

      data.definitions.slice(0, 3).forEach(def => {
        html += `<li>`;
        if (def.partOfSpeech) {
          html += `<em class="part-of-speech">${def.partOfSpeech}</em> `;
        }
        html += `${def.meaning}`;

        // 显示英文例句和中文例句
        if (def.englishExample || def.chineseExample) {
          html += `<div class="examples">`;
          if (def.englishExample) {
            html += `<div class="english-example">📝 ${def.englishExample}</div>`;
          }
          if (def.chineseExample) {
            html += `<div class="chinese-example">🔤 ${def.chineseExample}</div>`;
          }
          html += `</div>`;
        } else if (def.example) {
          // 兼容旧格式
          html += `<br><span class="example">例：${def.example}</span>`;
        }
        html += `</li>`;
      });

      html += `</ul></div>`;
    }

    // 如果有同义词
    if (data.synonyms && data.synonyms.length > 0) {
      html += `<div class="synonyms">
        <strong>同义词：</strong>${data.synonyms.slice(0, 3).join(', ')}
      </div>`;
    }

    // 如果有常用短语
    if (data.phrases && data.phrases.length > 0) {
      html += `<div class="phrases">
        <strong>常用短语：</strong>${data.phrases.slice(0, 3).join(', ')}
      </div>`;
    }

    // 显示翻译来源
    if (data.source) {
      html += `<div class="translation-source">来源：${data.source}</div>`;
    }

    html += `<div class="tooltip-hint">点击 ✕ 按钮或外部区域关闭</div></div>`;

    this.tooltip.innerHTML = html;

    // 绑定发音按钮事件
    const playBtn = this.tooltip.querySelector('.play-btn');
    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        this.speakWord(data.word);
      };
    }

    // 绑定添加生词按钮事件
    const addWordBtn = this.tooltip.querySelector('.add-word-btn');
    if (addWordBtn) {
      addWordBtn.onclick = (e) => {
        e.stopPropagation();
        this.addToVocabulary(data);
      };
    }

    // 绑定关闭按钮事件
    const closeBtn = this.tooltip.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.hideTooltip();
      };
    }

    // 自动发音
    if (this.settings.autoSpeak) {
      this.speakWord(data.word);
    }
  }

  speakWord(word) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      speechSynthesis.speak(utterance);
    }
  }

  async addToVocabulary(data) {
    try {
      // 获取现有生词表
      const result = await chrome.storage.sync.get(['vocabulary']);
      const vocabulary = result.vocabulary || [];

      // 检查是否已存在
      const exists = vocabulary.some(item => item.word.toLowerCase() === data.word.toLowerCase());

      if (exists) {
        this.showMessage('该单词已在生词表中');
        return;
      }

      // 添加新单词
      const newWord = {
        word: data.word,
        translation: data.translation,
        pronunciation: data.pronunciation,
        addedAt: new Date().toISOString(),
        ankiSynced: false,
        ankiNoteId: null,
        syncedAt: null
      };

      vocabulary.unshift(newWord); // 添加到开头

      // 限制生词表大小（最多500个）
      if (vocabulary.length > 500) {
        vocabulary.splice(500);
      }

      // 保存到存储
      await chrome.storage.sync.set({ vocabulary });

      this.showMessage('已添加到生词表');

    } catch (error) {
      console.error('添加生词失败:', error);
      this.showMessage('添加失败');
    }
  }

  showMessage(message) {
    // 在tooltip中显示临时消息
    const messageDiv = document.createElement('div');
    messageDiv.className = 'temp-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: #4caf50;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 10001;
    `;

    this.tooltip.appendChild(messageDiv);

    // 2秒后移除消息
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 2000);
  }

  // 剪切板监听相关方法
  initClipboardMonitoring() {
    // 初始化时获取当前剪切板内容
    this.checkClipboard();
  }

  startClipboardMonitoring() {
    if (this.clipboardCheckInterval) {
      clearInterval(this.clipboardCheckInterval);
    }

    // 每2秒检查一次剪切板（降低频率以提高性能）
    this.clipboardCheckInterval = setInterval(() => {
      this.checkClipboard();
    }, 2000);
  }

  stopClipboardMonitoring() {
    if (this.clipboardCheckInterval) {
      clearInterval(this.clipboardCheckInterval);
      this.clipboardCheckInterval = null;
    }
  }

  async checkClipboard() {
    if (!this.settings.enabled || !this.settings.clipboardEnabled) {
      return;
    }

    try {
      // 读取剪切板内容
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText && clipboardText !== this.lastClipboardContent) {
        this.lastClipboardContent = clipboardText;

        // 检查是否为英文单词或短语
        const trimmedText = clipboardText.trim();
        if (this.isEnglishWord(trimmedText)) {
          this.handleClipboardTranslation(trimmedText);
        }
      }
    } catch (error) {
      // 静默处理剪切板访问错误（可能是权限问题或浏览器限制）
      console.debug('剪切板访问失败:', error.message);
    }
  }

  handleClipboardTranslation(word) {
    // 显示剪切板翻译提示
    this.showClipboardTooltip(word);

    // 自动翻译
    this.currentWord = word;
    this.translateWord(word);
  }

  showClipboardTooltip(word) {
    // 在屏幕右上角显示翻译框
    const x = window.innerWidth - 350;
    const y = 50;

    this.showTooltip(x, y);

    // 添加剪切板来源标识
    this.tooltip.classList.add('clipboard-tooltip');

    // 不再自动隐藏，让用户通过关闭按钮手动关闭
  }
}

// 初始化翻译器
const translator = new WordTranslator();