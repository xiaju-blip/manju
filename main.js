const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { chromium } = require('playwright');

let mainWindow;
let browserInstance = null;
let contextInstance = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
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
  runwayml: {
    name: 'Runway ML',
    url: 'https://runwayml.com/',
    loginUrl: 'https://runwayml.com/login/',
    workspaceUrl: 'https://app.runwayml.com/',
    inputSelector: 'input[type="file"], input[name="file"]',
    submitSelector: '.generate-btn, button.generate',
    resultSelector: '.video-output video',
    waitSelector: '.generating, .processing'
  },
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
  }
};

// 合并所有平台
const allPlatforms = { ...textPlatforms, ...imagePlatforms, ...videoPlatforms };

// 启动浏览器
ipcMain.handle('start-browser', async () => {
  try {
    if (!browserInstance) {
      browserInstance = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
      });
      contextInstance = await browserInstance.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
    }
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
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 生成漫剧内容
ipcMain.handle('generate-manga', async (event, { platformId, prompt, style }) => {
  try {
    const platform = aiPlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的AI平台' };
    }

    const page = await contextInstance.newPage();
    await page.goto(platform.url, { waitUntil: 'networkidle', timeout: 60000 });

    // 等待输入框加载
    await page.waitForTimeout(2000); // 额外等待页面JavaScript加载
    await page.waitForSelector(platform.inputSelector, { timeout: 30000 });
    
    // 构造完整提示词
    const fullPrompt = `请根据以下需求创作一个漫剧剧本：${prompt}。风格要求：${style}。
请按照以下格式输出：
1. 故事梗概：简要描述整个故事
2. 分镜列表：每个分镜包含序号、场景描述、对话内容、画面提示
3. 角色设定：列出主要角色的人设
要求内容生动，画面感强，适合改编成漫画。`;

    // 输入提示词
    await page.fill(platform.inputSelector, fullPrompt);
    
    // 点击提交
    await page.click(platform.submitSelector);
    
    // 等待生成完成
    await page.waitForTimeout(5000);
    
    // 等待生成结束（检测加载完成）
    try {
      await page.waitForSelector(platform.waitSelector, { 
        state: 'detached', 
        timeout: 180000 
      });
    } catch (e) {
      // 如果超时，继续尝试获取结果
    }
    
    // 获取输出内容
    await page.waitForSelector(platform.outputSelector, { timeout: 10000 });
    const content = await page.$eval(platform.outputSelector, el => el.innerHTML);
    const textContent = await page.$eval(platform.outputSelector, el => el.textContent);
    
    return { 
      success: true, 
      content: textContent,
      html: content,
      url: page.url()
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 生成图片提示词
ipcMain.handle('generate-image-prompts', async (event, { platformId, script }) => {
  try {
    const platform = textPlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的AI平台' };
    }

    const page = await contextInstance.newPage();
    await page.goto(platform.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000); // 额外等待页面JavaScript加载
    await page.waitForSelector(platform.inputSelector, { timeout: 30000 });
    
    const prompt = `根据以下漫剧剧本，为每个分镜生成AI绘图提示词，适合用Midjourney或Stable Diffusion生成漫画风格图片：${script}。
请为每个分镜输出一段详细的绘图提示词，包含风格、构图、色彩、细节描述。输出格式：分镜序号：[提示词]`;
    
    await page.fill(platform.inputSelector, prompt);
    await page.click(platform.submitSelector);
    
    await page.waitForTimeout(5000);
    
    try {
      await page.waitForSelector(platform.waitSelector, { 
        state: 'detached', 
        timeout: 180000 
      });
    } catch (e) {}
    
    await page.waitForSelector(platform.outputSelector, { timeout: 10000 });
    const textContent = await page.$eval(platform.outputSelector, el => el.textContent);
    
    return { success: true, prompts: textContent };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 文生图 - 生成图片
ipcMain.handle('generate-image', async (event, { platformId, prompt, size, style }) => {
  try {
    const platform = imagePlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的文生图平台' };
    }

    const page = await contextInstance.newPage();
    await page.goto(platform.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector(platform.inputSelector, { timeout: 30000 });
    
    // 组合完整提示词
    const fullPrompt = `${prompt}，风格：${style}，漫画风格，高质量，清晰`;
    
    await page.fill(platform.inputSelector, fullPrompt);
    await page.waitForTimeout(1000);
    await page.click(platform.submitSelector);
    
    // 等待生成
    await page.waitForTimeout(10000);
    
    try {
      await page.waitForSelector(platform.waitSelector, { 
        state: 'detached', 
        timeout: 300000 
      });
    } catch (e) {}
    
    // 等待图片结果
    await page.waitForSelector(platform.resultSelector, { timeout: 60000 });
    
    // 获取所有生成的图片URL
    const imageUrls = await page.$eval(platform.resultSelector, (el) => {
      if (el.tagName === 'IMG') {
        return [el.src];
      }
      const imgs = el.querySelectorAll('img');
      return Array.from(imgs).map(img => img.src);
    });
    
    const screenshot = await page.screenshot();
    
    return { 
      success: true, 
      imageUrls: imageUrls,
      prompt: fullPrompt,
      url: page.url()
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 图生视频
ipcMain.handle('image-to-video', async (event, { platformId, imagePath, prompt }) => {
  try {
    const platform = videoPlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的图生视频平台' };
    }

    const page = await contextInstance.newPage();
    await page.goto(platform.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // 如果需要登录，提示用户
    try {
      await page.waitForSelector(platform.inputSelector, { timeout: 15000 });
    } catch (e) {
      return { 
        success: false, 
        error: '需要先登录，请在打开的浏览器中登录账号后重新生成',
        url: page.url()
      };
    }
    
    // 上传图片（如果支持）
    if (platform.inputSelector.includes('file')) {
      await page.setInputFiles(platform.inputSelector, imagePath);
      await page.waitForTimeout(2000);
    } else if (prompt && platform.inputSelector) {
      // 文本提示
      await page.fill(platform.inputSelector, prompt);
      await page.waitForTimeout(1000);
    }
    
    // 点击生成
    await page.click(platform.submitSelector);
    
    // 等待处理
    await page.waitForTimeout(15000);
    
    try {
      await page.waitForSelector(platform.waitSelector, { 
        state: 'detached', 
        timeout: 600000 
      });
    } catch (e) {}
    
    // 获取视频结果
    await page.waitForSelector(platform.resultSelector, { timeout: 120000 });
    
    const videoUrl = await page.$eval(platform.resultSelector, el => {
      if (el.tagName === 'VIDEO') {
        return el.src;
      }
      const video = el.querySelector('video');
      return video ? video.src : null;
    });
    
    const screenshot = await page.screenshot();
    
    return { 
      success: true, 
      videoUrl: videoUrl,
      prompt: prompt,
      url: page.url()
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 生成漫剧内容
ipcMain.handle('generate-manga', async (event, { platformId, prompt, style }) => {
  try {
    const platform = textPlatforms[platformId];
    if (!platform) {
      return { success: false, error: '不支持的AI平台' };
    }

    const page = await contextInstance.newPage();
    await page.goto(platform.url, { waitUntil: 'networkidle', timeout: 60000 });

    // 等待输入框加载
    await page.waitForTimeout(2000); // 额外等待页面JavaScript加载
    await page.waitForSelector(platform.inputSelector, { timeout: 30000 });
    
    // 构造完整提示词
    const fullPrompt = `请根据以下需求创作一个漫剧剧本：${prompt}。风格要求：${style}。
请按照以下格式输出：
1. 故事梗概：简要描述整个故事
2. 分镜列表：每个分镜包含序号、场景描述、对话内容、画面提示
3. 角色设定：列出主要角色的人设
要求内容生动，画面感强，适合改编成漫画。`;

    // 输入提示词
    await page.fill(platform.inputSelector, fullPrompt);
    
    // 点击提交
    await page.click(platform.submitSelector);
    
    // 等待生成完成
    await page.waitForTimeout(5000);
    
    // 等待生成结束（检测加载完成）
    try {
      await page.waitForSelector(platform.waitSelector, { 
        state: 'detached', 
        timeout: 180000 
      });
    } catch (e) {
      // 如果超时，继续尝试获取结果
    }
    
    // 获取输出内容
    await page.waitForSelector(platform.outputSelector, { timeout: 10000 });
    const content = await page.$eval(platform.outputSelector, el => el.innerHTML);
    const textContent = await page.$eval(platform.outputSelector, el => el.textContent);
    
    return { 
      success: true, 
      content: textContent,
      html: content,
      url: page.url()
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 关闭浏览器
ipcMain.handle('stop-browser', async () => {
  try {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
      contextInstance = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
