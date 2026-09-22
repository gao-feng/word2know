// 后台服务：代理OpenAI兼容API请求
// MV3下content script的fetch受宿主页面CORS限制，host_permissions不对其生效，
// 因此所有扩展API请求统一由background发起（扩展上下文享有host_permissions豁免）。

const REQUEST_TIMEOUT_MS = 60000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'openaiChat') {
    return; // 其他消息不处理，也不占用响应通道
  }

  handleOpenAIChat(message.payload)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true; // 保持通道开启以支持异步响应
});

async function handleOpenAIChat(payload) {
  if (!payload || !payload.url) {
    return { ok: false, error: 'API地址为空' };
  }
  if (!payload.apiKey) {
    return { ok: false, error: 'API密钥为空' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(payload.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${payload.apiKey}`
      },
      body: JSON.stringify(payload.body),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, error: `API请求失败: ${response.status} - ${await extractErrorMessage(response)}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { ok: false, error: `请求超时（${REQUEST_TIMEOUT_MS / 1000}秒），请检查API地址或网络` };
    }
    return { ok: false, error: `网络请求失败: ${error.message}（请检查API地址是否正确、网络是否可达）` };
  } finally {
    clearTimeout(timer);
  }
}

// 兼容各服务商不同的错误返回结构
async function extractErrorMessage(response) {
  let text = '';
  try {
    text = await response.text();
  } catch (e) {
    return response.statusText || '无法读取错误信息';
  }
  if (!text) {
    return response.statusText || '无返回内容';
  }
  try {
    const data = JSON.parse(text);
    const msg = (data.error && data.error.message) || data.message || data.msg;
    if (typeof msg === 'string' && msg) {
      return msg;
    }
  } catch (e) {
    // 非JSON响应，直接展示文本
  }
  return text.length > 200 ? text.slice(0, 200) + '...' : text;
}
