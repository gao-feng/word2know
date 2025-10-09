// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const autoSpeakToggle = document.getElementById('autoSpeakToggle');
  
  // 加载设置
  loadSettings();
  
  // 绑定事件
  enableToggle.addEventListener('click', function() {
    toggleSetting('enabled', enableToggle);
  });
  
  autoSpeakToggle.addEventListener('click', function() {
    toggleSetting('autoSpeak', autoSpeakToggle);
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
});