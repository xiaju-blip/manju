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
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    });
  });
  
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

const textPlatforms = {
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    inputSelector: 'div[contenteditable="true"], #chat-input div, #chat-input textarea, textarea[placeholder*="深"], textarea',
    submitSelector: 'button[data-testid="send-button"], .send-button, button[type="submit"], button[aria-label="发送"], .chat-footer button:last-child',
    outputSelector: '.ds-markdown, .markdown-section',
    waitSelector: '.result-streaming, .streaming',
    category: 'text'
  },
  qwen: {
    name: '通义千问',
    url: 'https://tongyi.aliyun.com/qianwen/',
    inputSelector: 'div[contenteditable="true"], div[data-testid="prompt-editor"], .prompt-editor textarea, textarea, .quill-editor div',
    submitSelector: 'button[data-testid="send"], button[data-testid="reply-btn"], .action-bar button:last-child, button.send, .send-button, footer button:last-child, [data-testid="send-btn"]',
    outputSelector: '.answer-content, .markdown-body, .response-content, .content-wrapper, div[data-testid="answer-content"]',
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
    inputSelector: 'div[contenteditable="true"], .editor-container textarea, textarea',
    submitSelector: 'button[data-testid="send-button"], button.send-button, .chat-input-container button:last-child',
    outputSelector: '.markdown-content, .markdown-body',
    waitSelector: '.streaming, .generating',
    category: 'text'
  }
};

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

const allPlatforms = { ...textPlatforms, ...imagePlatforms, ...videoPlatforms };

ipcMain.handle('open-platform', async (event, { platformId }) => {
  try {
    const platform = allPlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的平台' };
    }

    if (aiBrowserWindow && !aiBrowserWindow.isDestroyed()) {
      aiBrowserWindow.close();
    }

    aiBrowserWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: platform.name + ' - manju 内置浏览器',
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
        webSecurity: false,
        allowRunningInsecureContent: true
      }
    });

    aiBrowserWindow.webContents.openDevTools();
    
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

ipcMain.handle('extract-result', async (event, { platformId }) => {
  try {
    const platform = allPlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;
    
    const js = 'new Promise((resolve) => {' +
      'const selector = \'' + platform.outputSelector + '\';' +
      'const el = document.querySelector(selector);' +
      'if (!el) {' +
      '  resolve({ success: false, error: \"找不到结果元素\" });' +
      '  return;' +
      '}' +
      'resolve({ ' +
      '  success: true, ' +
      '  content: el.textContent, ' +
      '  html: el.innerHTML ' +
      '});' +
    '});';
    
    const result = await webContents.executeJavaScript(js);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auto-submit', async (event, { platformId, prompt }) => {
  try {
    console.log('auto-submit 开始:', { platformId, promptLength: prompt.length });
    const platform = allPlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      console.log('auto-submit 失败: 浏览器窗口未打开/已销毁');
      return { success: false, error: '浏览器窗口未打开，请先打开平台' };
    }
    if (!platform) {
      console.log('auto-submit 失败: 不支持的平台', platformId);
      return { success: false, error: '不支持的平台' };
    }

    const webContents = aiBrowserWindow.webContents;

    const escapedPrompt = JSON.stringify(prompt);
    
    const inputSelectorsList = platform.inputSelector.split(', ');
    const submitSelectorsList = platform.submitSelector.split(', ');
    
    const inputSelectorsStr = inputSelectorsList.map(s => `"${s.replace(/"/g, '\\"')}"`).join(', ');
    const submitSelectorsStr = submitSelectorsList.map(s => `"${s.replace(/"/g, '\\"')}"`).join(', ');
    
    const js = 
      'new Promise(async (resolve) => {' +
        'console.log("auto-submit 开始执行JavaScript");' +
        'try {' +
          'const inputSelector = "' + platform.inputSelector.replace(/"/g, '\\"') + '";' +
          'const submitSelector = "' + platform.submitSelector.replace(/"/g, '\\"') + '";' +
          'console.log("选择器:", { inputSelector, submitSelector });' +
          'await new Promise(resolve => setTimeout(resolve, 6000));' +
          'let input = null;' +
          'const inputSelectors = [' + inputSelectorsStr + '];' +
          'for (const sel of inputSelectors) {' +
            'input = document.querySelector(sel);' +
            'console.log("尝试选择器", sel, "找到:", !!input);' +
            'if (input) break;' +
          '}' +
          'if (!input) {' +
            'await new Promise(resolve => setTimeout(resolve, 4000));' +
            'for (const sel of inputSelectors) {' +
              'input = document.querySelector(sel);' +
              'console.log("重试选择器", sel, "找到:", !!input);' +
              'if (input) break;' +
            '}' +
          '}' +
          'if (!input) {' +
            'console.log("找不到输入框");' +
            'resolve({ success: false, error: "找不到输入框，请等待页面完全加载后重试" });' +
            'return;' +
          '}' +
          'const prompt = ' + escapedPrompt + ';' +
          'input.focus();' +
          'if (input.value !== undefined) {' +
            'input.value = "";' +
          '} else if (input.textContent !== undefined) {' +
            'input.textContent = "";' +
          '}' +
          'input.scrollIntoView({behavior: "smooth", block: "center"});' +
          'await new Promise(resolve => setTimeout(resolve, 1000));' +
          'console.log("开始逐字输入，长度: " + prompt.length);' +
          'if (input.isContentEditable) {' +
            'input.textContent = "";' +
            'await new Promise(resolve => setTimeout(resolve, 500));' +
            'for (let i = 0; i < prompt.length; i++) {' +
              'input.textContent += prompt[i];' +
              'input.dispatchEvent(new Event("input", { bubbles: true }));' +
              'input.dispatchEvent(new Event("change", { bubbles: true }));' +
              'await new Promise(resolve => setTimeout(resolve, 3));' +
            '}' +
          '} else if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {' +
            'input.value = "";' +
            'await new Promise(resolve => setTimeout(resolve, 500));' +
            'for (let i = 0; i < prompt.length; i++) {' +
              'input.value += prompt[i];' +
              'input.dispatchEvent(new Event("input", { bubbles: true }));' +
              'input.dispatchEvent(new Event("change", { bubbles: true }));' +
              'await new Promise(resolve => setTimeout(resolve, 3));' +
            '}' +
          '} else if (typeof input.innerHTML !== "undefined") {' +
            'input.innerHTML = prompt;' +
          '}' +
          'input.dispatchEvent(new Event("change", { bubbles: true }));' +
          'input.dispatchEvent(new Event("compositionstart", { bubbles: true }));' +
          'input.dispatchEvent(new Event("compositionend", { bubbles: true }));' +
          'input.dispatchEvent(new Event("keyup", { bubbles: true }));' +
          'input.dispatchEvent(new Event("keydown", { bubbles: true }));' +
          'input.dispatchEvent(new Event("click", { bubbles: true }));' +
          'console.log("提示词填充完成，长度: " + prompt.length);' +
          'await new Promise(resolve => setTimeout(resolve, 2000));' +
          'let button = null;' +
          'const submitSelectors = [' + submitSelectorsStr + '];' +
          'for (const sel of submitSelectors) {' +
            'button = document.querySelector(sel);' +
            'console.log("尝试按钮选择器", sel, "找到:", !!button);' +
            'if (button) break;' +
          '}' +
          'if (!button) {' +
            'await new Promise(resolve => setTimeout(resolve, 2000));' +
            'for (const sel of submitSelectors) {' +
              'button = document.querySelector(sel);' +
              'console.log("重试按钮选择器", sel, "找到:", !!button);' +
              'if (button) break;' +
            '}' +
          '}' +
          'if (!button) {' +
            'console.log("找不到提交按钮");' +
            'resolve({ success: false, error: "找不到提交按钮，请等待页面完全加载后重试" });' +
            'return;' +
          '}' +
          'console.log("点击提交按钮");' +
          'button.scrollIntoView({behavior: "smooth", block: "center"});' +
          'await new Promise(resolve => setTimeout(resolve, 500));' +
          'button.click();' +
          'setTimeout(() => button.click(), 500);' +
          'resolve({ success: true });' +
        '} catch (e) {' +
          'console.error("JavaScript执行错误:", e);' +
          'resolve({ success: false, error: e.message });' +
        '}' +
      '});';
    
    const result = await webContents.executeJavaScript(js);

    console.log('auto-submit 执行结果:', result);
    return result;
  } catch (error) {
    console.error('auto-submit 异常:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('extract-images', async (event, { platformId }) => {
  try {
    const platform = imagePlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;

    const js = 'new Promise((resolve) => {' +
      'const selector = \'' + platform.resultSelector + '\';' +
      'let images = document.querySelectorAll(selector);' +
      'if (!images || images.length === 0) {' +
        'const el = document.querySelector(selector);' +
        'if (el && el.tagName === "IMG") {' +
          'images = [el];' +
        '} else {' +
          'resolve({ success: false, error: \"找不到图片\" });' +
          'return;' +
        '}' +
      '}' +
      'const urls = Array.from(images).map(img => img.src).filter(url => url);' +
      'resolve({ success: true, imageUrls: urls });' +
    '});';

    const result = await webContents.executeJavaScript(js);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('extract-video', async (event, { platformId }) => {
  try {
    const platform = videoPlatforms[platformId];
    if (!platform || !aiBrowserWindow || aiBrowserWindow.isDestroyed()) {
      return { success: false, error: '浏览器窗口未打开' };
    }

    const webContents = aiBrowserWindow.webContents;

    const js = 'new Promise((resolve) => {' +
      'const selector = \'' + platform.resultSelector + '\';' +
      'let video = document.querySelector(selector);' +
      'if (!video) {' +
        'const container = document.querySelector(selector);' +
        'if (container) {' +
          'video = container.querySelector(\"video\");' +
        '}' +
      '}' +
      'if (!video) {' +
        'resolve({ success: false, error: \"找不到视频\" });' +
        'return;' +
      '}' +
      'resolve({ success: true, videoUrl: video.src });' +
    '});';

    const result = await webContents.executeJavaScript(js);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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
