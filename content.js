// 中英文单词本插件
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
      translationService: 'openai', // 默认使用OpenAI翻译
      clipboardEnabled: true // 默认启用剪切板监听
    };
    this.selectedText = '';
    this.selectionRect = null;

    this.openaiTranslator = new OpenAITranslator();
    this.lastClipboardContent = '';
    this.clipboardCheckInterval = null;
    this.clipboardTranslatedContent = null; // 存储已翻译的剪切板内容
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
      this.settings.translationService = result.translationService || 'openai';
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

      if (selectedText && this.isValidWord(selectedText)) {
        this.selectedText = selectedText;
        this.currentWordType = this.getWordType(selectedText);
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

  isChineseWord(word) {
    if (!word || typeof word !== 'string') return false;

    const cleanWord = word.trim();

    // 检查长度：1-50个字符
    const isValidLength = cleanWord.length >= 1 && cleanWord.length <= 50;
    if (!isValidLength) return false;

    // 检查是否包含中文字符
    const hasChinese = /[\u4e00-\u9fff]/.test(cleanWord);
    if (!hasChinese) return false;

    // 允许中文字符、标点符号、空格
    const isValidChars = /^[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\s\-·]+$/.test(cleanWord);
    if (!isValidChars) return false;

    // 过滤掉一些无意义的字符串
    const skipWords = ['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没', '看', '好', '自己', '这样', '那样'];
    if (skipWords.includes(cleanWord)) return false;

    // 过滤掉纯标点符号
    if (/^[\u3000-\u303f\uff00-\uffef\s\-·]+$/.test(cleanWord)) return false;

    return true;
  }

  // 检查是否为有效的词汇（英文或中文）
  isValidWord(word) {
    return this.isEnglishWord(word) || this.isChineseWord(word);
  }

  // 获取词汇类型
  getWordType(word) {
    if (this.isEnglishWord(word)) return 'english';
    if (this.isChineseWord(word)) return 'chinese';
    return null;
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

  async translateWord(word, isClipboardTranslation = false) {
    if (this.isLoading) return;

    // 检查缓存
    if (this.cache.has(word.toLowerCase())) {
      this.displayTranslation(this.cache.get(word.toLowerCase()));
      // 如果是剪切板翻译，标记为已翻译
      if (isClipboardTranslation) {
        this.markClipboardTranslationAsProcessed(word);
      }
      return;
    }

    this.isLoading = true;

    try {
      const translation = await this.fetchTranslation(word);
      this.cache.set(word.toLowerCase(), translation);

      if (this.currentWord === word) {
        this.displayTranslation(translation);
        // 翻译成功后，如果是剪切板翻译，标记为已翻译
        if (isClipboardTranslation) {
          this.markClipboardTranslationAsProcessed(word);
        }
      }
    } catch (error) {
      console.error('翻译失败:', error);
      if (this.currentWord === word) {
        const detail = error && error.message ? this.escapeHtml(error.message) : '未知错误';
        this.tooltip.innerHTML = `<div class="error">翻译失败：${detail}</div>`;
      }
    } finally {
      this.isLoading = false;
    }
  }

  async fetchTranslation(word) {
    const wordType = this.getWordType(word);

    if (wordType === 'chinese') {
      // 中文词汇优先使用OpenAI进行详细解释
      if (this.settings.translationService === 'openai') {
        return await this.fetchChineseExplanation(word);
      } else {
        return await this.fetchChineseGoogleTranslation(word);
      }
    } else {
      // 英文词汇使用原有逻辑
      switch (this.settings.translationService) {
        case 'openai':
          return await this.fetchOpenAITranslation(word);
        case 'google':
        default:
          return await this.fetchGoogleTranslation(word);
      }
    }
  }



  async fetchOpenAITranslation(word) {
    let openaiError = null;
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
      openaiError = error;
    }
    // 如果OpenAI失败，回退到Google翻译；两者都失败时保留OpenAI的真实错误原因
    try {
      return await this.fetchGoogleTranslation(word);
    } catch (error) {
      console.error('Google翻译回退失败:', error);
      throw new Error(`${openaiError.message}；Google翻译回退也失败`);
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

  // 中文词汇详细解释（使用OpenAI）
  async fetchChineseExplanation(word) {
    let openaiError = null;
    try {
      const result = await this.openaiTranslator.explainChinese(word);

      return {
        word: result.word,
        translation: result.explanation || result.translation,
        pronunciation: result.pronunciation || this.generateChinesePronunciation(word),
        definitions: result.definitions || [],
        synonyms: result.synonyms || [],
        antonyms: result.antonyms || [],
        phrases: result.phrases || [],
        source: 'OpenAI',
        wordType: 'chinese'
      };
    } catch (error) {
      console.error('中文词汇解释失败:', error);
      openaiError = error;
    }
    // 回退到简单解释；两者都失败时保留OpenAI的真实错误原因
    try {
      return await this.fetchChineseGoogleTranslation(word);
    } catch (error) {
      console.error('中文Google翻译回退失败:', error);
      throw new Error(`中文解释失败：${openaiError.message}；Google翻译回退也失败`);
    }
  }

  // 中文词汇Google翻译（备用方案）
  async fetchChineseGoogleTranslation(word) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh&tl=en&dt=t&dt=bd&dj=1&q=${encodeURIComponent(word)}`;

      const response = await fetch(url);
      const data = await response.json();

      let translation = '';
      if (data.sentences && data.sentences[0]) {
        translation = data.sentences[0].trans;
      }

      return {
        word,
        translation: translation || '未找到翻译',
        pronunciation: this.generateChinesePronunciation(word),
        definitions: [{
          partOfSpeech: '',
          meaning: `"${word}"的基本含义`,
          example: `这是一个包含"${word}"的例句。`
        }],
        synonyms: [],
        antonyms: [],
        phrases: [],
        source: 'Google',
        wordType: 'chinese'
      };
    } catch (error) {
      console.error('中文Google翻译失败:', error);
      throw error;
    }
  }

  // 生成中文拼音（简化处理）
  generateChinesePronunciation(word) {
    // 这里可以集成更专业的拼音库，暂时返回简单格式
    return `[${word}]`;
  }

  // HTML转义，用于将错误信息等动态内容安全地插入tooltip
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
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
    const isChineseWord = data.wordType === 'chinese';

    let html = `
      <div class="translation-content ${isChineseWord ? 'chinese-word' : 'english-word'}">
        <div class="word-header">
          <span class="word">${data.word}</span>
          ${isChineseWord ? '<span class="word-type-badge">中文</span>' : '<span class="word-type-badge">英文</span>'}
          <button class="play-btn">🔊</button>
          <button class="add-word-btn" title="添加到生词表">⭐</button>
          <button class="close-btn">✕</button>
        </div>
        <div class="pronunciation">${data.pronunciation}</div>
        <div class="translation">${isChineseWord ? (data.explanation || data.translation) : data.translation}</div>
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

    // 如果有反义词（主要用于中文词汇）
    if (data.antonyms && data.antonyms.length > 0) {
      html += `<div class="antonyms">
        <strong>反义词：</strong>${data.antonyms.slice(0, 3).join(', ')}
      </div>`;
    }

    // 如果有常用短语
    if (data.phrases && data.phrases.length > 0) {
      html += `<div class="phrases">
        <strong>${isChineseWord ? '常用词组：' : '常用短语：'}</strong>${data.phrases.slice(0, 3).join(', ')}
      </div>`;
    }

    // 如果有词汇来源（主要用于中文词汇）
    if (data.etymology && isChineseWord) {
      html += `<div class="etymology">
        <strong>词汇来源：</strong>${data.etymology}
      </div>`;
    }

    // 如果有使用说明（主要用于中文词汇）
    if (data.usage && isChineseWord) {
      html += `<div class="usage">
        <strong>使用说明：</strong>${data.usage}
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
    if (!('speechSynthesis' in window)) {
      console.warn('浏览器不支持语音合成');
      this.showMessage('浏览器不支持发音功能');
      return;
    }

    // 调试信息
    console.log('发音调试信息:', {
      word: word,
      speechSynthesis: !!window.speechSynthesis,
      voices: speechSynthesis.getVoices().length,
      speaking: speechSynthesis.speaking,
      pending: speechSynthesis.pending,
      paused: speechSynthesis.paused
    });

    try {
      // 停止当前正在播放的语音
      speechSynthesis.cancel();

      // 获取发音按钮并添加视觉反馈
      const playBtn = this.tooltip.querySelector('.play-btn');
      if (playBtn) {
        playBtn.classList.add('speaking');
        playBtn.textContent = '🔊';
      }

      const utterance = new SpeechSynthesisUtterance(word);

      // 根据词汇类型设置语言
      const wordType = this.getWordType(word);
      if (wordType === 'chinese') {
        utterance.lang = 'zh-CN';
      } else {
        utterance.lang = 'en-US';
      }

      utterance.rate = 0.8;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;

      // 添加事件监听器
      utterance.onstart = () => {
        console.log('开始发音:', word);
        if (playBtn) {
          playBtn.textContent = '🎵';
        }
      };

      utterance.onend = () => {
        console.log('发音结束:', word);
        if (playBtn) {
          playBtn.classList.remove('speaking');
          playBtn.textContent = '🔊';
        }
      };

      utterance.onerror = (event) => {
        console.error('发音失败:', event.error);
        if (playBtn) {
          playBtn.classList.remove('speaking');
          playBtn.textContent = '🔊';
        }

        // 根据错误类型显示不同的提示
        let errorMessage = '发音失败';
        switch (event.error) {
          case 'network':
            errorMessage = '网络错误，发音失败';
            break;
          case 'synthesis-unavailable':
            errorMessage = '语音合成不可用';
            break;
          case 'synthesis-failed':
            errorMessage = '语音合成失败';
            break;
          case 'language-unavailable':
            errorMessage = '该语言不支持发音';
            break;
          case 'voice-unavailable':
            errorMessage = '语音不可用';
            break;
          case 'text-too-long':
            errorMessage = '文本过长，无法发音';
            break;
          case 'invalid-argument':
            errorMessage = '发音参数错误';
            break;
          default:
            errorMessage = `发音失败: ${event.error}`;
        }
        this.showMessage(errorMessage);
      };

      // 确保语音引擎已加载
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener('voiceschanged', () => {
          speechSynthesis.speak(utterance);
        }, { once: true });
      } else {
        speechSynthesis.speak(utterance);
      }

    } catch (error) {
      console.error('发音功能出错:', error);
      const playBtn = this.tooltip.querySelector('.play-btn');
      if (playBtn) {
        playBtn.classList.remove('speaking');
        playBtn.textContent = '🔊';
      }
      this.showMessage('发音功能出错');
    }
  }

  // 存储操作辅助函数 - 支持多生词本
  async getVocabularyBooks() {
    try {
      const result = await chrome.storage.local.get(['vocabularyBooks']);
      return result.vocabularyBooks || {
        'default': {
          id: 'default',
          name: '默认生词本',
          description: '默认的生词本',
          createdAt: new Date().toISOString(),
          words: []
        }
      };
    } catch (error) {
      console.error('获取生词本失败:', error);
      return {};
    }
  }

  async saveVocabularyBooks(vocabularyBooks) {
    try {
      await chrome.storage.local.set({ vocabularyBooks });
    } catch (error) {
      console.error('保存生词本失败:', error);
      throw error;
    }
  }

  async getCurrentVocabularyBook() {
    try {
      const result = await chrome.storage.local.get(['currentVocabularyBook']);
      return result.currentVocabularyBook || 'default';
    } catch (error) {
      console.error('获取当前生词本失败:', error);
      return 'default';
    }
  }

  async setCurrentVocabularyBook(bookId) {
    try {
      await chrome.storage.local.set({ currentVocabularyBook: bookId });
    } catch (error) {
      console.error('设置当前生词本失败:', error);
      throw error;
    }
  }

  // 兼容旧版本的函数
  async getVocabulary() {
    try {
      const vocabularyBooks = await this.getVocabularyBooks();
      const currentBookId = await this.getCurrentVocabularyBook();
      return vocabularyBooks[currentBookId]?.words || [];
    } catch (error) {
      console.error('获取生词表失败:', error);
      return [];
    }
  }

  async saveVocabulary(vocabulary) {
    try {
      const vocabularyBooks = await this.getVocabularyBooks();
      const currentBookId = await this.getCurrentVocabularyBook();

      if (!vocabularyBooks[currentBookId]) {
        vocabularyBooks[currentBookId] = {
          id: currentBookId,
          name: '默认生词本',
          description: '',
          createdAt: new Date().toISOString(),
          words: []
        };
      }

      vocabularyBooks[currentBookId].words = vocabulary;
      await this.saveVocabularyBooks(vocabularyBooks);
    } catch (error) {
      console.error('保存生词表失败:', error);
      throw error;
    }
  }

  async addToVocabulary(data, bookId = null) {
    try {
      // 如果没有指定生词本，显示选择界面
      if (!bookId) {
        this.showVocabularyBookSelector(data);
        return;
      }

      const vocabularyBooks = await this.getVocabularyBooks();

      // 确保生词本存在
      if (!vocabularyBooks[bookId]) {
        this.showMessage('生词本不存在');
        return;
      }

      const vocabulary = vocabularyBooks[bookId].words || [];

      // 检查是否已存在
      const exists = vocabulary.some(item => item.word.toLowerCase() === data.word.toLowerCase());

      if (exists) {
        this.showMessage('该单词已在此生词本中');
        return;
      }

      // 添加新单词 - 保存完整的详细信息
      const newWord = {
        word: data.word,
        translation: data.translation || data.explanation,
        pronunciation: data.pronunciation,
        addedAt: new Date().toISOString(),
        ankiSynced: false,
        ankiNoteId: null,
        syncedAt: null,
        bookId: bookId,
        wordType: data.wordType || this.getWordType(data.word),

        // 详细释义信息
        definitions: data.definitions || [],

        // 同义词和反义词
        synonyms: data.synonyms || [],
        antonyms: data.antonyms || [],

        // 常用短语和词组
        phrases: data.phrases || [],

        // 词汇来源和构成
        etymology: data.etymology || '',

        // 使用说明和语境
        usage: data.usage || '',

        // 翻译来源
        source: data.source || '',

        // 原始解释（中文词汇）
        explanation: data.explanation || '',

        // 扩展信息（保留原始API返回的所有数据）
        originalData: {
          source: data.source,
          wordType: data.wordType,
          rawDefinitions: data.definitions,
          rawSynonyms: data.synonyms,
          rawAntonyms: data.antonyms,
          rawPhrases: data.phrases
        }
      };

      vocabulary.unshift(newWord); // 添加到开头
      vocabularyBooks[bookId].words = vocabulary;

      // 保存到存储
      await this.saveVocabularyBooks(vocabularyBooks);

      this.showMessage(`已添加到"${vocabularyBooks[bookId].name}"`);

    } catch (error) {
      console.error('添加生词失败:', error);
      this.showMessage('添加失败');
    }
  }

  showVocabularyBookSelector(data) {
    // 创建生词本选择界面
    const selector = document.createElement('div');
    selector.className = 'vocabulary-book-selector';
    selector.innerHTML = `
      <div class="book-selector-content">
        <div class="book-selector-header">
          <h3>选择生词本</h3>
          <button class="close-selector">✕</button>
        </div>
        <div class="book-selector-body">
          <div class="word-info">
            <strong>${data.word}</strong>
            <span class="word-type-indicator">${data.wordType === 'chinese' ? '中文' : '英文'}</span>
            <br>
            ${data.translation || data.explanation}
          </div>
          <div class="book-list" id="bookList">
            <div class="loading">加载中...</div>
          </div>
          <div class="book-actions">
            <button class="create-book-btn">+ 创建新生词本</button>
          </div>
        </div>
      </div>
    `;

    // CSS样式已在styles.css中定义，不需要内联样式

    document.body.appendChild(selector);

    // 加载生词本列表
    this.loadBookList(data);

    // 绑定事件
    selector.querySelector('.close-selector').onclick = () => {
      document.body.removeChild(selector);
    };

    selector.querySelector('.create-book-btn').onclick = () => {
      this.showCreateBookDialog(data);
    };

    // 点击外部关闭
    selector.onclick = (e) => {
      if (e.target === selector) {
        document.body.removeChild(selector);
      }
    };
  }

  async loadBookList(data) {
    try {
      const vocabularyBooks = await this.getVocabularyBooks();
      const currentBookId = await this.getCurrentVocabularyBook();
      const bookList = document.getElementById('bookList');

      if (!bookList) return;

      const books = Object.values(vocabularyBooks);

      if (books.length === 0) {
        bookList.innerHTML = '<div class="no-books">暂无生词本</div>';
        return;
      }

      const html = books.map(book => `
        <div class="book-item ${book.id === currentBookId ? 'current' : ''}" data-book-id="${book.id}">
          <div class="book-info">
            <div class="book-name">${book.name}</div>
            <div class="book-stats">${book.words?.length || 0} 个单词</div>
          </div>
          <button class="select-book-btn" data-book-id="${book.id}">选择</button>
        </div>
      `).join('');

      bookList.innerHTML = html;

      // 绑定选择事件
      bookList.querySelectorAll('.select-book-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const bookId = btn.getAttribute('data-book-id');
          this.addToVocabulary(data, bookId);

          // 关闭选择器
          const selector = document.querySelector('.vocabulary-book-selector');
          if (selector) {
            document.body.removeChild(selector);
          }
        };
      });

    } catch (error) {
      console.error('加载生词本列表失败:', error);
      const bookList = document.getElementById('bookList');
      if (bookList) {
        bookList.innerHTML = '<div class="error">加载失败</div>';
      }
    }
  }

  showCreateBookDialog(data) {
    const dialog = document.createElement('div');
    dialog.className = 'create-book-dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>创建新生词本</h3>
          <button class="close-dialog">✕</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>生词本名称：</label>
            <input type="text" id="bookName" placeholder="请输入生词本名称" maxlength="50">
          </div>
          <div class="form-group">
            <label>描述（可选）：</label>
            <textarea id="bookDescription" placeholder="请输入生词本描述" maxlength="200"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn">取消</button>
          <button class="create-btn">创建并添加</button>
        </div>
      </div>
    `;

    // CSS样式已在styles.css中定义，不需要内联样式

    document.body.appendChild(dialog);

    // 绑定事件
    const closeDialog = () => {
      document.body.removeChild(dialog);
    };

    dialog.querySelector('.close-dialog').onclick = closeDialog;
    dialog.querySelector('.cancel-btn').onclick = closeDialog;

    dialog.querySelector('.create-btn').onclick = async () => {
      const name = dialog.querySelector('#bookName').value.trim();
      const description = dialog.querySelector('#bookDescription').value.trim();

      if (!name) {
        alert('请输入生词本名称');
        return;
      }

      try {
        const bookId = await this.createVocabularyBook(name, description);
        closeDialog();

        // 关闭生词本选择器
        const selector = document.querySelector('.vocabulary-book-selector');
        if (selector) {
          document.body.removeChild(selector);
        }

        // 添加到新创建的生词本
        this.addToVocabulary(data, bookId);
      } catch (error) {
        alert('创建生词本失败：' + error.message);
      }
    };

    // 点击外部关闭
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        closeDialog();
      }
    };

    // 自动聚焦到名称输入框
    setTimeout(() => {
      dialog.querySelector('#bookName').focus();
    }, 100);
  }

  async createVocabularyBook(name, description = '') {
    try {
      const vocabularyBooks = await this.getVocabularyBooks();
      const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      vocabularyBooks[bookId] = {
        id: bookId,
        name: name,
        description: description,
        createdAt: new Date().toISOString(),
        words: []
      };

      await this.saveVocabularyBooks(vocabularyBooks);
      return bookId;
    } catch (error) {
      console.error('创建生词本失败:', error);
      throw error;
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

        // 检查是否为有效词汇（英文或中文）
        const trimmedText = clipboardText.trim();
        if (this.isValidWord(trimmedText)) {
          this.currentWordType = this.getWordType(trimmedText);
          // 只在处理前检查，不要提前清除，交给 handleClipboardTranslation 处理
          this.handleClipboardTranslation(trimmedText);
        }
      }
    } catch (error) {
      // 静默处理剪切板访问错误（可能是权限问题或浏览器限制）
      console.debug('剪切板访问失败:', error.message);
    }
  }

  handleClipboardTranslation(word) {
    // 从全局存储中获取剪切板翻译状态
    chrome.storage.local.get(['clipboardTranslatedContent'], (result) => {
      const translatedContent = result.clipboardTranslatedContent;

      // 检查该内容是否已经被翻译过（全局存储中有相同的内容）
      if (translatedContent === word) {
        console.debug('剪切板内容已被翻译过，跳过：', word);
        return; // 直接返回，不做任何操作
      }

      // 到这里说明是新的剪切板内容，需要翻译
      // 先清除旧的翻译状态
      this.clearClipboardTranslationState();

      // 显示剪切板翻译提示
      this.showClipboardTooltip(word);

      // 自动翻译
      this.currentWord = word;
      this.translateWord(word, true); // 标记为剪切板翻译
    });
  }

  markClipboardTranslationAsProcessed(word) {
    // 翻译成功后，将内容写入全局存储
    // 下次无论在哪个页面，检查存储后都知道已翻译过
    chrome.storage.local.set({
      'clipboardTranslatedContent': word,
      'clipboardTranslatedTime': new Date().getTime()
    });
    console.debug('已标记剪切板内容为已翻译:', word);
  }

  clearClipboardTranslationState() {
    // 当剪切板内容改变时，清除全局存储中的翻译状态
    // 这样新的剪切板内容会被重新翻译
    chrome.storage.local.set({
      'clipboardTranslatedContent': null,
      'clipboardTranslatedTime': null
    });
    console.debug('已清除剪切板翻译状态');
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