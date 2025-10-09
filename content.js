// 英文悬浮翻译插件
class WordTranslator {
  constructor() {
    this.tooltip = null;
    this.currentWord = '';
    this.isLoading = false;
    this.cache = new Map();
    this.settings = {
      enabled: true,
      autoSpeak: false
    };
    this.hoverTimeout = null;
    this.hideTimeout = null;
    this.init();
  }

  init() {
    this.loadSettings();
    this.createTooltip();
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

  bindEvents() {
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  handleMouseOver(event) {
    if (!this.settings.enabled) return;
    
    // 清除之前的隐藏定时器
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    const word = this.getWordFromElement(event);
    if (word && this.isEnglishWord(word)) {
      // 如果是同一个单词，不重复处理
      if (this.currentWord === word && this.tooltip.style.display === 'block') {
        return;
      }
      
      // 清除之前的悬浮定时器
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
      }
      
      // 延迟显示，避免快速移动时频繁触发
      this.hoverTimeout = setTimeout(() => {
        this.currentWord = word;
        this.showTooltip(event.clientX, event.clientY);
        this.translateWord(word);
      }, 300); // 300ms延迟
    } else {
      this.hideTooltip();
    }
  }

  handleMouseOut(event) {
    // 清除悬浮定时器
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    
    // 延迟隐藏，避免鼠标移动到tooltip时消失
    this.hideTimeout = setTimeout(() => {
      if (!this.tooltip.matches(':hover')) {
        this.hideTooltip();
      }
    }, 200);
  }

  handleMouseMove(event) {
    if (this.tooltip.style.display === 'block') {
      this.updateTooltipPosition(event.clientX, event.clientY);
    }
  }

  getWordFromElement(event) {
    const element = event.target;
    
    // 跳过不需要翻译的元素
    if (this.shouldSkipElement(element)) {
      return null;
    }
    
    // 获取选中的文本
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const selectedText = selection.toString().trim();
      if (selectedText && this.isEnglishWord(selectedText)) {
        return selectedText;
      }
    }
    
    // 方法1: 尝试使用caretRangeFromPoint
    let word = this.getWordFromCaretRange(event);
    if (word) return word;
    
    // 方法2: 从元素文本内容中提取单词
    word = this.getWordFromElementText(element, event);
    if (word) return word;
    
    // 方法3: 遍历所有文本节点寻找单词
    word = this.getWordFromTextNodes(element, event);
    if (word) return word;
    
    return null;
  }

  getWordFromCaretRange(event) {
    try {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (!range) return null;
      
      const textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) return null;
      
      const text = textNode.textContent;
      const offset = range.startOffset;
      
      return this.extractWordFromText(text, offset);
    } catch (e) {
      return null;
    }
  }

  getWordFromElementText(element, event) {
    const text = element.textContent || element.innerText || '';
    if (!text) return null;
    
    // 简单处理：如果元素文本很短且是单个单词，直接返回
    const trimmedText = text.trim();
    if (trimmedText.length < 50 && this.isEnglishWord(trimmedText)) {
      return trimmedText;
    }
    
    // 从文本中提取所有英文单词
    const words = text.match(/\b[a-zA-Z]+\b/g);
    if (words && words.length > 0) {
      // 返回第一个有效单词
      for (const word of words) {
        if (this.isEnglishWord(word)) {
          return word;
        }
      }
    }
    
    return null;
  }

  getWordFromTextNodes(element, event) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      const text = textNode.textContent;
      if (!text) continue;
      
      const words = text.match(/\b[a-zA-Z]+\b/g);
      if (words) {
        for (const word of words) {
          if (this.isEnglishWord(word)) {
            return word;
          }
        }
      }
    }
    
    return null;
  }

  extractWordFromText(text, offset) {
    if (!text || offset < 0 || offset >= text.length) return null;
    
    // 找到单词边界
    let start = offset;
    let end = offset;
    
    // 向前找单词开始
    while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) {
      start--;
    }
    
    // 向后找单词结束
    while (end < text.length && /[a-zA-Z]/.test(text[end])) {
      end++;
    }
    
    const word = text.substring(start, end).trim();
    return word;
  }

  shouldSkipElement(element) {
    // 跳过输入框、按钮等交互元素，但允许链接
    const skipTags = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'SCRIPT', 'STYLE', 'NOSCRIPT'];
    
    // 检查当前元素
    if (skipTags.includes(element.tagName)) return true;
    
    // 检查是否在翻译tooltip内
    if (element.closest('.word-translator-tooltip')) return true;
    
    // 检查是否是可编辑元素
    if (element.isContentEditable) return true;
    
    // 检查特殊属性
    if (element.getAttribute('contenteditable') === 'true') return true;
    
    return false;
  }

  isEnglishWord(word) {
    if (!word || typeof word !== 'string') return false;
    
    // 检查是否只包含英文字母，长度大于1，小于50
    const isValid = /^[a-zA-Z]+$/.test(word) && word.length > 1 && word.length < 50;
    
    // 过滤掉一些常见的无意义字符串
    const skipWords = ['www', 'http', 'https', 'com', 'org', 'net', 'html', 'css', 'js'];
    if (skipWords.includes(word.toLowerCase())) return false;
    
    return isValid;
  }

  showTooltip(x, y) {
    this.tooltip.style.display = 'block';
    this.tooltip.innerHTML = '<div class="loading">翻译中...</div>';
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
        </div>
        <div class="pronunciation">${data.pronunciation}</div>
        <div class="translation">${data.translation}</div>
      </div>
    `;
    
    this.tooltip.innerHTML = html;
    
    // 绑定发音按钮事件
    const playBtn = this.tooltip.querySelector('.play-btn');
    if (playBtn) {
      playBtn.onclick = () => this.speakWord(data.word);
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