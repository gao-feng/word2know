// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const autoSpeakToggle = document.getElementById('autoSpeakToggle');
  const translationServiceSelect = document.getElementById('translationService');
  
  // 硅基流动设置元素
  const siliconFlowApiKeyInput = document.getElementById('siliconFlowApiKey');
  const testSiliconFlowApiKeyBtn = document.getElementById('testSiliconFlowApiKey');
  const saveSiliconFlowApiKeyBtn = document.getElementById('saveSiliconFlowApiKey');
  const siliconFlowApiStatusDiv = document.getElementById('siliconFlowApiStatus');
  
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
  
  // 加载设置和生词表
  loadSettings();
  loadVocabulary();
  
  // 绑定设置事件
  enableToggle.addEventListener('click', function() {
    toggleSetting('enabled', enableToggle);
  });
  
  autoSpeakToggle.addEventListener('click', function() {
    toggleSetting('autoSpeak', autoSpeakToggle);
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

  // 绑定硅基流动API设置事件
  testSiliconFlowApiKeyBtn.addEventListener('click', testSiliconFlowApiKey);
  saveSiliconFlowApiKeyBtn.addEventListener('click', saveSiliconFlowApiKey);

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
  
  function loadSettings() {
    chrome.storage.sync.get([
      'enabled', 'autoSpeak', 'translationService', 
      'siliconFlowApiKey', 'openaiApiKey', 'openaiBaseUrl', 'openaiModel'
    ], function(result) {
      const enabled = result.enabled !== false; // 默认启用
      const autoSpeak = result.autoSpeak === true; // 默认关闭
      const translationService = result.translationService || 'google';
      const siliconFlowApiKey = result.siliconFlowApiKey || '';
      const openaiApiKey = result.openaiApiKey || '';
      const openaiBaseUrl = result.openaiBaseUrl || 'https://api.openai.com/v1/chat/completions';
      const openaiModel = result.openaiModel || 'gpt-3.5-turbo';
      
      updateToggleState(enableToggle, enabled);
      updateToggleState(autoSpeakToggle, autoSpeak);
      translationServiceSelect.value = translationService;
      siliconFlowApiKeyInput.value = siliconFlowApiKey;
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

  function loadVocabulary() {
    chrome.storage.sync.get(['vocabulary'], function(result) {
      const vocabulary = result.vocabulary || [];
      displayVocabulary(vocabulary);
    });
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
      <div class="vocab-item ${item.ankiSynced ? 'synced' : 'unsynced'}">
        <div class="vocab-content">
          <div class="vocab-word">
            ${item.word}
            ${item.ankiSynced ? '<span class="sync-status" title="已同步到Anki">✓</span>' : '<span class="sync-status" title="未同步">○</span>'}
          </div>
          <div class="vocab-translation">${item.translation}</div>
        </div>
        <div class="vocab-actions">
          <button class="vocab-btn" onclick="speakWord('${item.word}')" title="发音">🔊</button>
          <button class="vocab-btn" onclick="removeWord(${index})" title="删除">🗑️</button>
        </div>
      </div>
    `).join('');

    vocabularyList.innerHTML = html;
  }

  function clearVocabulary() {
    chrome.storage.sync.set({ vocabulary: [] }, function() {
      loadVocabulary();
    });
  }

  // 全局函数，供HTML调用
  window.speakWord = function(word) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      speechSynthesis.speak(utterance);
    }
  };

  window.removeWord = function(index) {
    chrome.storage.sync.get(['vocabulary'], function(result) {
      const vocabulary = result.vocabulary || [];
      vocabulary.splice(index, 1);
      chrome.storage.sync.set({ vocabulary }, function() {
        loadVocabulary();
      });
    });
  };

  function exportToAnki() {
    chrome.storage.sync.get(['vocabulary'], function(result) {
      const vocabulary = result.vocabulary || [];
      
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
    });
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

  // 同步到Anki功能
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

      // 获取生词表
      const result = await chrome.storage.sync.get(['vocabulary']);
      const vocabulary = result.vocabulary || [];
      
      // 筛选未同步的单词
      const unsyncedWords = vocabulary.filter(item => !item.ankiSynced);
      
      if (unsyncedWords.length === 0) {
        showSyncMessage('所有生词已同步到Anki', 'success');
        return;
      }

      syncBtn.textContent = `🔄 获取发音 (0/${unsyncedWords.length})`;

      // 批量添加到Anki（包含音频）
      const noteIds = await ankiConnect.addNotes(unsyncedWords, '英语生词', (progress) => {
        syncBtn.textContent = `🔄 同步中 (${progress}/${unsyncedWords.length})`;
      });
      
      // 更新同步状态
      let successCount = 0;
      for (let i = 0; i < unsyncedWords.length; i++) {
        if (noteIds[i] !== null) {
          const wordIndex = vocabulary.findIndex(item => 
            item.word === unsyncedWords[i].word && !item.ankiSynced
          );
          if (wordIndex !== -1) {
            vocabulary[wordIndex].ankiSynced = true;
            vocabulary[wordIndex].ankiNoteId = noteIds[i];
            vocabulary[wordIndex].syncedAt = new Date().toISOString();
            successCount++;
          }
        }
      }

      // 保存更新后的生词表
      await chrome.storage.sync.set({ vocabulary });
      
      // 刷新显示
      loadVocabulary();
      
      showSyncMessage(`成功同步 ${successCount} 个生词到Anki`, 'success');

    } catch (error) {
      console.error('同步失败:', error);
      showSyncMessage(`同步失败: ${error.message}`, 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = originalText;
    }
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

  // 显示同步消息
  function showSyncMessage(message, type = 'info') {
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
    }, 4000);
  }

  // 更新API设置可见性
  function updateApiSettingsVisibility(service) {
    const siliconflowSettings = document.getElementById('siliconflowSettings');
    const openaiSettings = document.getElementById('openaiSettings');
    
    siliconflowSettings.style.display = service === 'siliconflow' ? 'block' : 'none';
    openaiSettings.style.display = service === 'openai' ? 'block' : 'none';
  }

  // 测试硅基流动API密钥
  async function testSiliconFlowApiKey() {
    const apiKey = siliconFlowApiKeyInput.value.trim();
    
    if (!apiKey) {
      showSiliconFlowApiStatus('请输入API密钥', 'error');
      return;
    }

    showSiliconFlowApiStatus('正在测试连接...', 'testing');
    testSiliconFlowApiKeyBtn.disabled = true;

    try {
      // 创建临时的翻译器实例进行测试
      const translator = new SiliconFlowTranslator();
      const validation = await translator.validateApiKey(apiKey);
      
      if (validation.valid) {
        showSiliconFlowApiStatus('API密钥有效，连接成功！', 'success');
      } else {
        showSiliconFlowApiStatus(`API密钥无效: ${validation.error}`, 'error');
      }
    } catch (error) {
      showSiliconFlowApiStatus(`测试失败: ${error.message}`, 'error');
    } finally {
      testSiliconFlowApiKeyBtn.disabled = false;
    }
  }

  // 保存硅基流动API密钥
  async function saveSiliconFlowApiKey() {
    const apiKey = siliconFlowApiKeyInput.value.trim();
    
    if (!apiKey) {
      showSiliconFlowApiStatus('请输入API密钥', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ siliconFlowApiKey: apiKey });
      showSiliconFlowApiStatus('API密钥已保存', 'success');
      
      // 通知content script更新API密钥
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateSiliconFlowApiKey',
            apiKey: apiKey
          });
        }
      });
    } catch (error) {
      showSiliconFlowApiStatus(`保存失败: ${error.message}`, 'error');
    }
  }

  // 显示硅基流动API状态消息
  function showSiliconFlowApiStatus(message, type) {
    siliconFlowApiStatusDiv.textContent = message;
    siliconFlowApiStatusDiv.className = `api-status ${type}`;
    siliconFlowApiStatusDiv.style.display = 'block';
    
    // 3秒后隐藏状态消息（除非是错误）
    if (type !== 'error') {
      setTimeout(() => {
        siliconFlowApiStatusDiv.style.display = 'none';
      }, 3000);
    }
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

  // 动态加载SiliconFlowTranslator类
  function loadSiliconFlowTranslator() {
    return new Promise((resolve, reject) => {
      if (window.SiliconFlowTranslator) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('siliconflow-translator.js');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('无法加载SiliconFlowTranslator模块'));
      document.head.appendChild(script);
    });
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
  Promise.all([
    loadSiliconFlowTranslator(),
    loadOpenAITranslator()
  ]).catch(console.error);

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

  // 在页面加载时加载SiliconFlowTranslator
  loadSiliconFlowTranslator().catch(console.error);
});