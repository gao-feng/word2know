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
      autoSpeak: false
    };
    this.selectedText = '';
    this.selectionRect = null;
    this.init();
  }

  init() {
    this.loadSettings();
    this.createTooltip();
    this.createTranslateButton();
    this.bindEvents();
    this.listenForMessages();
  }

  loadSettings() {
    chrome.storage.sync.get(['enabled', 'autoSpeak'], (result) => {
      this.settings.enabled = result.enabled !== false;
      this.settings.autoSpeak = result.autoSpeak === true;
    });
  }

  listenForMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateSettings') {
        Object.assign(this.settings, message.settings);
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
    // 使用Google翻译API的简化版本
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh&dt=t&dt=bd&dj=1&q=${encodeURIComponent(word)}`;

    const response = await fetch(url);
    const data = await response.json();

    let translation = '';
    let pronunciation = '';

    if (data.sentences && data.sentences[0]) {
      translation = data.sentences[0].trans;
    }

    if (data.dict && data.dict[0] && data.dict[0].entry) {
      const entries = data.dict[0].entry.slice(0, 3); // 取前3个释义
      translation = entries.map(entry => entry.word).join('; ');
    }

    // 获取发音（简化处理）
    pronunciation = `/${word}/`; // 实际应用中可以集成更好的发音API

    return {
      word,
      translation: translation || '未找到翻译',
      pronunciation
    };
  }

  displayTranslation(data) {
    const html = `
      <div class="translation-content">
        <div class="word-header">
          <span class="word">${data.word}</span>
          <button class="play-btn">🔊</button>
          <button class="close-btn">✕</button>
        </div>
        <div class="pronunciation">${data.pronunciation}</div>
        <div class="translation">${data.translation}</div>
        <div class="tooltip-hint">点击外部区域关闭</div>
      </div>
    `;

    this.tooltip.innerHTML = html;

    // 绑定发音按钮事件
    const playBtn = this.tooltip.querySelector('.play-btn');
    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        this.speakWord(data.word);
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
}

// 初始化翻译器
const translator = new WordTranslator();