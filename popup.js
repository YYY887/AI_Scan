// 加载保存的配置
chrome.storage.local.get(['apiKey', 'modelId'], (result) => {
  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
  
  // 强制使用正确的模型ID
  if (result.modelId) {
    // 如果是旧的格式，替换为新的vision模型
    if (result.modelId.includes('Doubao') || result.modelId.includes('flash-250828')) {
      document.getElementById('modelId').value = 'doubao-seed-1-6-vision-250815';
      // 自动保存正确的配置
      chrome.storage.local.set({ modelId: 'doubao-seed-1-6-vision-250815' });
    } else {
      document.getElementById('modelId').value = result.modelId;
    }
  }
});

// 保存配置按钮
document.getElementById('saveConfig').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const modelId = document.getElementById('modelId').value.trim();
  
  if (!apiKey || !modelId) {
    showStatus('请填写完整的配置信息', 'error');
    return;
  }
  
  await chrome.storage.local.set({ apiKey, modelId });
  showStatus('配置保存成功', 'success');
  console.log('保存的配置:', { apiKey: apiKey.substring(0, 10) + '...', modelId });
});

// 清除配置按钮
document.getElementById('clearConfig').addEventListener('click', async () => {
  if (confirm('确定要清除所有配置吗？')) {
    await chrome.storage.local.clear();
    document.getElementById('apiKey').value = '';
    document.getElementById('modelId').value = 'doubao-seed-1-6-vision-250815';
    showStatus('配置已清除', 'success');
  }
});

// 开始截图
document.getElementById('startCapture').addEventListener('click', async () => {
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    const modelId = document.getElementById('modelId').value.trim();
    
    // 检查配置
    if (!apiKey || !modelId) {
      showStatus('请先填写并保存配置', 'error');
      return;
    }
    
    // 保存配置
    await chrome.storage.local.set({ apiKey, modelId });
    
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 检查是否是特殊页面
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      showStatus('无法在浏览器内置页面使用截图功能', 'error');
      return;
    }
    
    console.log('准备注入content script到标签页:', tab.id);
    
    // 强制重新注入content script和CSS
    try {
      // 先注入CSS
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles.css']
      });
      console.log('CSS注入成功');
      
      // 再注入JS
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('JS注入成功');
      
      // 等待脚本加载
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (e) {
      console.error('注入失败:', e);
      showStatus('注入脚本失败，请刷新页面后重试', 'error');
      return;
    }
    
    // 发送开始截图消息
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'startCapture' });
      console.log('截图消息已发送');
      // 关闭popup
      window.close();
    } catch (e) {
      console.error('发送消息失败:', e);
      showStatus('启动截图失败，请重试', 'error');
    }
    
  } catch (error) {
    console.error('启动截图失败:', error);
    showStatus('启动截图失败: ' + error.message, 'error');
  }
});

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
  
  setTimeout(() => {
    statusEl.className = 'status';
  }, 3000);
}
