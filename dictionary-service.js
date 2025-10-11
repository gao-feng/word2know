// 词典服务模块 - 获取详细的单词信息
class DictionaryService {
  constructor() {
    this.cache = new Map();
    this.services = [
      {
        name: 'Free Dictionary API',
        url: 'https://api.dictionaryapi.dev/api/v2/entries/en/',
        parser: this.parseDictionaryAPI.bind(this)
      },
      {
        name: 'WordsAPI (RapidAPI)',
        url: 'https://wordsapiv1.p.rapidapi.com/words/',
        parser: this.parseWordsAPI.bind(this),
        headers: {
          'X-RapidAPI-Key': 'demo', // 使用demo key，实际使用需要申请
          'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
        }
      }
    ];
  }

  // 获取详细的单词信息
  async getWordDetails(word) {
    const cleanWord = word.trim().toLowerCase();
    
    // 检查缓存
    if (this.cache.has(cleanWord)) {
      console.log(`从缓存获取 "${cleanWord}" 的详细信息`);
      return this.cache.get(cleanWord);
    }

    // 过滤掉太长或太短的词
    if (cleanWord.length < 2 || cleanWord.length > 30) {
      return this.createBasicWordInfo(cleanWord);
    }

    // 并行尝试所有词典服务（但只等待最快的）
    const promises = this.services.map(service => this.tryService(service, cleanWord));
    
    try {
      // 使用Promise.race获取最快的响应，但设置总超时
      const racePromise = Promise.race(promises.filter(p => p !== null));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('所有词典服务超时')), 4000)
      );

      const wordDetails = await Promise.race([racePromise, timeoutPromise]);
      
      if (wordDetails && wordDetails.definitions.length > 0) {
        // 缓存结果
        this.cache.set(cleanWord, wordDetails);
        console.log(`成功获取 "${cleanWord}" 的详细信息`);
        return wordDetails;
      }
    } catch (error) {
      console.warn(`获取 "${cleanWord}" 详细信息失败:`, error.message);
    }

    // 如果所有服务都失败，返回基本信息
    const basicInfo = this.createBasicWordInfo(cleanWord);
    this.cache.set(cleanWord, basicInfo);
    return basicInfo;
  }

  // 尝试单个服务
  async tryService(service, cleanWord) {
    try {
      console.log(`尝试从 ${service.name} 获取 "${cleanWord}" 的详细信息...`);
      
      const url = service.url + encodeURIComponent(cleanWord);
      const options = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...service.headers
        }
      };

      // 为每个服务设置独立的超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const wordDetails = service.parser(data, cleanWord);
        
        if (wordDetails && wordDetails.definitions.length > 0) {
          console.log(`${service.name} 成功返回结果`);
          return wordDetails;
        }
      }
      
      throw new Error(`${service.name} 无有效数据`);
    } catch (error) {
      console.warn(`${service.name} 失败:`, error.message);
      return null;
    }
  }

  // 解析 Free Dictionary API 响应
  parseDictionaryAPI(data, word) {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const entry = data[0];
    const wordDetails = {
      word: entry.word || word,
      phonetic: entry.phonetic || '',
      phonetics: entry.phonetics || [],
      definitions: [],
      synonyms: new Set(),
      antonyms: new Set(),
      examples: []
    };

    // 处理含义和定义
    if (entry.meanings && Array.isArray(entry.meanings)) {
      entry.meanings.forEach(meaning => {
        const partOfSpeech = meaning.partOfSpeech || '';
        
        if (meaning.definitions && Array.isArray(meaning.definitions)) {
          meaning.definitions.forEach(def => {
            wordDetails.definitions.push({
              partOfSpeech: partOfSpeech,
              definition: def.definition || '',
              example: def.example || '',
              synonyms: def.synonyms || [],
              antonyms: def.antonyms || []
            });

            // 收集例句
            if (def.example) {
              wordDetails.examples.push(def.example);
            }

            // 收集同义词和反义词
            if (def.synonyms) {
              def.synonyms.forEach(syn => wordDetails.synonyms.add(syn));
            }
            if (def.antonyms) {
              def.antonyms.forEach(ant => wordDetails.antonyms.add(ant));
            }
          });
        }

        // 收集词性级别的同义词和反义词
        if (meaning.synonyms) {
          meaning.synonyms.forEach(syn => wordDetails.synonyms.add(syn));
        }
        if (meaning.antonyms) {
          meaning.antonyms.forEach(ant => wordDetails.antonyms.add(ant));
        }
      });
    }

    // 转换Set为Array
    wordDetails.synonyms = Array.from(wordDetails.synonyms).slice(0, 8); // 限制数量
    wordDetails.antonyms = Array.from(wordDetails.antonyms).slice(0, 8);
    wordDetails.examples = wordDetails.examples.slice(0, 3); // 限制例句数量

    return wordDetails;
  }

  // 解析 WordsAPI 响应（备用）
  parseWordsAPI(data, word) {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const wordDetails = {
      word: data.word || word,
      phonetic: data.pronunciation?.all || '',
      phonetics: [],
      definitions: [],
      synonyms: data.synonyms || [],
      antonyms: data.antonyms || [],
      examples: data.examples || []
    };

    // 处理定义
    if (data.results && Array.isArray(data.results)) {
      data.results.forEach(result => {
        wordDetails.definitions.push({
          partOfSpeech: result.partOfSpeech || '',
          definition: result.definition || '',
          example: result.examples?.[0] || '',
          synonyms: result.synonyms || [],
          antonyms: result.antonyms || []
        });
      });
    }

    return wordDetails;
  }

  // 创建基本单词信息（当词典API失败时）
  createBasicWordInfo(word) {
    return {
      word: word,
      phonetic: `/${word}/`,
      phonetics: [],
      definitions: [{
        partOfSpeech: '',
        definition: '请查看中文翻译',
        example: '',
        synonyms: [],
        antonyms: []
      }],
      synonyms: [],
      antonyms: [],
      examples: []
    };
  }

  // 格式化单词详细信息为HTML
  formatWordDetailsHTML(wordDetails, chineseTranslation) {
    let html = `<div class="word-details">`;
    
    // 单词和发音
    html += `<div class="word-header">
      <h3 class="word-title">${wordDetails.word}</h3>
      ${wordDetails.phonetic ? `<span class="phonetic">${wordDetails.phonetic}</span>` : ''}
    </div>`;

    // 中文翻译
    if (chineseTranslation) {
      html += `<div class="chinese-translation">
        <strong>中文：</strong>${chineseTranslation}
      </div>`;
    }

    // 英文定义
    if (wordDetails.definitions.length > 0) {
      html += `<div class="definitions">
        <strong>英文释义：</strong>
        <ol>`;
      
      wordDetails.definitions.slice(0, 3).forEach(def => {
        html += `<li>`;
        if (def.partOfSpeech) {
          html += `<em class="part-of-speech">${def.partOfSpeech}</em> `;
        }
        html += `${def.definition}`;
        if (def.example) {
          html += `<br><span class="example">例：${def.example}</span>`;
        }
        html += `</li>`;
      });
      
      html += `</ol></div>`;
    }

    // 同义词
    if (wordDetails.synonyms.length > 0) {
      html += `<div class="synonyms">
        <strong>同义词：</strong>${wordDetails.synonyms.slice(0, 5).join(', ')}
      </div>`;
    }

    // 反义词
    if (wordDetails.antonyms.length > 0) {
      html += `<div class="antonyms">
        <strong>反义词：</strong>${wordDetails.antonyms.slice(0, 5).join(', ')}
      </div>`;
    }

    // 例句
    if (wordDetails.examples.length > 0) {
      html += `<div class="examples">
        <strong>例句：</strong>
        <ul>`;
      
      wordDetails.examples.slice(0, 2).forEach(example => {
        html += `<li>${example}</li>`;
      });
      
      html += `</ul></div>`;
    }

    html += `</div>`;
    return html;
  }

  // 格式化为Anki卡片内容
  formatForAnki(wordDetails, chineseTranslation) {
    let ankiContent = '';

    // 中文翻译
    if (chineseTranslation) {
      ankiContent += `<div><strong>中文：</strong>${chineseTranslation}</div><br>`;
    }

    // 发音
    if (wordDetails.phonetic) {
      ankiContent += `<div><strong>发音：</strong>${wordDetails.phonetic}</div><br>`;
    }

    // 英文定义（简化版）
    if (wordDetails.definitions.length > 0) {
      ankiContent += `<div><strong>英文释义：</strong><br>`;
      wordDetails.definitions.slice(0, 2).forEach((def, index) => {
        ankiContent += `${index + 1}. `;
        if (def.partOfSpeech) {
          ankiContent += `<em>${def.partOfSpeech}</em> `;
        }
        ankiContent += `${def.definition}<br>`;
      });
      ankiContent += `</div><br>`;
    }

    // 同义词（简化）
    if (wordDetails.synonyms.length > 0) {
      ankiContent += `<div><strong>同义词：</strong>${wordDetails.synonyms.slice(0, 3).join(', ')}</div><br>`;
    }

    // 例句（一个）
    if (wordDetails.examples.length > 0) {
      ankiContent += `<div><strong>例句：</strong>${wordDetails.examples[0]}</div>`;
    }

    return ankiContent;
  }
}

// 导出DictionaryService类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DictionaryService;
} else {
  window.DictionaryService = DictionaryService;
}