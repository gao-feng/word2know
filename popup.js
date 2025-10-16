// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const autoSpeakToggle = document.getElementById('autoSpeakToggle');
  const clipboardToggle = document.getElementById('clipboardToggle');
  const translationServiceSelect = document.getElementById('translationService');
  

  
  // OpenAI设置元素
  const openaiProviderSelect = document.getElementById('openaiProvider');
  const openaiBaseUrlInput = document.getElementById('openaiBaseUrl');
  const openaiModelInput = document.getElementById('openaiModel');
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const testOpenAIConfigBtn = document.getElementById('testOpenAIConfig');
  const saveOpenAIConfigBtn = document.getElementById('saveOpenAIConfig');
  const openaiApiStatusDiv = document.getElementById('openaiApiStatus');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const settingsTab = document.getElementById('settingsTab');
  const vocabularyTab = document.getElementById('vocabularyTab');
  const clearVocabBtn = document.getElementById('clearVocab');
  const exportAnkiBtn = document.getElementById('exportAnki');
  const syncAnkiBtn = document.getElementById('syncAnki');
  const vocabularyBookSelect = document.getElementById('vocabularyBookSelect');
  const manageBooksBtn = document.getElementById('manageBooks');
  
  // 加载设置和生词表
  loadSettings();
  loadVocabularyBooks();
  loadVocabulary();
  
  // 绑定设置事件
  enableToggle.addEventListener('click', function() {
    toggleSetting('enabled', enableToggle);
  });
  
  autoSpeakToggle.addEventListener('click', function() {
    toggleSetting('autoSpeak', autoSpeakToggle);
  });

  clipboardToggle.addEventListener('click', function() {
    toggleSetting('clipboardEnabled', clipboardToggle);
  });

  translationServiceSelect.addEventListener('change', function() {
    const service = this.value;
    chrome.storage.sync.set({ translationService: service });
    
    // 通知content script设置变更
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          settings: { translationService: service }
        });
      }
    });

    // 显示/隐藏API设置
    updateApiSettingsVisibility(service);
  });



  // 绑定OpenAI API设置事件
  openaiProviderSelect.addEventListener('change', handleProviderChange);
  testOpenAIConfigBtn.addEventListener('click', testOpenAIConfig);
  saveOpenAIConfigBtn.addEventListener('click', saveOpenAIConfig);

  // 绑定标签页事件
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      switchTab(tabName);
    });
  });

  // 绑定清空生词表事件
  clearVocabBtn.addEventListener('click', function() {
    if (confirm('确定要清空所有生词吗？')) {
      clearVocabulary();
    }
  });

  // 绑定导出Anki事件
  exportAnkiBtn.addEventListener('click', function() {
    exportToAnki();
  });

  // 绑定同步Anki事件
  syncAnkiBtn.addEventListener('click', function() {
    syncToAnki();
  });

  // 绑定生词本选择事件
  vocabularyBookSelect.addEventListener('change', function() {
    const bookId = this.value;
    if (bookId) {
      setCurrentVocabularyBook(bookId);
    }
  });

  // 绑定生词本管理事件
  manageBooksBtn.addEventListener('click', function() {
    showVocabularyBookManager();
  });
  
  function loadSettings() {
    chrome.storage.sync.get([
      'enabled', 'autoSpeak', 'clipboardEnabled', 'translationService', 
      'openaiApiKey', 'openaiBaseUrl', 'openaiModel'
    ], function(result) {
      const enabled = result.enabled !== false; // 默认启用
      const autoSpeak = result.autoSpeak === true; // 默认关闭
      const clipboardEnabled = result.clipboardEnabled !== false; // 默认启用
      const translationService = result.translationService || 'google';
      const openaiApiKey = result.openaiApiKey || '';
      const openaiBaseUrl = result.openaiBaseUrl || 'https://api.openai.com/v1/chat/completions';
      const openaiModel = result.openaiModel || 'gpt-3.5-turbo';
      
      updateToggleState(enableToggle, enabled);
      updateToggleState(autoSpeakToggle, autoSpeak);
      updateToggleState(clipboardToggle, clipboardEnabled);
      translationServiceSelect.value = translationService;
      openaiApiKeyInput.value = openaiApiKey;
      openaiBaseUrlInput.value = openaiBaseUrl;
      openaiModelInput.value = openaiModel;
      
      // 根据baseUrl设置provider
      setProviderFromUrl(openaiBaseUrl);
      
      updateApiSettingsVisibility(translationService);
    });
  }
  
  function toggleSetting(key, toggleElement) {
    const isActive = toggleElement.classList.contains('active');
    const newValue = !isActive;
    
    updateToggleState(toggleElement, newValue);
    
    // 保存设置
    const settings = {};
    settings[key] = newValue;
    chrome.storage.sync.set(settings);
    
    // 通知content script设置变更
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          settings: settings
        });
      }
    });
  }
  
  function updateToggleState(toggleElement, isActive) {
    if (isActive) {
      toggleElement.classList.add('active');
    } else {
      toggleElement.classList.remove('active');
    }
  }

  function switchTab(tabName) {
    // 更新标签按钮状态
    tabBtns.forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      }
    });

    // 显示对应的标签内容
    if (tabName === 'settings') {
      settingsTab.style.display = 'block';
      vocabularyTab.style.display = 'none';
    } else if (tabName === 'vocabulary') {
      settingsTab.style.display = 'none';
      vocabularyTab.style.display = 'block';
      loadVocabulary(); // 重新加载生词表
    }
  }

  // 存储操作辅助函数 - 支持多生词本
  async function getVocabularyBooks() {
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

  async function saveVocabularyBooks(vocabularyBooks) {
    try {
      await chrome.storage.local.set({ vocabularyBooks });
    } catch (error) {
      console.error('保存生词本失败:', error);
      throw error;
    }
  }

  async function getCurrentVocabularyBook() {
    try {
      const result = await chrome.storage.local.get(['currentVocabularyBook']);
      return result.currentVocabularyBook || 'default';
    } catch (error) {
      console.error('获取当前生词本失败:', error);
      return 'default';
    }
  }

  async function setCurrentVocabularyBook(bookId) {
    try {
      await chrome.storage.local.set({ currentVocabularyBook: bookId });
      loadVocabulary(); // 重新加载生词表
    } catch (error) {
      console.error('设置当前生词本失败:', error);
      throw error;
    }
  }

  // 兼容旧版本的函数
  async function getVocabulary() {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const currentBookId = await getCurrentVocabularyBook();
      return vocabularyBooks[currentBookId]?.words || [];
    } catch (error) {
      console.error('获取生词表失败:', error);
      return [];
    }
  }

  async function saveVocabulary(vocabulary) {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const currentBookId = await getCurrentVocabularyBook();
      
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
      await saveVocabularyBooks(vocabularyBooks);
    } catch (error) {
      console.error('保存生词表失败:', error);
      throw error;
    }
  }

  async function loadVocabulary() {
    try {
      const vocabulary = await getVocabulary();
      displayVocabulary(vocabulary);
    } catch (error) {
      console.error('Failed to load vocabulary:', error);
      displayVocabulary([]);
    }
  }

  function displayVocabulary(vocabulary) {
    const vocabularyList = document.getElementById('vocabularyList');
    const vocabCount = document.getElementById('vocabCount');
    
    // 统计同步状态
    const syncedCount = vocabulary.filter(item => item.ankiSynced).length;
    const unsyncedCount = vocabulary.length - syncedCount;
    
    vocabCount.innerHTML = `${vocabulary.length} 个生词 ${unsyncedCount > 0 ? `<span style="color: #ff9800;">(${unsyncedCount} 未同步)</span>` : '<span style="color: #4caf50;">(已全部同步)</span>'}`;

    if (vocabulary.length === 0) {
      vocabularyList.innerHTML = '<div class="empty-state">暂无生词</div>';
      return;
    }

    const html = vocabulary.map((item, index) => `
      <div class="vocab-item ${item.ankiSynced ? 'synced' : 'unsynced'}" data-word="${escapeHtml(item.word)}" data-added-at="${item.addedAt}">
        <div class="vocab-content">
          <div class="vocab-word">
            ${escapeHtml(item.word)}
            ${item.ankiSynced ? '<span class="sync-status" title="已同步到Anki">✓</span>' : '<span class="sync-status" title="未同步">○</span>'}
          </div>
          <div class="vocab-translation">${escapeHtml(item.translation)}</div>
        </div>
        <div class="vocab-actions">
          <button class="vocab-btn speak-btn" data-word="${escapeHtml(item.word)}" title="发音">🔊</button>
          <button class="vocab-btn delete-btn" data-word="${escapeHtml(item.word)}" data-added-at="${item.addedAt}" title="删除">🗑️</button>
        </div>
      </div>
    `).join('');

    vocabularyList.innerHTML = html;
    
    // 绑定按钮事件（使用事件委托）
    bindVocabularyEvents();
  }

  // HTML转义函数
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 绑定生词表按钮事件
  function bindVocabularyEvents() {
    const vocabularyList = document.getElementById('vocabularyList');
    
    // 移除之前的事件监听器（如果有）
    vocabularyList.removeEventListener('click', handleVocabularyClick);
    
    // 添加事件委托
    vocabularyList.addEventListener('click', handleVocabularyClick);
  }

  // 处理生词表按钮点击事件
  function handleVocabularyClick(event) {
    const target = event.target;
    
    if (target.classList.contains('speak-btn')) {
      // 发音按钮
      const word = target.getAttribute('data-word');
      if (word) {
        speakWord(word);
      }
    } else if (target.classList.contains('delete-btn')) {
      // 删除按钮
      const word = target.getAttribute('data-word');
      const addedAt = target.getAttribute('data-added-at');
      if (word && addedAt) {
        removeWordSafe(word, addedAt);
      }
    }
  }

  async function clearVocabulary() {
    try {
      await saveVocabulary([]);
      loadVocabulary();
    } catch (error) {
      console.error('清空生词表失败:', error);
      showMessage(`清空失败: ${error.message}`, 'error');
    }
  }

  // 发音函数
  function speakWord(word) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      speechSynthesis.speak(utterance);
    }
  }

  // 保持全局函数以兼容其他可能的调用
  window.speakWord = speakWord;

  // 保留旧的removeWord函数以兼容性（如果有其他地方调用）
  window.removeWord = async function(index) {
    try {
      const vocabulary = await getVocabulary();
      if (index >= 0 && index < vocabulary.length) {
        vocabulary.splice(index, 1);
        await saveVocabulary(vocabulary);
        loadVocabulary();
      }
    } catch (error) {
      console.error('删除生词失败:', error);
      showMessage(`删除失败: ${error.message}`, 'error');
    }
  };

  // 新的安全删除函数，使用单词和添加时间作为唯一标识
  async function removeWordSafe(word, addedAt) {
    if (!confirm(`确定要删除生词 "${word}" 吗？`)) {
      return;
    }

    try {
      const vocabulary = await getVocabulary();
      
      // 使用单词和添加时间来精确匹配要删除的生词
      const indexToRemove = vocabulary.findIndex(item => 
        item.word === word && item.addedAt === addedAt
      );
      
      if (indexToRemove !== -1) {
        const removedWord = vocabulary[indexToRemove];
        vocabulary.splice(indexToRemove, 1);
        
        await saveVocabulary(vocabulary);
        console.log(`成功删除生词: ${removedWord.word}`);
        showMessage(`已删除生词: ${removedWord.word}`, 'success');
        loadVocabulary();
      } else {
        console.warn(`未找到要删除的生词: ${word}`);
        showMessage('未找到要删除的生词', 'error');
      }
    } catch (error) {
      console.error('删除生词失败:', error);
      showMessage(`删除失败: ${error.message}`, 'error');
    }
  }

  // 保持全局函数以兼容其他可能的调用
  window.removeWordSafe = removeWordSafe;

  async function exportToAnki() {
    try {
      const vocabulary = await getVocabulary();
      
      if (vocabulary.length === 0) {
        alert('生词表为空，无法导出');
        return;
      }

      // 生成CSV格式的内容
      const csvContent = generateAnkiCSV(vocabulary);
      
      // 创建下载链接
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `vocabulary_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 显示成功消息
        showExportMessage(`已导出 ${vocabulary.length} 个单词到CSV文件`);
      } else {
        // 如果浏览器不支持下载，显示内容让用户复制
        showExportContent(csvContent);
      }
    } catch (error) {
      console.error('导出失败:', error);
      alert(`导出失败: ${error.message}`);
    }
  }

  function generateAnkiCSV(vocabulary) {
    // Anki CSV格式：正面,背面,标签
    // 正面是英文单词，背面是中文翻译和发音
    let csv = '';
    
    vocabulary.forEach(item => {
      const front = escapeCSV(item.word);
      const back = escapeCSV(`${item.translation}<br><br><i>${item.pronunciation}</i>`);
      const tags = 'vocabulary english'; // 可以自定义标签
      
      csv += `"${front}","${back}","${tags}"\n`;
    });
    
    return csv;
  }

  function escapeCSV(text) {
    // 转义CSV中的特殊字符
    return text.replace(/"/g, '""');
  }

  function showExportMessage(message) {
    // 创建临时消息提示
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #4caf50;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 3000);
  }

  function showExportContent(csvContent) {
    // 如果无法直接下载，显示内容供用户复制
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 80%;
      max-height: 80%;
      overflow: auto;
    `;
    
    content.innerHTML = `
      <h3>导出内容</h3>
      <p>请复制以下内容并保存为CSV文件：</p>
      <textarea readonly style="width: 100%; height: 200px; font-family: monospace;">${csvContent}</textarea>
      <div style="margin-top: 10px;">
        <button onclick="this.parentNode.parentNode.parentNode.remove()">关闭</button>
      </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
  }

  // 同步到Anki功能 - 支持多生词本对应多牌组
  async function syncToAnki() {
    const syncBtn = document.getElementById('syncAnki');
    const originalText = syncBtn.textContent;
    
    try {
      syncBtn.disabled = true;
      syncBtn.textContent = '🔄 连接中...';

      // 动态加载AnkiConnect
      const ankiConnect = await loadAnkiConnect();
      
      // 检查连接
      const isConnected = await ankiConnect.checkConnection();
      if (!isConnected) {
        throw new Error('无法连接到Anki。请确保Anki已启动并安装了AnkiConnect插件。');
      }

      // 获取所有生词本
      const vocabularyBooks = await getVocabularyBooks();
      syncBtn.textContent = '🔄 检查牌组...';
      
      const deckNames = await ankiConnect.getDeckNames();
      let totalSyncedWords = 0;
      let totalSkippedWords = 0;
      const syncResults = [];

      // 遍历每个生词本
      for (const [bookId, book] of Object.entries(vocabularyBooks)) {
        if (!book.words || book.words.length === 0) continue;

        // 生成对应的Anki牌组名称
        const deckName = generateDeckName(book);
        
        // 检查牌组是否存在，如果不存在则创建
        if (!deckNames.includes(deckName)) {
          console.log(`牌组 "${deckName}" 不存在，正在创建...`);
          await ankiConnect.createDeck(deckName);
          showSyncMessage(`已创建牌组 "${deckName}"`, 'info');
          
          // 重置该生词本中所有生词的同步状态
          let needsReset = false;
          for (let item of book.words) {
            if (item.ankiSynced) {
              item.ankiSynced = false;
              delete item.ankiNoteId;
              delete item.syncedAt;
              needsReset = true;
            }
          }
          
          if (needsReset) {
            await saveVocabularyBooks(vocabularyBooks);
            console.log(`已重置生词本 "${book.name}" 的同步状态`);
          }
        }
        
        // 筛选未同步的单词
        const unsyncedWords = book.words.filter(item => !item.ankiSynced);
        
        if (unsyncedWords.length === 0) {
          syncResults.push(`"${book.name}": 所有生词已同步`);
          continue;
        }

        syncBtn.textContent = `🔄 同步 "${book.name}" (0/${unsyncedWords.length})`;

        // 批量添加到对应的Anki牌组
        const noteIds = await ankiConnect.addNotes(unsyncedWords, deckName, (progress) => {
          syncBtn.textContent = `🔄 同步 "${book.name}" (${progress}/${unsyncedWords.length})`;
        });
        
        // 更新同步状态
        let bookSyncedCount = 0;
        let bookSkippedCount = 0;
        
        for (let i = 0; i < unsyncedWords.length; i++) {
          const wordIndex = book.words.findIndex(item => 
            item.word === unsyncedWords[i].word && !item.ankiSynced
          );
          
          if (wordIndex !== -1) {
            if (noteIds[i] !== null) {
              // 成功添加到Anki
              book.words[wordIndex].ankiSynced = true;
              book.words[wordIndex].ankiNoteId = noteIds[i];
              book.words[wordIndex].syncedAt = new Date().toISOString();
              book.words[wordIndex].ankiDeckName = deckName; // 记录牌组名称
              bookSyncedCount++;
            } else {
              // 跳过（已存在或其他原因）
              book.words[wordIndex].ankiSynced = true;
              book.words[wordIndex].ankiNoteId = 'skipped';
              book.words[wordIndex].syncedAt = new Date().toISOString();
              book.words[wordIndex].ankiDeckName = deckName;
              bookSkippedCount++;
            }
          }
        }

        totalSyncedWords += bookSyncedCount;
        totalSkippedWords += bookSkippedCount;
        
        // 记录每个生词本的同步结果
        if (bookSyncedCount > 0 && bookSkippedCount > 0) {
          syncResults.push(`"${book.name}": 新增${bookSyncedCount}个，跳过${bookSkippedCount}个`);
        } else if (bookSyncedCount > 0) {
          syncResults.push(`"${book.name}": 成功同步${bookSyncedCount}个生词`);
        } else if (bookSkippedCount > 0) {
          syncResults.push(`"${book.name}": ${bookSkippedCount}个生词已存在`);
        }
      }

      // 保存更新后的生词本数据
      await saveVocabularyBooks(vocabularyBooks);
      
      // 刷新显示
      loadVocabulary();
      loadVocabularyBooks();
      
      // 显示同步结果
      let message = '';
      if (syncResults.length === 0) {
        message = '所有生词本都是空的或已同步';
      } else if (totalSyncedWords > 0 || totalSkippedWords > 0) {
        const summary = `总计：新增${totalSyncedWords}个，跳过${totalSkippedWords}个`;
        const details = syncResults.join('\n');
        message = `${summary}\n\n详细结果：\n${details}`;
      } else {
        message = '同步完成，但没有处理任何生词';
      }
      
      showSyncMessage(message, 'success');

    } catch (error) {
      console.error('同步失败:', error);
      showSyncMessage(`同步失败: ${error.message}`, 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = originalText;
    }
  }

  // 生成Anki牌组名称
  function generateDeckName(vocabularyBook) {
    // 清理生词本名称，移除特殊字符
    let deckName = vocabularyBook.name.replace(/[<>:"/\\|?*]/g, '_');
    
    // 添加前缀以区分不同类型的生词本
    if (vocabularyBook.id === 'default') {
      deckName = '生词本_默认';
    } else {
      deckName = `生词本_${deckName}`;
    }
    
    // 限制长度
    if (deckName.length > 50) {
      deckName = deckName.substring(0, 47) + '...';
    }
    
    return deckName;
  }

  // 动态加载AnkiConnect
  async function loadAnkiConnect() {
    return new Promise((resolve, reject) => {
      if (window.AnkiConnect) {
        resolve(new window.AnkiConnect());
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('anki-connect.js');
      script.onload = () => {
        resolve(new window.AnkiConnect());
      };
      script.onerror = () => {
        reject(new Error('无法加载AnkiConnect模块'));
      };
      document.head.appendChild(script);
    });
  }

  // 通用消息显示函数
  function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    
    const bgColor = type === 'success' ? '#4caf50' : 
                   type === 'error' ? '#f44336' : '#2196f3';
    
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      max-width: 280px;
      text-align: center;
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 3000);
  }

  // 显示同步消息（使用通用函数）
  function showSyncMessage(message, type = 'info') {
    showMessage(message, type);
  }

  // 更新API设置可见性
  function updateApiSettingsVisibility(service) {
    const openaiSettings = document.getElementById('openaiSettings');
    
    openaiSettings.style.display = service === 'openai' ? 'block' : 'none';
  }



  // 显示OpenAI API状态消息
  function showOpenAIApiStatus(message, type) {
    openaiApiStatusDiv.textContent = message;
    openaiApiStatusDiv.className = `api-status ${type}`;
    openaiApiStatusDiv.style.display = 'block';
    
    // 3秒后隐藏状态消息（除非是错误）
    if (type !== 'error') {
      setTimeout(() => {
        openaiApiStatusDiv.style.display = 'none';
      }, 3000);
    }
  }



  // 处理服务提供商选择变化
  function handleProviderChange() {
    const provider = openaiProviderSelect.value;
    const providers = {
      'openai': {
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-3.5-turbo'
      },
      'deepseek': {
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat'
      },
      'moonshot': {
        baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
        model: 'moonshot-v1-8k'
      },
      'zhipu': {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        model: 'glm-4'
      }
    };

    if (providers[provider]) {
      openaiBaseUrlInput.value = providers[provider].baseUrl;
      openaiModelInput.value = providers[provider].model;
    }
  }

  // 根据URL设置提供商
  function setProviderFromUrl(url) {
    if (url.includes('api.openai.com')) {
      openaiProviderSelect.value = 'openai';
    } else if (url.includes('api.deepseek.com')) {
      openaiProviderSelect.value = 'deepseek';
    } else if (url.includes('api.moonshot.cn')) {
      openaiProviderSelect.value = 'moonshot';
    } else if (url.includes('open.bigmodel.cn')) {
      openaiProviderSelect.value = 'zhipu';
    } else {
      openaiProviderSelect.value = 'custom';
    }
  }

  // 测试OpenAI配置
  async function testOpenAIConfig() {
    const config = {
      apiKey: openaiApiKeyInput.value.trim(),
      baseUrl: openaiBaseUrlInput.value.trim(),
      model: openaiModelInput.value.trim()
    };
    
    if (!config.apiKey) {
      showOpenAIApiStatus('请输入API密钥', 'error');
      return;
    }

    if (!config.baseUrl) {
      showOpenAIApiStatus('请输入API地址', 'error');
      return;
    }

    if (!config.model) {
      showOpenAIApiStatus('请输入模型名称', 'error');
      return;
    }

    showOpenAIApiStatus('正在测试连接...', 'testing');
    testOpenAIConfigBtn.disabled = true;

    try {
      // 创建临时的翻译器实例进行测试
      const translator = new OpenAITranslator();
      const validation = await translator.validateConfig(config);
      
      if (validation.valid) {
        showOpenAIApiStatus('配置有效，连接成功！', 'success');
      } else {
        showOpenAIApiStatus(`配置无效: ${validation.error}`, 'error');
      }
    } catch (error) {
      showOpenAIApiStatus(`测试失败: ${error.message}`, 'error');
    } finally {
      testOpenAIConfigBtn.disabled = false;
    }
  }

  // 保存OpenAI配置
  async function saveOpenAIConfig() {
    const config = {
      apiKey: openaiApiKeyInput.value.trim(),
      baseUrl: openaiBaseUrlInput.value.trim(),
      model: openaiModelInput.value.trim()
    };
    
    if (!config.apiKey) {
      showOpenAIApiStatus('请输入API密钥', 'error');
      return;
    }

    if (!config.baseUrl) {
      showOpenAIApiStatus('请输入API地址', 'error');
      return;
    }

    if (!config.model) {
      showOpenAIApiStatus('请输入模型名称', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        openaiApiKey: config.apiKey,
        openaiBaseUrl: config.baseUrl,
        openaiModel: config.model
      });
      showOpenAIApiStatus('配置已保存', 'success');
      
      // 通知content script更新配置
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateOpenAIConfig',
            config: config
          });
        }
      });
    } catch (error) {
      showOpenAIApiStatus(`保存失败: ${error.message}`, 'error');
    }
  }

  // 在页面加载时加载翻译器
  loadOpenAITranslator().catch(console.error);

  // 动态加载OpenAITranslator类
  function loadOpenAITranslator() {
    return new Promise((resolve, reject) => {
      if (window.OpenAITranslator) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('openai-translator.js');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('无法加载OpenAITranslator模块'));
      document.head.appendChild(script);
    });
  }

  // 加载生词本列表
  async function loadVocabularyBooks() {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const currentBookId = await getCurrentVocabularyBook();
      
      // 清空选择器
      vocabularyBookSelect.innerHTML = '';
      
      // 添加生词本选项
      Object.values(vocabularyBooks).forEach(book => {
        const option = document.createElement('option');
        option.value = book.id;
        option.textContent = `${book.name} (${book.words?.length || 0})`;
        if (book.id === currentBookId) {
          option.selected = true;
        }
        vocabularyBookSelect.appendChild(option);
      });
    } catch (error) {
      console.error('加载生词本列表失败:', error);
      vocabularyBookSelect.innerHTML = '<option value="">加载失败</option>';
    }
  }

  // 显示生词本管理器
  function showVocabularyBookManager() {
    // 创建管理界面
    const manager = document.createElement('div');
    manager.className = 'vocabulary-book-manager';
    manager.innerHTML = `
      <div class="manager-content">
        <div class="manager-header">
          <h3>生词本管理</h3>
          <button class="close-manager">✕</button>
        </div>
        <div class="manager-body">
          <div class="manager-actions">
            <button class="create-new-book">+ 创建新生词本</button>
          </div>
          <div class="book-list-manager" id="bookListManager">
            <div class="loading">加载中...</div>
          </div>
        </div>
      </div>
    `;

    // 添加样式
    manager.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(manager);

    // 加载生词本列表
    loadBookListForManager();

    // 绑定事件
    manager.querySelector('.close-manager').onclick = () => {
      document.body.removeChild(manager);
    };

    manager.querySelector('.create-new-book').onclick = () => {
      showCreateBookDialog();
    };

    // 点击外部关闭
    manager.onclick = (e) => {
      if (e.target === manager) {
        document.body.removeChild(manager);
      }
    };
  }

  // 为管理器加载生词本列表
  async function loadBookListForManager() {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const currentBookId = await getCurrentVocabularyBook();
      const bookListManager = document.getElementById('bookListManager');

      if (!bookListManager) return;

      const books = Object.values(vocabularyBooks);
      
      if (books.length === 0) {
        bookListManager.innerHTML = '<div class="no-books">暂无生词本</div>';
        return;
      }

      const html = books.map(book => `
        <div class="book-manager-item ${book.id === currentBookId ? 'current' : ''}" data-book-id="${book.id}">
          <div class="book-manager-info">
            <div class="book-manager-name">${book.name}</div>
            <div class="book-manager-description">${book.description || '无描述'}</div>
            <div class="book-manager-stats">${book.words?.length || 0} 个单词 • 创建于 ${new Date(book.createdAt).toLocaleDateString()}</div>
          </div>
          <div class="book-manager-actions">
            ${book.id === currentBookId ? '<span class="current-badge">当前</span>' : `<button class="switch-book-btn" data-book-id="${book.id}">切换</button>`}
            ${book.id !== 'default' ? `<button class="edit-book-btn" data-book-id="${book.id}">编辑</button>` : ''}
            ${book.id !== 'default' ? `<button class="delete-book-btn" data-book-id="${book.id}">删除</button>` : ''}
          </div>
        </div>
      `).join('');

      bookListManager.innerHTML = html;

      // 绑定按钮事件
      bookListManager.querySelectorAll('.switch-book-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const bookId = btn.getAttribute('data-book-id');
          await setCurrentVocabularyBook(bookId);
          loadVocabularyBooks(); // 刷新选择器
          loadBookListForManager(); // 刷新管理器列表
        };
      });

      bookListManager.querySelectorAll('.edit-book-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const bookId = btn.getAttribute('data-book-id');
          editVocabularyBook(bookId);
        };
      });

      bookListManager.querySelectorAll('.delete-book-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const bookId = btn.getAttribute('data-book-id');
          deleteVocabularyBook(bookId);
        };
      });

    } catch (error) {
      console.error('加载生词本列表失败:', error);
      const bookListManager = document.getElementById('bookListManager');
      if (bookListManager) {
        bookListManager.innerHTML = '<div class="error">加载失败</div>';
      }
    }
  }

  // 创建新生词本对话框
  function showCreateBookDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'create-book-dialog-popup';
    dialog.innerHTML = `
      <div class="dialog-content-popup">
        <div class="dialog-header-popup">
          <h3>创建新生词本</h3>
          <button class="close-dialog-popup">✕</button>
        </div>
        <div class="dialog-body-popup">
          <div class="form-group-popup">
            <label>生词本名称：</label>
            <input type="text" id="bookNamePopup" placeholder="请输入生词本名称" maxlength="50">
          </div>
          <div class="form-group-popup">
            <label>描述（可选）：</label>
            <textarea id="bookDescriptionPopup" placeholder="请输入生词本描述" maxlength="200"></textarea>
          </div>
        </div>
        <div class="dialog-footer-popup">
          <button class="cancel-btn-popup">取消</button>
          <button class="create-btn-popup">创建</button>
        </div>
      </div>
    `;

    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(dialog);

    // 绑定事件
    const closeDialog = () => {
      document.body.removeChild(dialog);
    };

    dialog.querySelector('.close-dialog-popup').onclick = closeDialog;
    dialog.querySelector('.cancel-btn-popup').onclick = closeDialog;

    dialog.querySelector('.create-btn-popup').onclick = async () => {
      const name = dialog.querySelector('#bookNamePopup').value.trim();
      const description = dialog.querySelector('#bookDescriptionPopup').value.trim();

      if (!name) {
        alert('请输入生词本名称');
        return;
      }

      try {
        await createVocabularyBook(name, description);
        closeDialog();
        loadVocabularyBooks(); // 刷新选择器
        loadBookListForManager(); // 刷新管理器列表
        showMessage('生词本创建成功', 'success');
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
      dialog.querySelector('#bookNamePopup').focus();
    }, 100);
  }

  // 创建生词本
  async function createVocabularyBook(name, description = '') {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      vocabularyBooks[bookId] = {
        id: bookId,
        name: name,
        description: description,
        createdAt: new Date().toISOString(),
        words: []
      };

      await saveVocabularyBooks(vocabularyBooks);
      return bookId;
    } catch (error) {
      console.error('创建生词本失败:', error);
      throw error;
    }
  }

  // 编辑生词本
  async function editVocabularyBook(bookId) {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const book = vocabularyBooks[bookId];
      
      if (!book) {
        alert('生词本不存在');
        return;
      }

      const newName = prompt('请输入新的生词本名称：', book.name);
      if (newName === null) return; // 用户取消
      
      if (!newName.trim()) {
        alert('生词本名称不能为空');
        return;
      }

      const newDescription = prompt('请输入新的描述（可选）：', book.description || '');
      if (newDescription === null) return; // 用户取消

      book.name = newName.trim();
      book.description = newDescription?.trim() || '';
      
      await saveVocabularyBooks(vocabularyBooks);
      loadVocabularyBooks(); // 刷新选择器
      loadBookListForManager(); // 刷新管理器列表
      showMessage('生词本更新成功', 'success');
    } catch (error) {
      console.error('编辑生词本失败:', error);
      alert('编辑生词本失败：' + error.message);
    }
  }

  // 删除生词本
  async function deleteVocabularyBook(bookId) {
    try {
      const vocabularyBooks = await getVocabularyBooks();
      const book = vocabularyBooks[bookId];
      
      if (!book) {
        alert('生词本不存在');
        return;
      }

      if (bookId === 'default') {
        alert('默认生词本不能删除');
        return;
      }

      const wordCount = book.words?.length || 0;
      const confirmMessage = wordCount > 0 
        ? `确定要删除生词本"${book.name}"吗？\n这将同时删除其中的 ${wordCount} 个生词，此操作不可恢复！`
        : `确定要删除生词本"${book.name}"吗？`;

      if (!confirm(confirmMessage)) {
        return;
      }

      delete vocabularyBooks[bookId];
      
      // 如果删除的是当前生词本，切换到默认生词本
      const currentBookId = await getCurrentVocabularyBook();
      if (currentBookId === bookId) {
        await setCurrentVocabularyBook('default');
      }
      
      await saveVocabularyBooks(vocabularyBooks);
      loadVocabularyBooks(); // 刷新选择器
      loadBookListForManager(); // 刷新管理器列表
      showMessage('生词本删除成功', 'success');
    } catch (error) {
      console.error('删除生词本失败:', error);
      alert('删除生词本失败：' + error.message);
    }
  }


});