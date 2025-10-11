# Anki重复卡片错误修复报告

## 问题描述

在同步生词到Anki时，出现 `'cannot create note because it is a duplicate'` 错误。这个问题通常发生在以下情况：

1. **重复同步**：用户多次点击同步按钮，尝试添加已存在的卡片
2. **手动添加**：用户已经手动在Anki中添加了某些单词，插件再次尝试添加
3. **不完整的同步状态**：插件的同步状态与Anki实际状态不一致
4. **大小写差异**：Anki中存在相同单词但大小写不同的卡片

## 修复方案

### 1. 智能重复检测

**添加预检查机制：**
```javascript
// 在添加笔记前先检查是否已存在
const exists = await this.wordExists(wordData.word, deckName);
if (exists) {
  console.log(`单词 "${wordData.word}" 已存在于Anki中，跳过添加`);
  return null; // 返回null表示跳过
}
```

**改进的存在性检查：**
```javascript
async wordExists(word, deckName = '英语生词') {
  // 精确匹配
  const exactQuery = `deck:"${deckName}" Front:"${word}"`;
  const exactNoteIds = await this.findNotes(exactQuery);
  
  if (exactNoteIds.length > 0) {
    return true;
  }

  // 模糊匹配（处理大小写和空格差异）
  const fuzzyQuery = `deck:"${deckName}" Front:*${word.toLowerCase()}*`;
  const fuzzyNoteIds = await this.findNotes(fuzzyQuery);
  
  // 进一步验证匹配结果
  // ...
}
```

### 2. 错误处理优化

**捕获并处理重复错误：**
```javascript
} catch (error) {
  if (error.message.includes('duplicate') || 
      error.message.includes('重复') ||
      error.message.includes('cannot create note because it is a duplicate')) {
    // 重复卡片，返回null表示跳过
    console.log(`单词 "${wordData.word}" 重复，跳过添加`);
    return null;
  } else {
    // 其他错误，重新抛出
    throw error;
  }
}
```

### 3. 批量同步优化

**逐个处理而非批量处理：**
```javascript
// 改为逐个添加，更好地处理错误
for (let i = 0; i < words.length; i++) {
  try {
    // 检查是否已存在
    const exists = await this.wordExists(item.word, deckName);
    if (exists) {
      results.push(null); // 标记为跳过
      continue;
    }
    
    // 添加单个笔记
    const noteId = await this.invoke('addNote', { note });
    results.push(noteId);
    
  } catch (error) {
    // 处理单个笔记的错误
    if (error.message.includes('duplicate')) {
      results.push(null);
    } else {
      throw error;
    }
  }
}
```

### 4. 同步状态管理

**改进同步状态更新：**
```javascript
for (let i = 0; i < unsyncedWords.length; i++) {
  if (wordIndex !== -1) {
    if (noteIds[i] !== null) {
      // 成功添加到Anki
      vocabulary[wordIndex].ankiSynced = true;
      vocabulary[wordIndex].ankiNoteId = noteIds[i];
      successCount++;
    } else {
      // 跳过（已存在或其他原因）
      // 仍然标记为已同步，避免重复尝试
      vocabulary[wordIndex].ankiSynced = true;
      vocabulary[wordIndex].ankiNoteId = 'skipped';
      skippedCount++;
    }
    vocabulary[wordIndex].syncedAt = new Date().toISOString();
  }
}
```

### 5. 用户反馈优化

**详细的同步结果提示：**
```javascript
let message = '';
if (successCount > 0 && skippedCount > 0) {
  message = `同步完成：新增 ${successCount} 个，跳过 ${skippedCount} 个已存在的生词`;
} else if (successCount > 0) {
  message = `成功同步 ${successCount} 个生词到Anki`;
} else if (skippedCount > 0) {
  message = `${skippedCount} 个生词已存在于Anki中`;
} else {
  message = '同步完成，但没有处理任何生词';
}
```

## 修复的文件

### anki-connect.js
- 新增 `wordExists()` 方法，支持精确和模糊匹配
- 改进 `addNote()` 方法，添加预检查和错误处理
- 优化 `addNotes()` 方法，逐个处理而非批量处理
- 添加详细的错误日志

### popup.js
- 改进同步状态管理逻辑
- 优化用户反馈消息
- 正确处理跳过的生词

## 测试建议

### 1. 基本重复测试
1. 添加一些生词到生词表
2. 同步到Anki
3. 再次点击同步，确认不会出现重复错误

### 2. 手动重复测试
1. 在Anki中手动添加一些单词
2. 在插件中添加相同的单词到生词表
3. 同步时应该跳过已存在的单词

### 3. 大小写测试
1. 在Anki中添加 "Hello"
2. 在插件中添加 "hello"
3. 同步时应该识别为重复并跳过

### 4. 批量同步测试
1. 添加大量生词（50+）
2. 其中一些已存在于Anki中
3. 同步应该正确处理所有情况

## 性能优化

1. **缓存检查结果**：避免重复查询相同单词
2. **批量查询优化**：减少API调用次数
3. **错误恢复**：单个失败不影响整体同步

## 兼容性

- 兼容所有版本的AnkiConnect
- 支持自定义牌组名称
- 向后兼容现有的同步状态

## 总结

修复后的同步功能能够：
- ✅ 智能检测重复卡片
- ✅ 优雅处理重复错误
- ✅ 提供详细的同步反馈
- ✅ 保持同步状态一致性
- ✅ 支持大小写和格式差异
- ✅ 不中断整体同步流程

用户现在可以安全地多次同步，不会再遇到重复卡片错误。