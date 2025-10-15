// Anki Connect 集成模块
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

  // 确保牌组存在（如果不存在则创建）
  async ensureDeckExists(deckName) {
    const deckNames = await this.getDeckNames();
    if (!deckNames.includes(deckName)) {
      console.log(`牌组 "${deckName}" 不存在，正在创建...`);
      await this.createDeck(deckName);
      return true; // 返回true表示创建了新牌组
    }
    return false; // 返回false表示牌组已存在
  }

  // 添加笔记到Anki（带音频和详细信息，智能处理重复）
  async addNote(wordData, deckName = '英语生词') {
    try {
      // 先检查是否已存在
      const exists = await this.wordExists(wordData.word, deckName);
      if (exists) {
        console.log(`单词 "${wordData.word}" 已存在于Anki中，跳过添加`);
        return null; // 返回null表示跳过
      }

      // 获取发音音频
      const audioData = await this.getAudioData(wordData.word);
      
      // 格式化背面内容
      let backContent = '';
      if (wordData.wordDetails) {
        // 使用详细词典信息
        const dictionaryService = new (await this.loadDictionaryService())();
        backContent = dictionaryService.formatForAnki(wordData.wordDetails, wordData.translation);
      } else {
        // 使用基本信息
        backContent = `<div><strong>中文：</strong>${wordData.translation}</div><br>
                      <div><strong>发音：</strong>${wordData.pronunciation}</div>`;
      }
      
      // 添加音频
      if (audioData) {
        backContent += `<br>🔊 [sound:${audioData.filename}]`;
      }
      
      const note = {
        deckName: deckName,
        modelName: 'Basic',
        fields: {
          Front: wordData.word,
          Back: backContent
        },
        tags: ['vocabulary', 'english', 'browser-extension']
      };

      // 如果有音频数据，先存储音频文件
      if (audioData) {
        await this.storeMediaFile(audioData.filename, audioData.data);
      }

      const noteId = await this.invoke('addNote', { note });
      return noteId;
    } catch (error) {
      // 处理各种错误情况
      if (error.message.includes('deck was not found')) {
        // 牌组不存在，尝试创建
        await this.createDeck(deckName);
        return await this.addNote(wordData, deckName);
      } else if (error.message.includes('duplicate') || 
                 error.message.includes('重复') ||
                 error.message.includes('cannot create note because it is a duplicate')) {
        // 重复卡片，返回null表示跳过
        console.log(`单词 "${wordData.word}" 重复，跳过添加`);
        return null;
      } else {
        // 其他错误，重新抛出
        console.error(`添加单词 "${wordData.word}" 到Anki失败:`, error.message);
        throw error;
      }
    }
  }

  // 批量添加笔记（支持中英文词汇，带音频和详细信息）
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
            results.push(null); // 标记为跳过
            continue;
          }

          // 根据词汇类型获取音频
          const wordType = item.wordType || 'english';
          const audioData = await this.getAudioData(item.word, wordType);
          
          // 根据词汇类型格式化卡片内容
          const cardContent = this.formatCardContent(item, wordType);
          
          // 添加音频
          if (audioData) {
            cardContent.back += `<br>🔊 [sound:${audioData.filename}]`;
          }
          
          // 根据词汇类型设置标签
          const tags = ['vocabulary', 'browser-extension'];
          if (wordType === 'chinese') {
            tags.push('chinese');
          } else {
            tags.push('english');
          }
          
          // 尝试使用自定义模板，如果不存在则使用Basic模板
          const modelName = await this.ensureVocabularyModel(wordType);
          
          let note;
          if (modelName === 'VocabularyCard') {
            // 使用自定义词汇卡片模板
            note = {
              deckName: deckName,
              modelName: 'VocabularyCard',
              fields: this.formatAdvancedCardFields(item, wordType),
              tags: tags
            };
          } else {
            // 使用基础模板
            note = {
              deckName: deckName,
              modelName: 'Basic',
              fields: {
                Front: cardContent.front,
                Back: cardContent.back
              },
              tags: tags
            };
          }

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

      // 如果有跳过的单词，在控制台记录
      if (skippedWords.length > 0) {
        console.log(`跳过已存在的单词: ${skippedWords.join(', ')}`);
      }

      return results;
    } catch (error) {
      console.error('批量添加笔记失败:', error);
      throw error;
    }
  }

  // 格式化卡片内容（支持中英文词汇，包含完整详细信息）
  formatCardContent(item, wordType) {
    const front = item.word;
    let back = '';

    if (wordType === 'chinese') {
      // 中文词汇卡片格式 - 包含完整信息
      back = `<div class="chinese-card" style="font-family: 'Microsoft YaHei', Arial, sans-serif; line-height: 1.6;">`;
      
      // 基本解释
      if (item.translation || item.explanation) {
        const explanation = item.explanation || item.translation;
        back += `<div style="margin-bottom: 12px;"><strong style="color: #ff9800;">解释：</strong>${explanation}</div>`;
      }
      
      // 拼音
      if (item.pronunciation) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #2196f3;">拼音：</strong><span style="font-family: 'Times New Roman', serif;">${item.pronunciation}</span></div>`;
      }
      
      // 详细释义
      if (item.definitions && item.definitions.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #4caf50;">详细释义：</strong></div>`;
        back += `<ul style="margin: 8px 0; padding-left: 20px;">`;
        item.definitions.forEach((def, index) => {
          if (index < 5) { // 显示最多5个释义
            back += `<li style="margin-bottom: 8px;">`;
            if (def.partOfSpeech) {
              back += `<em style="color: #9c27b0; font-weight: 600;">[${def.partOfSpeech}]</em> `;
            }
            back += `${def.meaning}`;
            if (def.example) {
              back += `<br><small style="color: #666; font-style: italic;">例句：${def.example}</small>`;
            }
            back += `</li>`;
          }
        });
        back += `</ul>`;
      }
      
      // 同义词
      if (item.synonyms && item.synonyms.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #4caf50;">同义词：</strong>`;
        back += `<span style="color: #2e7d32;">${item.synonyms.slice(0, 5).join('、')}</span></div>`;
      }
      
      // 反义词
      if (item.antonyms && item.antonyms.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #f44336;">反义词：</strong>`;
        back += `<span style="color: #c62828;">${item.antonyms.slice(0, 5).join('、')}</span></div>`;
      }
      
      // 常用词组
      if (item.phrases && item.phrases.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #795548;">常用词组：</strong>`;
        back += `<span style="color: #5d4037;">${item.phrases.slice(0, 5).join('、')}</span></div>`;
      }
      
      // 词汇来源
      if (item.etymology) {
        back += `<div style="margin-bottom: 12px; padding: 8px; background-color: #fff3e0; border-left: 3px solid #ff9800; border-radius: 4px;">`;
        back += `<strong style="color: #e65100;">词汇来源：</strong>${item.etymology}</div>`;
      }
      
      // 使用说明
      if (item.usage) {
        back += `<div style="margin-bottom: 12px; padding: 8px; background-color: #e8f5e8; border-left: 3px solid #4caf50; border-radius: 4px;">`;
        back += `<strong style="color: #2e7d32;">使用说明：</strong>${item.usage}</div>`;
      }
      
      // 添加时间和来源信息
      if (item.addedAt) {
        const addedDate = new Date(item.addedAt).toLocaleDateString('zh-CN');
        back += `<div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999;">`;
        back += `添加时间：${addedDate}`;
        if (item.source) {
          back += ` | 来源：${item.source}`;
        }
        back += `</div>`;
      }
      
      back += `</div>`;
      
    } else {
      // 英文词汇卡片格式 - 包含完整信息
      back = `<div class="english-card" style="font-family: Arial, 'Times New Roman', serif; line-height: 1.6;">`;
      
      // 中文翻译
      if (item.translation) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #1976d2;">中文：</strong>${item.translation}</div>`;
      }
      
      // 音标
      if (item.pronunciation) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #2196f3;">发音：</strong>`;
        back += `<span style="font-family: 'Times New Roman', serif; font-size: 16px;">${item.pronunciation}</span></div>`;
      }
      
      // 详细释义
      if (item.definitions && item.definitions.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #4caf50;">详细释义：</strong></div>`;
        back += `<ul style="margin: 8px 0; padding-left: 20px;">`;
        item.definitions.forEach((def, index) => {
          if (index < 5) { // 显示最多5个释义
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
            
            // 兼容旧格式的例句
            if (!def.englishExample && !def.chineseExample && def.example) {
              back += `<br><small style="color: #666; font-style: italic; margin-top: 4px; display: block;">例句：${def.example}</small>`;
            }
            
            back += `</li>`;
          }
        });
        back += `</ul>`;
      }
      
      // 同义词
      if (item.synonyms && item.synonyms.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #4caf50;">同义词：</strong>`;
        back += `<span style="color: #2e7d32;">${item.synonyms.slice(0, 6).join(', ')}</span></div>`;
      }
      
      // 反义词（如果有）
      if (item.antonyms && item.antonyms.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #f44336;">反义词：</strong>`;
        back += `<span style="color: #c62828;">${item.antonyms.slice(0, 6).join(', ')}</span></div>`;
      }
      
      // 常用短语
      if (item.phrases && item.phrases.length > 0) {
        back += `<div style="margin-bottom: 12px;"><strong style="color: #795548;">常用短语：</strong>`;
        back += `<span style="color: #5d4037;">${item.phrases.slice(0, 6).join(', ')}</span></div>`;
      }
      
      // 词根词缀（如果有）
      if (item.etymology) {
        back += `<div style="margin-bottom: 12px; padding: 8px; background-color: #e3f2fd; border-left: 3px solid #1976d2; border-radius: 4px;">`;
        back += `<strong style="color: #1565c0;">词根词缀：</strong>${item.etymology}</div>`;
      }
      
      // 使用说明（如果有）
      if (item.usage) {
        back += `<div style="margin-bottom: 12px; padding: 8px; background-color: #e8f5e8; border-left: 3px solid #4caf50; border-radius: 4px;">`;
        back += `<strong style="color: #2e7d32;">使用说明：</strong>${item.usage}</div>`;
      }
      
      // 添加时间和来源信息
      if (item.addedAt) {
        const addedDate = new Date(item.addedAt).toLocaleDateString('zh-CN');
        back += `<div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999;">`;
        back += `添加时间：${addedDate}`;
        if (item.source) {
          back += ` | 来源：${item.source}`;
        }
        back += `</div>`;
      }
      
      back += `</div>`;
    }

    return { front, back };
  }

  // 确保词汇卡片模板存在
  async ensureVocabularyModel(wordType) {
    try {
      const modelNames = await this.invoke('modelNames');
      
      if (!modelNames.includes('VocabularyCard')) {
        // 创建自定义词汇卡片模板
        await this.createVocabularyModel();
        return 'VocabularyCard';
      }
      
      return 'VocabularyCard';
    } catch (error) {
      console.warn('无法创建自定义模板，使用Basic模板:', error);
      return 'Basic';
    }
  }

  // 创建自定义词汇卡片模板
  async createVocabularyModel() {
    const modelData = {
      modelName: 'VocabularyCard',
      inOrderFields: [
        'Word',           // 单词/词汇
        'Translation',    // 翻译/解释
        'Pronunciation',  // 发音/拼音
        'Definitions',    // 详细释义
        'Synonyms',       // 同义词
        'Antonyms',       // 反义词
        'Phrases',        // 常用短语
        'Etymology',      // 词汇来源
        'Usage',          // 使用说明
        'Examples',       // 例句
        'WordType',       // 词汇类型
        'Source',         // 来源
        'AddedDate'       // 添加日期
      ],
      css: `
        .card {
          font-family: 'Microsoft YaHei', Arial, sans-serif;
          font-size: 16px;
          line-height: 1.6;
          color: #333;
          background-color: #fff;
          padding: 20px;
        }
        
        .word {
          font-size: 24px;
          font-weight: bold;
          color: #1976d2;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .chinese-word {
          color: #ff9800;
        }
        
        .pronunciation {
          font-size: 18px;
          color: #2196f3;
          font-family: 'Times New Roman', serif;
          text-align: center;
          margin-bottom: 15px;
        }
        
        .translation {
          font-size: 18px;
          color: #4caf50;
          margin-bottom: 15px;
          padding: 10px;
          background-color: #f8f9fa;
          border-left: 4px solid #4caf50;
          border-radius: 4px;
        }
        
        .section {
          margin-bottom: 15px;
        }
        
        .section-title {
          font-weight: bold;
          color: #666;
          margin-bottom: 8px;
          font-size: 14px;
          text-transform: uppercase;
        }
        
        .definitions {
          background-color: #f5f5f5;
          padding: 12px;
          border-radius: 6px;
        }
        
        .definition-item {
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .definition-item:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        
        .part-of-speech {
          color: #9c27b0;
          font-weight: bold;
          font-size: 12px;
        }
        
        .example {
          color: #666;
          font-style: italic;
          font-size: 14px;
          margin-top: 5px;
        }
        
        .synonyms, .antonyms {
          padding: 8px 12px;
          border-radius: 4px;
          margin-bottom: 10px;
        }
        
        .synonyms {
          background-color: #e8f5e8;
          border-left: 3px solid #4caf50;
        }
        
        .antonyms {
          background-color: #ffebee;
          border-left: 3px solid #f44336;
        }
        
        .phrases {
          background-color: #fff3e0;
          padding: 8px 12px;
          border-radius: 4px;
          border-left: 3px solid #ff9800;
        }
        
        .etymology, .usage {
          background-color: #e3f2fd;
          padding: 10px;
          border-radius: 4px;
          border-left: 3px solid #2196f3;
          font-size: 14px;
        }
        
        .meta-info {
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px solid #e0e0e0;
          font-size: 12px;
          color: #999;
          text-align: right;
        }
        
        .word-type {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          color: white;
        }
        
        .english-type {
          background-color: #1976d2;
        }
        
        .chinese-type {
          background-color: #ff9800;
        }
      `,
      cardTemplates: [
        {
          Name: 'Card 1',
          Front: `
            <div class="word {{#WordType}}{{WordType}}-word{{/WordType}}">{{Word}}</div>
            {{#Pronunciation}}<div class="pronunciation">{{Pronunciation}}</div>{{/Pronunciation}}
            {{#WordType}}<div class="word-type {{WordType}}-type">{{WordType}}</div>{{/WordType}}
          `,
          Back: `
            <div class="word {{#WordType}}{{WordType}}-word{{/WordType}}">{{Word}}</div>
            {{#Pronunciation}}<div class="pronunciation">{{Pronunciation}}</div>{{/Pronunciation}}
            
            {{#Translation}}
            <div class="translation">{{Translation}}</div>
            {{/Translation}}
            
            {{#Definitions}}
            <div class="section">
              <div class="section-title">详细释义</div>
              <div class="definitions">{{Definitions}}</div>
            </div>
            {{/Definitions}}
            
            {{#Synonyms}}
            <div class="section">
              <div class="synonyms">
                <strong>同义词：</strong>{{Synonyms}}
              </div>
            </div>
            {{/Synonyms}}
            
            {{#Antonyms}}
            <div class="section">
              <div class="antonyms">
                <strong>反义词：</strong>{{Antonyms}}
              </div>
            </div>
            {{/Antonyms}}
            
            {{#Phrases}}
            <div class="section">
              <div class="phrases">
                <strong>常用短语：</strong>{{Phrases}}
              </div>
            </div>
            {{/Phrases}}
            
            {{#Etymology}}
            <div class="section">
              <div class="etymology">
                <strong>词汇来源：</strong>{{Etymology}}
              </div>
            </div>
            {{/Etymology}}
            
            {{#Usage}}
            <div class="section">
              <div class="usage">
                <strong>使用说明：</strong>{{Usage}}
              </div>
            </div>
            {{/Usage}}
            
            {{#Examples}}
            <div class="section">
              <div class="section-title">例句</div>
              <div class="examples">{{Examples}}</div>
            </div>
            {{/Examples}}
            
            <div class="meta-info">
              {{#Source}}来源：{{Source}} | {{/Source}}
              {{#AddedDate}}添加：{{AddedDate}}{{/AddedDate}}
            </div>
          `
        }
      ]
    };

    return await this.invoke('createModel', modelData);
  }

  // 格式化高级卡片字段
  formatAdvancedCardFields(item, wordType) {
    const fields = {
      Word: item.word || '',
      Translation: item.translation || item.explanation || '',
      Pronunciation: item.pronunciation || '',
      WordType: wordType === 'chinese' ? 'chinese' : 'english',
      Source: item.source || '',
      AddedDate: item.addedAt ? new Date(item.addedAt).toLocaleDateString('zh-CN') : ''
    };

    // 格式化详细释义
    if (item.definitions && item.definitions.length > 0) {
      let definitionsHtml = '';
      item.definitions.forEach((def, index) => {
        if (index < 5) {
          definitionsHtml += '<div class="definition-item">';
          if (def.partOfSpeech) {
            definitionsHtml += `<span class="part-of-speech">[${def.partOfSpeech}]</span> `;
          }
          definitionsHtml += def.meaning || '';
          
          if (def.englishExample) {
            definitionsHtml += `<div class="example">📝 ${def.englishExample}</div>`;
          }
          if (def.chineseExample) {
            definitionsHtml += `<div class="example">🔤 ${def.chineseExample}</div>`;
          }
          if (!def.englishExample && !def.chineseExample && def.example) {
            definitionsHtml += `<div class="example">${def.example}</div>`;
          }
          
          definitionsHtml += '</div>';
        }
      });
      fields.Definitions = definitionsHtml;
    }

    // 格式化同义词
    if (item.synonyms && item.synonyms.length > 0) {
      fields.Synonyms = item.synonyms.slice(0, 6).join(wordType === 'chinese' ? '、' : ', ');
    }

    // 格式化反义词
    if (item.antonyms && item.antonyms.length > 0) {
      fields.Antonyms = item.antonyms.slice(0, 6).join(wordType === 'chinese' ? '、' : ', ');
    }

    // 格式化常用短语
    if (item.phrases && item.phrases.length > 0) {
      fields.Phrases = item.phrases.slice(0, 6).join(wordType === 'chinese' ? '、' : ', ');
    }

    // 词汇来源
    if (item.etymology) {
      fields.Etymology = item.etymology;
    }

    // 使用说明
    if (item.usage) {
      fields.Usage = item.usage;
    }

    // 格式化例句（如果有独立的例句字段）
    if (item.examples && item.examples.length > 0) {
      let examplesHtml = '';
      item.examples.forEach((example, index) => {
        if (index < 3) {
          examplesHtml += `<div class="example">${example}</div>`;
        }
      });
      fields.Examples = examplesHtml;
    }

    return fields;
  }

  // 检查笔记是否已存在
  async findNotes(query) {
    return await this.invoke('findNotes', { query });
  }

  // 根据单词查找是否已存在（支持模糊匹配）
  async wordExists(word, deckName = '英语生词') {
    try {
      // 精确匹配
      const exactQuery = `deck:"${deckName}" Front:"${word}"`;
      const exactNoteIds = await this.findNotes(exactQuery);
      
      if (exactNoteIds.length > 0) {
        return true;
      }

      // 模糊匹配（处理大小写和空格差异）
      const fuzzyQuery = `deck:"${deckName}" Front:*${word.toLowerCase()}*`;
      const fuzzyNoteIds = await this.findNotes(fuzzyQuery);
      
      if (fuzzyNoteIds.length > 0) {
        // 获取笔记信息进行更精确的比较
        const notesInfo = await this.invoke('notesInfo', { notes: fuzzyNoteIds });
        
        for (const noteInfo of notesInfo) {
          const frontField = noteInfo.fields.Front?.value || '';
          if (frontField.toLowerCase().trim() === word.toLowerCase().trim()) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.warn(`检查单词 "${word}" 是否存在时出错:`, error.message);
      // 如果检查失败，假设不存在（避免阻止同步）
      return false;
    }
  }

  // 获取笔记信息
  async getNotesInfo(noteIds) {
    return await this.invoke('notesInfo', { notes: noteIds });
  }

  // 获取词汇发音音频数据（支持中英文）
  async getAudioData(word, wordType = 'english') {
    // 清理词汇
    const cleanWord = word.trim();
    if (!cleanWord || cleanWord.length > 50) {
      return null;
    }

    // 根据词汇类型选择语言代码
    const langCode = wordType === 'chinese' ? 'zh' : 'en';
    
    const ttsServices = [
      // Google TTS (主要)
      {
        name: `Google TTS (${wordType === 'chinese' ? '中文' : '英文'})`,
        url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=tw-ob&q=${encodeURIComponent(cleanWord)}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://translate.google.com/'
        }
      },
      // Google TTS (备用)
      {
        name: `Google TTS Alt (${wordType === 'chinese' ? '中文' : '英文'})`,
        url: `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=gtx&q=${encodeURIComponent(cleanWord)}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    ];

    for (const service of ttsServices) {
      try {
        console.log(`尝试从 ${service.name} 获取 "${cleanWord}" 的发音...`);
        
        const response = await fetch(service.url, {
          headers: service.headers,
          method: 'GET'
        });

        if (response.ok && response.headers.get('content-type')?.includes('audio')) {
          const audioBlob = await response.blob();
          
          // 检查音频文件大小（太小可能是错误响应）
          if (audioBlob.size < 100) {
            console.warn(`${service.name} 返回的音频文件太小，跳过`);
            continue;
          }
          
          const audioBuffer = await audioBlob.arrayBuffer();
          const base64Audio = this.arrayBufferToBase64(audioBuffer);
          
          // 生成唯一的文件名（支持中文）
          const safeWord = cleanWord.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
          const filename = `tts_${wordType}_${safeWord}_${Date.now()}.mp3`;
          
          console.log(`成功从 ${service.name} 获取 "${cleanWord}" 的发音`);
          
          return {
            filename: filename,
            data: base64Audio
          };
        } else {
          console.warn(`${service.name} 响应异常:`, response.status, response.statusText);
        }
      } catch (error) {
        console.warn(`${service.name} 获取发音失败:`, error.message);
      }
    }

    console.warn(`所有TTS服务都无法获取 "${cleanWord}" 的发音`);
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

  // 加载词典服务
  async loadDictionaryService() {
    return new Promise((resolve, reject) => {
      if (window.DictionaryService) {
        resolve(window.DictionaryService);
        return;
      }

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('dictionary-service.js');
      script.onload = () => {
        resolve(window.DictionaryService);
      };
      script.onerror = () => {
        reject(new Error('无法加载词典服务模块'));
      };
      document.head.appendChild(script);
    });
  }
}

// 导出AnkiConnect类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnkiConnect;
} else {
  window.AnkiConnect = AnkiConnect;
}