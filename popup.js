// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const autoSpeakToggle = document.getElementById('autoSpeakToggle');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const settingsTab = document.getElementById('settingsTab');
  const vocabularyTab = document.getElementById('vocabularyTab');
  const clearVocabBtn = document.getElementById('clearVocab');
  const exportAnkiBtn = document.getElementById('exportAnki');
  
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
  
  function loadSettings() {
    chrome.storage.sync.get(['enabled', 'autoSpeak'], function(result) {
      const enabled = result.enabled !== false; // 默认启用
      const autoSpeak = result.autoSpeak === true; // 默认关闭
      
      updateToggleState(enableToggle, enabled);
      updateToggleState(autoSpeakToggle, autoSpeak);
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
    
    vocabCount.textContent = vocabulary.length;

    if (vocabulary.length === 0) {
      vocabularyList.innerHTML = '<div class="empty-state">暂无生词</div>';
      return;
    }

    const html = vocabulary.map((item, index) => `
      <div class="vocab-item">
        <div class="vocab-content">
          <div class="vocab-word">${item.word}</div>
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
});