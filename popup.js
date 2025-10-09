// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const autoSpeakToggle = document.getElementById('autoSpeakToggle');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const settingsTab = document.getElementById('settingsTab');
  const vocabularyTab = document.getElementById('vocabularyTab');
  const clearVocabBtn = document.getElementById('clearVocab');
  
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
});