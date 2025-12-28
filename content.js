// 防止重复注入
if (!window.screenshotExtensionLoaded) {
  window.screenshotExtensionLoaded = true;
  console.log('截图扩展初始化');

(function() {
  
let isCapturing = false;
let startX, startY, endX, endY;
let selectionBox = null;
let overlay = null;
let tipBox = null;
let sizeBox = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  if (request.action === 'startCapture') {
    startScreenCapture();
    sendResponse({ success: true });
  } else if (request.action === 'showResult') {
    showResultDialog(request.result, request.imageData);
    sendResponse({ success: true });
  } else if (request.action === 'updateResult') {
    // 更新分析结果
    const dialog = document.getElementById('ai-result-dialog');
    if (dialog) {
      const actionsArea = dialog.querySelector('.ai-result-actions');
      
      if (request.result.error) {
        updateResultText(dialog, `<div class="error">${request.result.error}</div>`);
      } else if (request.result.text) {
        updateResultText(dialog, `<div class="result">${formatResult(request.result.text)}</div>`);
        // 显示再问一次按钮
        if (actionsArea) {
          actionsArea.style.display = 'block';
        }
      }
    }
    sendResponse({ success: true });
  }
  
  return true; // 保持消息通道开启
});

function startScreenCapture() {
  console.log('开始截图模式');
  
  if (isCapturing) {
    console.log('已经在截图模式中');
    return;
  }
  
  isCapturing = true;
  
  // 创建遮罩层
  overlay = document.createElement('div');
  overlay.id = 'screenshot-overlay';
  document.body.appendChild(overlay);
  
  // 创建提示框
  tipBox = document.createElement('div');
  tipBox.id = 'screenshot-tip';
  tipBox.innerHTML = `
    <div class="tip-title">📸 截图模式</div>
    <div class="tip-text">
      拖动鼠标框选要截图的区域<br>
      松开鼠标完成截图
    </div>
    <div class="tip-esc">按 ESC 键取消</div>
  `;
  document.body.appendChild(tipBox);
  
  // 3秒后自动隐藏提示
  setTimeout(() => {
    if (tipBox && tipBox.parentNode) {
      tipBox.style.opacity = '0';
      tipBox.style.transition = 'opacity 0.3s';
      setTimeout(() => {
        if (tipBox && tipBox.parentNode) {
          tipBox.remove();
          tipBox = null;
        }
      }, 300);
    }
  }, 3000);
  
  // 创建选择框
  selectionBox = document.createElement('div');
  selectionBox.id = 'screenshot-selection';
  document.body.appendChild(selectionBox);
  
  // 创建尺寸提示
  sizeBox = document.createElement('div');
  sizeBox.id = 'screenshot-size';
  document.body.appendChild(sizeBox);
  
  // 添加事件监听
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}

function onMouseDown(e) {
  if (!isCapturing) return;
  
  startX = e.clientX;
  startY = e.clientY;
  
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
  
  // 隐藏提示框
  if (tipBox && tipBox.parentNode) {
    tipBox.style.display = 'none';
  }
}

function onMouseMove(e) {
  if (!isCapturing || selectionBox.style.display !== 'block') return;
  
  endX = e.clientX;
  endY = e.clientY;
  
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
  
  // 显示尺寸提示
  if (width > 0 && height > 0) {
    sizeBox.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    sizeBox.style.display = 'block';
    sizeBox.style.left = (left + width + 10) + 'px';
    sizeBox.style.top = (top - 25) + 'px';
    
    // 如果超出右边界，显示在左边
    if (left + width + 150 > window.innerWidth) {
      sizeBox.style.left = (left - 100) + 'px';
    }
    
    // 如果超出上边界，显示在下边
    if (top < 30) {
      sizeBox.style.top = (top + height + 10) + 'px';
    }
  }
}

async function onMouseUp(e) {
  if (!isCapturing) return;
  
  endX = e.clientX;
  endY = e.clientY;
  
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  
  if (width < 10 || height < 10) {
    cleanup();
    return;
  }
  
  // 截图
  await captureScreenshot();
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    cleanup();
  }
}

async function captureScreenshot() {
  try {
    // 计算截图区域（不包含滚动偏移，因为captureVisibleTab只截取可见区域）
    const rect = {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };
    
    console.log('截图区域:', rect);
    
    // 隐藏选择框和遮罩
    if (selectionBox) selectionBox.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    if (sizeBox) sizeBox.style.display = 'none';
    
    // 先截取整个屏幕
    const fullScreenshot = await chrome.runtime.sendMessage({
      action: 'captureFullScreen'
    });
    
    console.log('收到完整截图，开始裁剪');
    
    // 在content script中裁剪图片
    const croppedImage = await cropImageInContent(fullScreenshot, rect);
    
    console.log('裁剪完成，显示对话框');
    
    // 直接显示对话框
    showResultDialog({}, croppedImage);
    
    cleanup();
  } catch (error) {
    console.error('截图失败:', error);
    cleanup();
  }
}

async function cropImageInContent(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      console.log('图片加载成功，尺寸:', img.width, 'x', img.height);
      
      // 限制最大尺寸
      let targetWidth = rect.width;
      let targetHeight = rect.height;
      const maxSize = 1024;
      
      if (targetWidth > maxSize || targetHeight > maxSize) {
        const ratio = Math.min(maxSize / targetWidth, maxSize / targetHeight);
        targetWidth = Math.floor(targetWidth * ratio);
        targetHeight = Math.floor(targetHeight * ratio);
        console.log('图片过大，缩放到:', targetWidth, 'x', targetHeight);
      }
      
      // 创建canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      // 绘制裁剪后的图片
      ctx.drawImage(
        img,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        targetWidth,
        targetHeight
      );
      
      // 转换为JPEG
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log('裁剪完成，数据长度:', reader.result.length);
          resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.8);
    };
    
    img.onerror = (error) => {
      console.error('图片加载失败:', error);
      reject(error);
    };
    
    img.src = dataUrl;
  });
}

function cleanup() {
  isCapturing = false;
  
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
  
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  
  if (tipBox) {
    tipBox.remove();
    tipBox = null;
  }
  
  if (sizeBox) {
    sizeBox.remove();
    sizeBox = null;
  }
  
  document.removeEventListener('mousedown', onMouseDown);
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('keydown', onKeyDown);
}

function showResultDialog(result, imageData) {
  console.log('显示结果对话框，图片数据长度:', imageData ? imageData.length : 0);
  
  // 移除已存在的对话框
  const existingDialog = document.getElementById('ai-result-dialog');
  if (existingDialog) {
    existingDialog.remove();
  }
  
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.id = 'ai-result-dialog';
  dialog.innerHTML = `
    <div class="ai-dialog-content">
      <div class="ai-dialog-header">
        <h3>千秋AI截图</h3>
        <button class="ai-close-btn">×</button>
      </div>
      <div class="ai-dialog-body">
        <div class="ai-image-preview">
          <img src="${imageData}" alt="截图" onerror="console.error('图片加载失败')">
          <div class="ai-button-group">
            <button id="copy-base64-btn" class="ai-btn ai-btn-secondary">复制 Base64</button>
            <button id="download-img-btn" class="ai-btn ai-btn-secondary">下载图片</button>
          </div>
        </div>
        <div class="ai-question-section">
          <label class="ai-label">提问内容</label>
          <textarea id="ai-question-input" class="ai-textarea" placeholder="输入你想问的问题..."></textarea>
          <button id="ai-analyze-btn" class="ai-btn ai-btn-primary">开始分析</button>
        </div>
        <div class="ai-result-text" style="display: none;">
          <div class="ai-loading">正在分析中，请稍候...</div>
        </div>
        <div class="ai-result-actions" style="display: none; margin-top: 12px;">
          <button id="ai-ask-again-btn" class="ai-btn ai-btn-secondary" style="width: 100%;">再问一次</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // 设置默认问题
  const questionInput = dialog.querySelector('#ai-question-input');
  questionInput.value = '';
  
  // 添加拖动功能
  const header = dialog.querySelector('.ai-dialog-header');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('ai-close-btn')) return;
    isDragging = true;
    initialX = e.clientX - dialog.offsetLeft;
    initialY = e.clientY - dialog.offsetTop;
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    dialog.style.left = currentX + 'px';
    dialog.style.top = currentY + 'px';
    dialog.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // 复制Base64按钮
  dialog.querySelector('#copy-base64-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(imageData).then(() => {
      const btn = dialog.querySelector('#copy-base64-btn');
      const originalText = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('ai-btn-success');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('ai-btn-success');
      }, 2000);
    }).catch(err => {
      alert('复制失败: ' + err.message);
    });
  });
  
  // 下载图片按钮
  dialog.querySelector('#download-img-btn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `screenshot-${Date.now()}.jpg`;
    link.click();
  });
  
  // 开始分析按钮
  dialog.querySelector('#ai-analyze-btn').addEventListener('click', () => {
    const question = questionInput.value.trim();
    if (!question) {
      alert('请输入你想问的问题');
      return;
    }
    
    startAnalysis(dialog, imageData, question);
  });
  
  // 关闭按钮
  dialog.querySelector('.ai-close-btn').addEventListener('click', () => {
    dialog.remove();
  });
}

function startAnalysis(dialog, imageData, question) {
  // 隐藏问题区域，显示结果区域
  dialog.querySelector('.ai-question-section').style.display = 'none';
  const resultArea = dialog.querySelector('.ai-result-text');
  const actionsArea = dialog.querySelector('.ai-result-actions');
  resultArea.style.display = 'block';
  resultArea.innerHTML = '<div class="ai-loading">正在分析中，请稍候...</div>';
  actionsArea.style.display = 'none';
  
  // 获取配置并发送分析请求
  chrome.storage.local.get(['apiKey', 'modelId'], (config) => {
    console.log('获取配置:', { 
      hasApiKey: !!config.apiKey, 
      modelId: config.modelId 
    });
    
    if (config.apiKey && config.modelId) {
      console.log('发送分析请求，问题:', question);
      // 发送分析请求
      chrome.runtime.sendMessage({
        action: 'analyzeImage',
        imageData: imageData,
        apiKey: config.apiKey,
        modelId: config.modelId,
        question: question
      }, (response) => {
        console.log('收到background响应:', response);
      });
    } else {
      updateResultText(dialog, '<div class="error">未找到API配置，请先在插件弹窗中配置API Key和模型ID</div>');
    }
  });
  
  // 设置再问一次按钮
  const askAgainBtn = dialog.querySelector('#ai-ask-again-btn');
  if (askAgainBtn) {
    askAgainBtn.onclick = () => {
      // 显示问题区域，隐藏结果区域
      dialog.querySelector('.ai-question-section').style.display = 'block';
      resultArea.style.display = 'none';
      actionsArea.style.display = 'none';
    };
  }
}

function updateResultText(dialog, html) {
  const resultContainer = dialog.querySelector('.ai-result-text');
  if (resultContainer) {
    resultContainer.innerHTML = html;
  }
}

function formatResult(text) {
  if (!text) return '';
  
  // 转义HTML特殊字符
  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };
  
  // 处理代码块
  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const escapedCode = escapeHtml(code.trim());
    const language = lang || 'text';
    return `<div class="code-block">
      <div class="code-header">
        <span class="code-lang">${language}</span>
        <button class="copy-code-btn" onclick="copyCode(this)">📋 复制代码</button>
      </div>
      <pre><code>${escapedCode}</code></pre>
    </div>`;
  });
  
  // 处理行内代码
  text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // 处理标题
  text = text.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  
  // 处理粗体
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // 处理列表
  text = text.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  text = text.replace(/(<li class="md-li">.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');
  
  // 处理数字列表
  text = text.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');
  
  // 处理换行
  text = text.replace(/\n\n/g, '</p><p class="md-p">');
  text = text.replace(/\n/g, '<br>');
  
  return `<div class="md-content"><p class="md-p">${text}</p></div>`;
}

// 添加全局复制代码函数
window.copyCode = function(button) {
  const codeBlock = button.closest('.code-block');
  const code = codeBlock.querySelector('code').textContent;
  
  navigator.clipboard.writeText(code).then(() => {
    const originalText = button.textContent;
    button.textContent = '✅ 已复制';
    button.style.background = '#34a853';
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '';
    }, 2000);
  }).catch(err => {
    console.error('复制失败:', err);
  });
};

})(); // 立即执行函数结束

} // 防止重复注入结束
