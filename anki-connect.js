// Anki Connect 集成模块 - 简化版（专注音频按钮）
class AnkiConnect {
  constructor() {
    this.baseUrl = 'http://localhost:8765';
    this.version = 6;
  }

  // 检查Anki Connect是否可用
  async checkConnection() {
    try {
      const response = await this.invoke('version');
      return response !== null;
    } catch (error) {
      console.error('Anki Connect连接失败:', error);
      return false;
    }
  }

  // 调用Anki Connect API
  async invoke(action, params = {}) {
    const requestBody = {
      action: action,
      version: this.version,
      params: params
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      return data.result;
    } catch (error) {
      console.error('Anki Connect请求失败:', error);
      throw error;
    }
  }

  // 获取所有牌组名称
  async getDeckNames() {
    return await this.invoke('deckNames');
  }

  // 创建牌组
  async createDeck(deckName) {
    return await this.invoke('createDeck', { deck: deckName });
  }

  // 批量添加笔记（简化版，专注音频功能）
  async addNotes(words, deckName = '英语生词', progressCallback = null) {
    try {
      // 确保牌组存在
      const deckNames = await this.getDeckNames();
      if (!deckNames.includes(deckName)) {
        await this.createDeck(deckName);
      }

      const results = [];
      const skippedWords = [];

      for (let i = 0; i < words.length; i++) {
        const item = words[i];

        // 更新进度
        if (progressCallback) {
          progressCallback(i + 1);
        }

        try {
          // 检查是否已存在
          const exists = await this.wordExists(item.word, deckName);
          if (exists) {
            console.log(`词汇 "${item.word}" 已存在于Anki中，跳过`);
            skippedWords.push(item.word);
            results.push(null);
            continue;
          }

          // 根据词汇类型获取音频
          const wordType = item.wordType || 'english';
          const audioData = await this.getAudioData(item.word, wordType);

          // 格式化卡片内容（简化版）
          const cardContent = this.formatSimpleCardContent(item, wordType, audioData?.filename);

          // 使用Basic模板
          const note = {
            deckName: deckName,
            modelName: 'Basic',
            fields: {
              Front: cardContent.front,
              Back: cardContent.back
            },
            tags: ['vocabulary', 'browser-extension', wordType]
          };

          // 如果有音频数据，先存储音频文件
          if (audioData) {
            await this.storeMediaFile(audioData.filename, audioData.data);
          }

          // 添加单个笔记
          const noteId = await this.invoke('addNote', { note });
          results.push(noteId);
          console.log(`成功添加单词 "${item.word}" 到Anki`);

        } catch (error) {
          console.error(`添加单词 "${item.word}" 失败:`, error.message);

          // 如果是重复错误，标记为跳过
          if (error.message.includes('duplicate') || error.message.includes('重复')) {
            skippedWords.push(item.word);
            results.push(null);
          } else {
            // 其他错误，重新抛出
            throw error;
          }
        }
      }

      return results;
    } catch (error) {
      console.error('批量添加笔记失败:', error);
      throw error;
    }
  }

  // 简化的卡片内容格式化（确保音频按钮显示）
  formatSimpleCardContent(item, wordType, audioFilename = null) {
    const front = item.word;
    let back = '';

    // 生成安全的单词标识符和音频文件名
    const safeWord = item.word.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    if (!audioFilename) {
      audioFilename = `tts_${wordType}_${safeWord}.mp3`;
    }

    if (wordType === 'chinese') {
      // 中文词汇卡片 - 简化版
      back = `<div style="font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.6; padding: 10px;">`;

      // 基本解释
      if (item.translation || item.explanation) {
        const explanation = item.explanation || item.translation;
        back += `<div style="margin-bottom: 15px; font-size: 18px;"><strong style="color: #ff9800;">解释：</strong>${explanation}</div>`;
      }

      // 拼音
      if (item.pronunciation) {
        back += `<div style="margin-bottom: 15px;"><strong style="color: #2196f3;">拼音：</strong><span style="font-family: 'Times New Roman', serif; font-size: 16px;">${item.pronunciation}</span></div>`;
      }

      // 音频播放按钮 - 使用Anki原生播放方法
      back += `<div style="text-align: center; margin: 20px 0;">`;
      back += `<div onclick="playAudio('${audioFilename}');" >`;
      // back += `style="display: inline-block; background: #ff9800; color: white; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-size: 16px; box-shadow: 0 2px 8px rgba(255,152,0,0.3); user-select: none; transition: all 0.2s;" `;
      // back += `onmouseover="this.style.background='#f57c00'; this.style.transform='scale(1.05)';" `;
      // back += `onmouseout="this.style.background='#ff9800'; this.style.transform='scale(1)';">`;
      // 添加音频文件引用 - 使用Anki标准格式
      back += `[sound:${audioFilename}]`;

      // 详细释义
      if (item.definitions && item.definitions.length > 0) {
        back += `<div style="margin-top: 20px;"><strong style="color: #4caf50;">详细释义：</strong></div>`;
        back += `<ul style="margin: 10px 0; padding-left: 20px;">`;
        item.definitions.slice(0, 3).forEach((def) => {
          back += `<li style="margin-bottom: 8px;">`;
          if (def.partOfSpeech) {
            back += `<em style="color: #9c27b0; font-weight: 600;">[${def.partOfSpeech}]</em> `;
          }
          back += `${def.meaning}`;
          if (def.example) {
            back += `<br><small style="color: #666; font-style: italic;">例句：${def.example}</small>`;
          }
          back += `</li>`;
        });
        back += `</ul>`;
      }

      // 同义词
      if (item.synonyms && item.synonyms.length > 0) {
        back += `<div style="margin-top: 15px;"><strong style="color: #4caf50;">同义词：</strong>`;
        back += `<span style="color: #2e7d32;">${item.synonyms.slice(0, 5).join('、')}</span></div>`;
      }

      back += `</div>`;

    } else {
      // 英文词汇卡片 - 简化版
      back = `<div style="font-family: Arial, 'Times New Roman', serif; line-height: 1.6; padding: 10px;">`;

      // 中文翻译
      if (item.translation) {
        back += `<div style="margin-bottom: 15px; font-size: 18px;"><strong style="color: #1976d2;">中文：</strong>${item.translation}</div>`;
      }

      // 音标
      if (item.pronunciation) {
        back += `<div style="margin-bottom: 15px;"><strong style="color: #2196f3;">发音：</strong>`;
        back += `<span style="font-family: 'Times New Roman', serif; font-size: 16px;">${item.pronunciation}</span></div>`;
      }

      // 音频播放按钮 - 使用Anki原生播放方法
      back += `<div style="text-align: center; margin: 20px 0;">`;
      back += `<div onclick="playAudio('${audioFilename}');" `;
      back += `style="display: inline-block; background: #1976d2; color: white; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-size: 16px; box-shadow: 0 2px 8px rgba(25,118,210,0.3); user-select: none; transition: all 0.2s;" `;
      back += `onmouseover="this.style.background='#1565c0'; this.style.transform='scale(1.05)';" `;
      back += `onmouseout="this.style.background='#1976d2'; this.style.transform='scale(1)';">`;
      // 添加音频文件引用 - 使用Anki标准格式
      back += `[sound:${audioFilename}]`;

      // 详细释义
      if (item.definitions && item.definitions.length > 0) {
        back += `<div style="margin-top: 20px;"><strong style="color: #4caf50;">详细释义：</strong></div>`;
        back += `<ul style="margin: 10px 0; padding-left: 20px;">`;
        item.definitions.slice(0, 3).forEach((def) => {
          back += `<li style="margin-bottom: 10px;">`;
          if (def.partOfSpeech) {
            back += `<em style="color: #9c27b0; font-weight: 600;">[${def.partOfSpeech}]</em> `;
          }
          back += `${def.meaning}`;

          // 英文例句
          if (def.englishExample) {
            back += `<br><small style="color: #2e7d32; margin-top: 4px; display: block;">📝 ${def.englishExample}</small>`;
          }

          // 中文例句
          if (def.chineseExample) {
            back += `<br><small style="color: #666; margin-top: 2px; display: block;">🔤 ${def.chineseExample}</small>`;
          }

          back += `</li>`;
        });
        back += `</ul>`;
      }

      // 同义词
      if (item.synonyms && item.synonyms.length > 0) {
        back += `<div style="margin-top: 15px;"><strong style="color: #4caf50;">同义词：</strong>`;
        back += `<span style="color: #2e7d32;">${item.synonyms.slice(0, 6).join(', ')}</span></div>`;
      }

      back += `</div>`;
    }



    return { front, back };
  }

  // 检查笔记是否已存在
  async findNotes(query) {
    return await this.invoke('findNotes', { query });
  }

  // 根据单词查找是否已存在
  async wordExists(word, deckName = '英语生词') {
    try {
      const exactQuery = `deck:"${deckName}" Front:"${word}"`;
      const exactNoteIds = await this.findNotes(exactQuery);
      return exactNoteIds.length > 0;
    } catch (error) {
      console.warn(`检查单词 "${word}" 是否存在时出错:`, error.message);
      return false;
    }
  }

  // 获取词汇发音音频数据
  async getAudioData(word, wordType = 'english') {
    const cleanWord = word.trim();
    if (!cleanWord || cleanWord.length > 50) {
      return null;
    }

    const langCode = wordType === 'chinese' ? 'zh' : 'en';

    const ttsServices = [
      {
        name: `Google TTS (${wordType === 'chinese' ? '中文' : '英文'})`,
        url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=tw-ob&q=${encodeURIComponent(cleanWord)}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://translate.google.com/'
        }
      }
    ];

    for (const service of ttsServices) {
      try {
        const response = await fetch(service.url, {
          headers: service.headers,
          method: 'GET'
        });

        if (response.ok && response.headers.get('content-type')?.includes('audio')) {
          const audioBlob = await response.blob();

          if (audioBlob.size < 100) {
            continue;
          }

          const audioBuffer = await audioBlob.arrayBuffer();
          const base64Audio = this.arrayBufferToBase64(audioBuffer);

          // 生成一致的文件名
          const safeWord = cleanWord.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
          const filename = `tts_${wordType}_${safeWord}.mp3`;

          return {
            filename: filename,
            data: base64Audio
          };
        }
      } catch (error) {
        console.warn(`${service.name} 获取发音失败:`, error.message);
      }
    }

    return null;
  }

  // 存储媒体文件到Anki
  async storeMediaFile(filename, base64Data) {
    return await this.invoke('storeMediaFile', {
      filename: filename,
      data: base64Data
    });
  }

  // 将ArrayBuffer转换为Base64
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

// 导出AnkiConnect类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnkiConnect;
} else {
  window.AnkiConnect = AnkiConnect;
}