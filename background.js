// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background收到消息:', request.action);
  
  if (request.action === 'captureFullScreen') {
    // 截取完整屏幕并返回
    chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    }).then(screenshot => {
      console.log('截图完成');
      sendResponse(screenshot);
    }).catch(error => {
      console.error('截图失败:', error);
      sendResponse(null);
    });
    return true; // 保持消息通道开启
  } else if (request.action === 'analyzeImage') {
    // 使用异步处理
    handleAnalyze(request.imageData, request.apiKey, request.modelId, sender.tab.id, request.question || '请详细分析这张图片').then(() => {
      console.log('分析处理完成');
    }).catch(error => {
      console.error('分析处理错误:', error);
    });
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background收到消息:', request.action);
  
  if (request.action === 'captureFullScreen') {
    // 截取完整屏幕并返回
    chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    }).then(screenshot => {
      console.log('截图完成');
      sendResponse(screenshot);
    }).catch(error => {
      console.error('截图失败:', error);
      sendResponse(null);
    });
    return true; // 保持消息通道开启
  } else if (request.action === 'analyzeImage') {
    // 使用异步处理
    handleAnalyze(request.imageData, request.apiKey, request.modelId, sender.tab.id, request.question || '请详细分析这张图片').then(() => {
      console.log('分析处理完成');
    }).catch(error => {
      console.error('分析处理错误:', error);
    });
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

async function handleAnalyze(imageData, apiKey, modelId, tabId, question) {
  try {
    // 调用豆包API，使用自定义问题
    const result = await analyzeImage(imageData, apiKey, modelId, question);
    
    // 显示结果
    chrome.tabs.sendMessage(tabId, {
      action: 'updateResult',
      result: { text: result }
    });
    
  } catch (error) {
    console.error('AI分析失败:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'updateResult',
      result: { error: 'AI分析失败: ' + error.message }
    });
  }
}

async function cropImage(dataUrl, rect) {
  console.log('开始裁剪图片，区域:', rect);
  
  return new Promise((resolve, reject) => {
    // 在Service Worker中使用fetch和createImageBitmap
    fetch(dataUrl)
      .then(response => response.blob())
      .then(blob => createImageBitmap(blob))
      .then(imageBitmap => {
        console.log('原始图片尺寸:', imageBitmap.width, 'x', imageBitmap.height);
        
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
        const canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d');
        
        // 绘制并缩放图片
        ctx.drawImage(
          imageBitmap,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          targetWidth,
          targetHeight
        );
        
        console.log('裁剪完成，尺寸:', targetWidth, 'x', targetHeight);
        
        // 转换为JPEG格式
        return canvas.convertToBlob({ 
          type: 'image/jpeg',
          quality: 0.8
        });
      })
      .then(blob => {
        console.log('Blob大小:', (blob.size / 1024).toFixed(2), 'KB');
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          console.log('图片转换完成');
          console.log('数据格式:', result.substring(0, 30));
          console.log('数据长度:', result.length, '字符');
          console.log('预估大小:', (result.length * 0.75 / 1024).toFixed(2), 'KB');
          resolve(result);
        };
        reader.onerror = (error) => {
          console.error('FileReader错误:', error);
          reject(error);
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error('图片处理失败:', error);
        reject(error);
      });
  });
}

async function analyzeImage(imageData, apiKey, modelId, question) {
  console.log('开始调用豆包API');
  console.log('模型:', modelId);
  console.log('问题:', question);
  console.log('图片数据前100字符:', imageData.substring(0, 100));
  console.log('图片数据总长度:', imageData.length);
  
  // 确保图片数据格式正确
  if (!imageData || !imageData.startsWith('data:image')) {
    throw new Error('图片数据格式不正确');
  }
  
  // 尝试两种格式
  // 格式1: 完整的data URL
  const fullDataUrl = imageData;
  
  // 格式2: 只用base64部分
  const base64Only = imageData.split(',')[1];
  const base64DataUrl = `data:image/jpeg;base64,${base64Only}`;
  
  console.log('尝试格式1: 完整data URL');
  console.log('格式1前缀:', fullDataUrl.substring(0, 50));
  
  const requestBody = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: base64DataUrl  // 使用重新构建的data URL
            }
          },
          {
            type: 'text',
            text: question || '请详细分析这张图片的内容'
          }
        ]
      }
    ]
  };
  
  console.log('发送请求...');
  
  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('API响应状态:', response.status);
    
    const responseText = await response.text();
    console.log('API响应内容前500字符:', responseText.substring(0, 500));
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} - ${responseText}`);
    }
    
    const data = JSON.parse(responseText);
    console.log('解析成功，返回结果');
    return data.choices[0].message.content;
  } catch (error) {
    console.error('请求过程出错:', error);
    throw error;
  }
}
