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
    document.addEventListener('click', this.handleClick.bind(this));
    // 移除mouseout和mousemove事件监听，改为点击关闭
  }

  handleMouseOver(event) {
    if (!this.settings.enabled) return;

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
    }
  }

  handleClick(event) {
    // 如果点击的不是tooltip内部，则隐藏tooltip
    if (this.tooltip.style.display === 'block' && !this.tooltip.contains(event.target)) {
      this.hideTooltip();
    }
  }

  // 移除handleMouseMove方法，tooltip位置将保持固定

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

    // 精确获取鼠标位置的单词
    const word = this.getWordAtMousePosition(event);
    return word;
  }

  getWordAtMousePosition(event) {
    // 方法1: 使用现代API - document.caretPositionFromPoint (Firefox) 或 document.caretRangeFromPoint (Chrome)
    let range = null;

    if (document.caretPositionFromPoint) {
      const caretPosition = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (caretPosition) {
        range = document.createRange();
        range.setStart(caretPosition.offsetNode, caretPosition.offset);
        range.setEnd(caretPosition.offsetNode, caretPosition.offset);
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    }

    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer;
      const text = textNode.textContent;
      const offset = range.startOffset;

      // 检查光标位置是否在字母上
      if (offset < text.length && /[a-zA-Z]/.test(text[offset])) {
        const word = this.extractWordFromText(text, offset);
        if (word && this.isEnglishWord(word)) {
          return word;
        }
      }
    }

    // 方法2: 遍历文本节点，检查鼠标位置
    const word = this.findWordInTextNodes(event);
    if (word) return word;

    return null;
  }

  findWordInTextNodes(event) {
    const element = event.target;

    // 如果是文本节点的父元素，直接处理
    if (element.nodeType === Node.ELEMENT_NODE) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let textNode;
      while (textNode = walker.nextNode()) {
        const word = this.checkTextNodeAtPosition(textNode, event);
        if (word) return word;
      }
    }

    return null;
  }

  checkTextNodeAtPosition(textNode, event) {
    const text = textNode.textContent;
    if (!text || !text.trim()) return null;

    // 创建临时range来测量文本位置
    const range = document.createRange();
    const words = text.match(/\b[a-zA-Z]+\b/g);

    if (!words) return null;

    let currentIndex = 0;
    for (const word of words) {
      const wordIndex = text.indexOf(word, currentIndex);
      if (wordIndex === -1) continue;

      // 设置range到单词位置
      range.setStart(textNode, wordIndex);
      range.setEnd(textNode, wordIndex + word.length);

      const rect = range.getBoundingClientRect();

      // 检查鼠标是否在单词的边界框内
      if (event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom) {

        if (this.isEnglishWord(word)) {
          return word;
        }
      }

      currentIndex = wordIndex + word.length;
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
    const skipTags = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE'];

    // 检查当前元素
    if (skipTags.includes(element.tagName)) return true;

    // 检查是否在翻译tooltip内
    if (element.closest('.word-translator-tooltip')) return true;

    // 检查是否是可编辑元素
    if (element.isContentEditable) return true;

    // 检查特殊属性
    if (element.getAttribute('contenteditable') === 'true') return true;

    // 检查元素是否有文本内容
    const text = element.textContent || element.innerText || '';
    if (!text.trim()) return true;

    // 检查是否是纯数字或特殊字符元素
    if (!/[a-zA-Z]/.test(text)) return true;

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