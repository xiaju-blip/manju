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
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

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
    inputSelector: 'textarea[placeholder*="深"], textarea',
    submitSelector: 'button[type="submit"], .send-button',
    outputSelector: '.ds-markdown, .markdown-section',
    waitSelector: '.result-streaming, .streaming',
    category: 'text'
  },
  qwen: {
    name: '通义千问',
    url: 'https://tongyi.aliyun.com/qianwen/',
    inputSelector: 'textarea',
    submitSelector: 'button[class*="send"], button[class*="submit"], .send-btn',
    outputSelector: '.answer-content, .markdown-body',
    waitSelector: '.generating, .loading',
    category: 'text'
  },
  doubao: {
    name: '豆包',
    url: 'https://www.doubao.com/',
    inputSelector: 'textarea',
    submitSelector: 'button.send-button, .btn-submit',
    outputSelector: '.answer-content, .markdown-content',
    waitSelector: '.loading, .generating',
    category: 'text'
  },
  zhipu: {
    name: '智谱清言',
    url: 'https://chatglm.cn/',
    inputSelector: 'textarea',
    submitSelector: 'button[aria-label="发送"], button.send-btn',
    outputSelector: '.markdown-body, .content',
    waitSelector: '.generating, .streaming',
    category: 'text'
  },
  moonshot: {
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn/',
    inputSelector: 'textarea',
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

    // 创建新窗口加载AI平台
    aiBrowserWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      title: `${platform.name} - 内置浏览器`,
      parent: mainWindow,
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    aiBrowserWindow.loadURL(platform.url);

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
    const platform = allPlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;

    // 对prompt进行转义
    const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n');
    
    const result = await webContents.executeJavaScript(`
      new Promise(async (resolve) => {
        try {
          const inputSelector = '${platform.inputSelector}';
          const submitSelector = '${platform.submitSelector}';
          
          // 等待输入框加载
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          let input = document.querySelector(inputSelector);
          if (!input) {
            // 尝试多个选择器
            const selectors = inputSelector.split(', ');
            for (const sel of selectors) {
              input = document.querySelector(sel);
              if (input) break;
            }
          }
          
          if (!input) {
            resolve({ success: false, error: '找不到输入框' });
            return;
          }
          
          // 填充提示词
          if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            input.value = \`${escapedPrompt}\`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 点击提交按钮
          let button = document.querySelector(submitSelector);
          if (!button) {
            const selectors = submitSelector.split(', ');
            for (const sel of selectors) {
              button = document.querySelector(sel);
              if (button) break;
            }
          }
          
          if (!button) {
            resolve({ success: false, error: '找不到提交按钮' });
            return;
          }
          
          button.click();
          resolve({ success: true });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    `);

    return result;
  } catch (error) {
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
