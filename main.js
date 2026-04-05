const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { chromium } = require('playwright');

let mainWindow;
let aiBrowserWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // 打开开发者工具方便调试
  mainWindow.webContents.openDevTools();
  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
    if (aiBrowserWindow) {
      aiBrowserWindow.close();
      aiBrowserWindow = null;
    }
  });
}

app.whenReady().then(() => {
  // 允许跨域
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    });
  });
  
  // 禁用SSL证书验证，解决SSL握手错误
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('ignore-ssl-errors');
  app.commandLine.appendSwitch('allow-insecure-localhost');
  
  createWindow();
});

app.on('window-all-closed', function () {
  if (aiBrowserWindow) {
    aiBrowserWindow.close();
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// 支持的文本AI平台列表
const textPlatforms = {
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    inputSelector: 'div[contenteditable="true"], #chat-input textarea, textarea[placeholder*="深"], textarea',
    submitSelector: 'button[data-testid="send-button"], .send-button, button[type="submit"], button[aria-label="发送"], .chat-footer button:last-child',
    outputSelector: '.ds-markdown, .markdown-section',
    waitSelector: '.result-streaming, .streaming',
    category: 'text'
  },
  qwen: {
    name: '通义千问',
    url: 'https://tongyi.aliyun.com/qianwen/',
    inputSelector: 'div[contenteditable="true"], .prompt-editor textarea, textarea',
    submitSelector: 'button[data-testid="send"], button[data-testid="reply-btn"], button[class*="send"], .send-btn, .action-bar button:last-child',
    outputSelector: '.answer-content, .markdown-body, .response-content',
    waitSelector: '.generating, .loading, .streaming',
    category: 'text'
  },
  doubao: {
    name: '豆包',
    url: 'https://www.doubao.com/',
    inputSelector: 'div[contenteditable="true"], .ql-editor, textarea',
    submitSelector: 'button[data-testid="send-button"], button.send-button, .btn-submit, .bottom-action button:last-child',
    outputSelector: '.answer-content, .markdown-content, .content-block',
    waitSelector: '.loading, .generating, .streaming',
    category: 'text'
  },
  zhipu: {
    name: '智谱清言',
    url: 'https://chatglm.cn/',
    inputSelector: 'div[contenteditable="true"], .editor-inner textarea, textarea',
    submitSelector: 'button[aria-label="发送"], button.send-btn, .bottom-container button:last-child',
    outputSelector: '.markdown-body, .content',
    waitSelector: '.generating, .streaming',
    category: 'text'
  },
  moonshot: {
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn/',
    inputSelector: 'textarea, div[contenteditable="true"]',
    submitSelector: 'button[data-testid="send-button"], button.send-button',
    outputSelector: '.markdown-content, .markdown-body',
    waitSelector: '.streaming, .generating',
    category: 'text'
  }
};

// 支持的文生图平台
const imagePlatforms = {
  tudou: {
    name: '土豆AI绘图',
    url: 'https://www.tudouai.com/',
    inputSelector: 'textarea, .prompt-input',
    submitSelector: '.generate-btn, button[type="submit"]',
    resultSelector: '.image-result img, .output-images img',
    waitSelector: '.generating, .loading'
  },
  wenxin: {
    name: '文心一格',
    url: 'https://yige.baidu.com/',
    inputSelector: 'textarea[placeholder*="输入"], textarea',
    submitSelector: '.create-btn, .btn-generate',
    resultSelector: '.canvas-list img, .result-img',
    waitSelector: '.generating, .task-status'
  },
  tongyi: {
    name: '通义万相',
    url: 'https://tongyi.aliyun.com/wanxiang/',
    inputSelector: 'textarea, .input-box',
    submitSelector: '.btn-generate, button.create',
    resultSelector: '.result-list img, .generated-image',
    waitSelector: '.generating, .loading'
  },
  pixlr: {
    name: 'Pixlr AI',
    url: 'https://pixlr.com/image-generator/',
    inputSelector: 'textarea, #prompt-input',
    submitSelector: '.generate-button, button.generate',
    resultSelector: '.result-image img, .generated-img',
    waitSelector: '.loading, .generating'
  }
};

// 支持的图生视频平台
const videoPlatforms = {
  pika: {
    name: 'Pika Labs',
    url: 'https://pika.art/',
    inputSelector: 'textarea[placeholder*="prompt"], textarea',
    submitSelector: 'button.generate, .generate-button',
    resultSelector: '.video-container video, .result-video',
    waitSelector: '.generating, .loading'
  },
  kling: {
    name: '可灵AI',
    url: 'https://www.klingai.com/',
    inputSelector: 'textarea, .prompt-input',
    submitSelector: '.generate-btn, button.create',
    resultSelector: '.video-card video, .result-video',
    waitSelector: '.generating, .processing'
  },
  runwayml: {
    name: 'Runway ML',
    url: 'https://runwayml.com/',
    loginUrl: 'https://runwayml.com/login/',
    workspaceUrl: 'https://app.runwayml.com/',
    inputSelector: 'input[type="file"], input[name="file"]',
    submitSelector: '.generate-btn, button.generate',
    resultSelector: '.video-output video',
    waitSelector: '.generating, .processing'
  }
};

// 合并所有平台
const allPlatforms = { ...textPlatforms, ...imagePlatforms, ...videoPlatforms };

// 打开内置浏览器窗口加载AI平台
ipcMain.handle('open-platform', async (event, { platformId }) => {
  try {
    const platform = allPlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的平台' };
    }

    // 如果已经有窗口，关闭它
    if (aiBrowserWindow && !aiBrowserWindow.isDestroyed()) {
      aiBrowserWindow.close();
    }

    // 创建新窗口加载AI平台 - 使用独立窗口，不绑定parent，避免卡住
    aiBrowserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: `${platform.name} - manju 内置浏览器`,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        allowRunningInsecureContent: true,
        sandbox: false,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // 打开开发者工具方便调试
    aiBrowserWindow.webContents.openDevTools();
    
    // 等待页面加载完成后显示
    aiBrowserWindow.on('ready-to-show', () => {
      aiBrowserWindow.show();
    });
    
    aiBrowserWindow.loadURL(platform.url, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    aiBrowserWindow.on('closed', () => {
      aiBrowserWindow = null;
    });

    return { 
      success: true, 
      url: platform.url,
      name: platform.name
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取页面内容（文本生成结果）
ipcMain.handle('extract-result', async (event, { platformId }) => {
  try {
    const platform = allPlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;
    
    // 执行JS提取结果
    const result = await webContents.executeJavaScript(`
      new Promise((resolve) => {
        const selector = '${platform.outputSelector}';
        const el = document.querySelector(selector);
        if (!el) {
          resolve({ success: false, error: '找不到结果元素' });
          return;
        }
        resolve({ 
          success: true, 
          content: el.textContent,
          html: el.innerHTML
        });
      });
    `);

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 在AI页面自动填充提示词并提交
ipcMain.handle('auto-submit', async (event, { platformId, prompt }) => {
  try {
    console.log('auto-submit 开始:', { platformId, promptLength: prompt.length });
    const platform = allPlatforms[platformId];
    if (!aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      console.log('auto-submit 失败: 浏览器窗口未打开/已销毁');
      return { success: false, error: '浏览器窗口未打开，请先点击打开平台' };
    }
    if (!platform) {
      console.log('auto-submit 失败: 不支持的平台', platformId);
      return { success: false, error: '不支持的平台' };
    }

    const webContents = aiBrowserWindow.webContents;

    // 对prompt进行转义 - 使用更安全的方式
    const escapedPrompt = JSON.stringify(prompt);
    
    // 预先拆分选择器避免JS字符串内变量问题
    const inputSelectorsList = platform.inputSelector.split(', ');
    const submitSelectorsList = platform.submitSelector.split(', ');
    
    let jsCode = `
      new Promise(async (resolve) => {
        console.log('auto-submit 开始执行JavaScript');
        try {
          const inputSelector = '${platform.inputSelector}';
          const submitSelector = '${platform.submitSelector}';
          console.log('选择器:', { inputSelector, submitSelector });
          
          // 等待页面完全加载
          await new Promise(resolve => setTimeout(resolve, 4000));
          
          let input = null;
          // 尝试多个选择器
          const inputSelectors = [${inputSelectorsList.map(s => `'${s}'`).join(', ')}];
          for (const sel of inputSelectors) {
            input = document.querySelector(sel);
            console.log('尝试选择器', sel, '找到:', !!input);
            if (input) break;
          }
          
          // 如果还是找不到，等待更长时间再试一次
          if (!input) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            for (const sel of inputSelectors) {
              input = document.querySelector(sel);
              console.log('重试选择器', sel, '找到:', !!input);
              if (input) break;
            }
          }
          
          if (!input) {
            console.log('找不到输入框');
            resolve({ success: false, error: '找不到输入框，请等待页面完全加载后重试' });
            return;
          }
          
          // 填充提示词 - 使用JSON.parse保证正确
          const prompt = ${escapedPrompt};
          
          // 聚焦并清空输入框
          input.focus();
          if (input.value !== undefined) {
            input.value = '';
          } else if (input.textContent !== undefined) {
            input.textContent = '';
          }
          input.scrollIntoView({behavior: 'smooth', block: 'center'});
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 填充提示词
          if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            input.value = prompt;
          } else if (input.isContentEditable) {
            input.textContent = prompt;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('compositionend', { bubbles: true }));
          console.log('提示词填充完成');
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 点击提交按钮
          let button = document.querySelector(submitSelector);
          if (!button) {
            const submitSelectors = [${submitSelectorsList.map(s => `'${s}'`).join(', ')}];
            for (const sel of submitSelectors) {
              button = document.querySelector(sel);
              console.log('尝试按钮选择器', sel, '找到:', !!button);
              if (button) break;
            }
          }
          
          // 如果还是找不到，重试一次
          if (!button) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const submitSelectors = [${submitSelectorsList.map(s => `'${s}'`).join(', ')}];
            for (const sel of submitSelectors) {
              button = document.querySelector(sel);
              console.log('重试按钮选择器', sel, '找到:', !!button);
              if (button) break;
            }
          }
          
          if (!button) {
            console.log('找不到提交按钮');
            resolve({ success: false, error: '找不到提交按钮，请等待页面完全加载后重试' });
            return;
          }
          
          console.log('点击提交按钮');
          button.scrollIntoView({behavior: 'smooth', block: 'center'});
          await new Promise(resolve => setTimeout(resolve, 500));
          button.click();
          // 有时候需要点击两次
          setTimeout(() => button.click(), 500);
          resolve({ success: true });
        } catch (e) {
          console.error('JavaScript执行错误:', e);
          resolve({ success: false, error: e.message });
        }
      });
    `;
    
    const result = await webContents.executeJavaScript(jsCode);

    console.log('auto-submit 执行结果:', result);
    return result;
  } catch (error) {
    console.error('auto-submit 异常:', error);
    return { success: false, error: error.message };
  }
});

// 提取生成的图片URL
ipcMain.handle('extract-images', async (event, { platformId }) => {
  try {
    const platform = imagePlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;

    const result = await webContents.executeJavaScript(`
      new Promise((resolve) => {
        const selector = '${platform.resultSelector}';
        let images = document.querySelectorAll(selector);
        if (!images || images.length === 0) {
          const el = document.querySelector(selector);
          if (el && el.tagName === 'IMG') {
            images = [el];
          } else {
            resolve({ success: false, error: '找不到图片' });
            return;
          }
        }
        const urls = Array.from(images).map(img => img.src).filter(url => url);
        resolve({ success: true, imageUrls: urls });
      });
    `);

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 提取视频URL
ipcMain.handle('extract-video', async (event, { platformId }) => {
  try {
    const platform = videoPlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;

    const result = await webContents.executeJavaScript(`
      new Promise((resolve) => {
        const selector = '${platform.resultSelector}';
        let video = document.querySelector(selector);
        if (!video) {
          const container = document.querySelector(selector);
          if (container) {
            video = container.querySelector('video');
          }
        }
        if (!video) {
          resolve({ success: false, error: '找不到视频' });
          return;
        }
        resolve({ success: true, videoUrl: video.src });
      });
    `);

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 关闭内置浏览器
ipcMain.handle('close-browser', async () => {
  try {
    if (aiBrowserWindow && !aiBrowserWindow.isDestroyed()) {
      aiBrowserWindow.close();
      aiBrowserWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取平台列表
ipcMain.handle('get-platforms', async () => {
  return { 
    success: true, 
    textPlatforms: Object.keys(textPlatforms).map(key => ({
      id: key,
      name: textPlatforms[key].name
    })),
    imagePlatforms: Object.keys(imagePlatforms).map(key => ({
      id: key,
      name: imagePlatforms[key].name
    })),
    videoPlatforms: Object.keys(videoPlatforms).map(key => ({
      id: key,
      name: videoPlatforms[key].name
    }))
  };
});
