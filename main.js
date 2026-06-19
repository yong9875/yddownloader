const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;

// ── Binary paths ──
// In packaged mode: bin/ is copied into resources/bin/ via electron-packager extraResource
// In dev mode: bin/ is in the project root
function getBinDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bin');
  }
  return path.join(__dirname, 'bin');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 500,
    minWidth: 500,
    minHeight: 400,
    frame: false,
    icon: path.join(__dirname, 'resources', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true
    },
    backgroundColor: '#0a0a0a',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Context menu for copy-paste inside text inputs
  mainWindow.webContents.on('context-menu', (e, params) => {
    if (params.isEditable) {
      const menu = Menu.buildFromTemplate([
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' }
      ]);
      menu.popup({ window: mainWindow });
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-state', false);
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'ydDownload',
      message: '程序已经在运行中！',
      detail: 'ydDownload 已经在后台运行。'
    });
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// ── Web Sniffer Logic ──
let snifferWin = null;
let isPrompting = false;
let snifferTimeout = null;

ipcMain.on('open-sniffer', (event, url) => {
  if (snifferWin) {
    snifferWin.close();
  }
  if (snifferTimeout) {
    clearTimeout(snifferTimeout);
  }
  
  isPrompting = false;
  
  snifferWin = new BrowserWindow({
    width: 1000,
    height: 700,
    title: '网页嗅探 (Web Sniffer) - 正在后台嗅探...',
    autoHideMenuBar: true,
    show: false, // Hidden by default for background sniffing
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required' // Allow auto-playing videos
    }
  });

  // Fallback timeout: if no stream found after 15s, show the window
  snifferTimeout = setTimeout(() => {
    if (snifferWin && !snifferWin.isDestroyed()) {
      snifferWin.show();
      snifferWin.setTitle('网页嗅探 (Web Sniffer) - 请手动点击播放视频');
      dialog.showMessageBox(snifferWin, {
        type: 'info',
        title: '后台嗅探超时',
        message: '后台自动嗅探超时。可能网站需要人机验证或无法自动播放。\n请您在浏览器中手动点击播放视频。'
      });
    }
  }, 15000);

  snifferWin.webContents.session.webRequest.onBeforeRequest({
    urls: ['*://*/*.m3u8*', '*://*/*.mp4*']
  }, async (details, callback) => {
    callback({ cancel: false }); // Always let request pass

    if (isPrompting) return;
    if (!details.url.startsWith('http')) return;
    
    // Ignore obvious small ad mp4s if possible
    if (details.url.includes('.mp4') && details.url.includes('ad')) return;

    isPrompting = true;
    if (snifferTimeout) clearTimeout(snifferTimeout);
    
    if (snifferWin && !snifferWin.isVisible()) {
      // If hidden, automatically capture and close!
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sniffer-result', details.url);
      }
      if (snifferWin && !snifferWin.isDestroyed()) {
        snifferWin.close();
      }
    } else {
      // If visible (user is manually interacting), ask them first
      setTimeout(async () => {
        if (snifferWin && !snifferWin.isDestroyed()) {
          const { response } = await dialog.showMessageBox(snifferWin, {
            type: 'question',
            buttons: ['提取并解析 (Extract)', '忽略 (Ignore)'],
            title: '发现视频流',
            message: '嗅探器拦截到了一个视频流链接！\n是否提取此链接并交由主程序处理？',
            detail: details.url.substring(0, 200) + (details.url.length > 200 ? '...' : '')
          });

          if (response === 0) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('sniffer-result', details.url);
            }
            if (snifferWin && !snifferWin.isDestroyed()) {
              snifferWin.close();
            }
          } else {
            isPrompting = false;
          }
        }
      }, 100);
    }
  });

  // Inject auto-play scripts to trigger video loads
  snifferWin.webContents.on('dom-ready', () => {
    const autoPlayScript = `
      setInterval(() => {
        const vids = document.querySelectorAll('video');
        for(let v of vids) {
          if(v.paused) v.play().catch(()=>{});
        }
        const btns = document.querySelectorAll('.play, .play-button, .play-btn, .vjs-play-control, .dplayer-play-icon');
        for(let b of btns) b.click();
      }, 1500);
    `;
    snifferWin.webContents.executeJavaScript(autoPlayScript).catch(()=>{});
  });

  // Handle closed event to clear reference
  snifferWin.on('closed', () => {
    snifferWin = null;
    if (snifferTimeout) clearTimeout(snifferTimeout);
  });

  // Handle window title change manually if needed
  snifferWin.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  snifferWin.loadURL(url);
});

// ── Lifecycle ──
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Window Controls ──
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

// ── Check dependencies (now just verifies bundled binaries exist) ──
ipcMain.handle('check-dependencies', async () => {
  const binDir = getBinDir();
  const ytdlpPath = path.join(binDir, 'yt-dlp.exe');
  const ffmpegPath = path.join(binDir, 'ffmpeg.exe');
  return {
    ytdlp: fs.existsSync(ytdlpPath),
    ffmpeg: fs.existsSync(ffmpegPath),
    binDir: binDir
  };
});

// ── Folder Selector ──
ipcMain.handle('select-download-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: app.getPath('downloads')
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Default download dir ──
ipcMain.handle('get-default-download-dir', () => {
  const defaultPath = path.join(app.getPath('downloads'), 'yddownload');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return defaultPath;
});

ipcMain.handle('path-join', (event, ...paths) => {
  return path.join(...paths);
});

// ── Helper: Generate Netscape Cookie file from Bilibili string ──
function generateBiliCookiesFile(cookieString) {
  if (!cookieString) return null;
  const filePath = path.join(app.getPath('userData'), 'bilibili_cookies.txt');
  let content = "# Netscape HTTP Cookie File\n# This file is generated automatically.\n\n";
  const pairs = cookieString.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx);
    const value = trimmed.substring(eqIdx + 1);
    content += `.bilibili.com\tTRUE\t/\tFALSE\t2147483647\t${key}\t${value}\n`;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ── Analyze video URL using yt-dlp ──
ipcMain.handle('get-video-info', async (event, { url, biliCookies, customUa, playlistEnd }) => {
  const cookiesPath = generateBiliCookiesFile(biliCookies);
  const binDir = getBinDir();
  const ytdlpPath = path.join(binDir, 'yt-dlp.exe');
  const ffmpegPath = path.join(binDir, 'ffmpeg.exe');

  // Build yt-dlp args: dump single JSON, flat playlist
  const args = [
    '--no-download',
    '--dump-single-json',
    '--flat-playlist',
    '--ignore-errors',
    '--ignore-no-formats-error',
    '--js-runtimes', 'deno',
    '--impersonate', 'chrome',
    '--no-warnings'
  ];

  if (playlistEnd) {
    args.push('--playlist-end', String(playlistEnd));
  }

  // Point yt-dlp to our bundled ffmpeg
  if (fs.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', binDir);
  }

  if (cookiesPath && fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }

  args.push(url);

  const env = { ...process.env, PYTHONUNBUFFERED: '1' };
  env.PATH = `${binDir};${env.PATH || ''}`;

  return new Promise((resolve) => {
    const child = spawn(ytdlpPath, args, { env, windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ error: stderr.trim() || `yt-dlp exited with code ${code}` });
        return;
      }
      try {
        const raw = JSON.parse(stdout);
        // Normalize yt-dlp JSON into our standard metadata shape
        const metadata = normalizeYtdlpInfo(raw);
        resolve({ success: true, metadata });
      } catch (err) {
        resolve({ error: 'Failed to parse video info: ' + err.message });
      }
    });
  });
});

// ── Normalize yt-dlp JSON output into our UI-friendly shape ──
function normalizeYtdlpInfo(raw) {
  const streams = {};

  if (raw.formats && Array.isArray(raw.formats)) {
    // Group: prefer formats that have both video+audio, then video-only
    const combined = raw.formats.filter(f =>
      f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none'
    );

    const videoOnly = raw.formats.filter(f =>
      f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none')
    );

    const audioOnly = raw.formats.filter(f =>
      f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
    );

    // Add combined formats first
    for (const f of combined) {
      const id = f.format_id;
      const height = f.height || '';
      const ext = f.ext || 'mp4';
      const size = f.filesize || f.filesize_approx || 0;
      const quality = height ? `${height}p` : (f.format_note || id);
      streams[id] = {
        id,
        height: f.height || 0,
        quality: `${quality} [${ext}] (video+audio)`,
        ext,
        size,
        formatted_size: formatBytes(size)
      };
    }

    // Add video-only (will need ffmpeg merge)
    for (const f of videoOnly) {
      const id = f.format_id;
      const height = f.height || '';
      const ext = f.ext || 'mp4';
      const size = f.filesize || f.filesize_approx || 0;
      const quality = height ? `${height}p` : (f.format_note || id);
      streams[id] = {
        id,
        height: f.height || 0,
        quality: `${quality} [${ext}] (video only, needs merge)`,
        ext,
        size,
        formatted_size: formatBytes(size)
      };
    }

    // Best audio
    if (audioOnly.length > 0) {
      const best = audioOnly[audioOnly.length - 1];
      streams[best.format_id] = {
        id: best.format_id,
        height: 0,
        quality: `Audio ${best.abr || ''}kbps [${best.ext}]`,
        ext: best.ext || 'm4a',
        size: best.filesize || best.filesize_approx || 0,
        formatted_size: formatBytes(best.filesize || best.filesize_approx || 0)
      };
    }
  }

  // Always add a "best" virtual format at the top
  streams['best'] = {
    id: 'best',
    height: 99999, // ensures it sorts at top if not matched
    quality: '🏆 Best Quality (auto)',
    ext: 'mp4',
    size: 0,
    formatted_size: ''
  };

  if (raw._type === 'playlist') {
    return {
      site: raw.extractor_key || raw.extractor || 'Unknown',
      title: raw.title || raw.fulltitle || 'Untitled Playlist',
      channel: raw.uploader || raw.channel || raw.extractor_key || 'Unknown',
      type: 'playlist',
      isPlaylist: true,
      entries: (raw.entries || []).map(entry => ({
        id: entry.id,
        title: entry.title,
        url: entry.url,
        duration: entry.duration,
        thumbnail: entry.thumbnails ? entry.thumbnails[entry.thumbnails.length - 1]?.url : '',
        channel: entry.uploader || entry.channel || raw.uploader || raw.channel || raw.extractor_key || 'Unknown'
      }))
    };
  }

  return {
    site: raw.extractor_key || raw.extractor || 'Unknown',
    title: raw.title || raw.fulltitle || 'Untitled',
    channel: raw.uploader || raw.channel || raw.extractor_key || 'Unknown',
    type: raw._type || 'video',
    isPlaylist: false,
    duration: raw.duration || 0,
    thumbnail: raw.thumbnail || '',
    streams
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

// ── Download video using yt-dlp ──
ipcMain.on('download-video', (event, options) => {
  const { id, url, format, resolutionLimit, outputDir, biliCookies, customUa } = options;
  const cookiesPath = generateBiliCookiesFile(biliCookies);
  const binDir = getBinDir();
  const ytdlpPath = path.join(binDir, 'yt-dlp.exe');
  const ffmpegPath = path.join(binDir, 'ffmpeg.exe');

  const args = ['--js-runtimes', 'deno', '--impersonate', 'chrome'];

  // Format selection
  if (format && format !== 'best') {
    // For video-only formats, also grab best audio and merge
    args.push('-f', `${format}+bestaudio/best`);
  } else {
    // If a resolution limit is set and we're automatically finding the best, apply the limit
    if (resolutionLimit && resolutionLimit !== 'best') {
      args.push('-S', `res:${resolutionLimit}`);
    }
    // We intentionally omit -f here so yt-dlp uses its robust default (bestvideo*+bestaudio/best)
  }

  // Output template
  if (outputDir) {
    args.push('-o', path.join(outputDir, '%(title)s.%(ext)s'));
  }

  // Merge to mp4
  args.push('--merge-output-format', 'mp4');

  // Point to our bundled ffmpeg
  if (fs.existsSync(ffmpegPath)) {
    args.push('--ffmpeg-location', binDir);
  }

  // Progress output in a parseable format
  args.push('--newline', '--progress');

  if (cookiesPath && fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }

  if (customUa) {
    args.push('--user-agent', customUa);
  }

  args.push(url);

  const env = { ...process.env, PYTHONUNBUFFERED: '1' };
  env.PATH = `${binDir};${env.PATH || ''}`;

  const child = spawn(ytdlpPath, args, { env, windowsHide: true });

  // yt-dlp progress parsing
  child.stdout.on('data', (data) => {
    const lines = data.toString().split(/[\r\n]+/);
    for (const line of lines) {
      // yt-dlp progress: [download]  45.2% of ~120.50MiB at 5.23MiB/s ETA 00:12
      const percentMatch = line.match(/(\d+\.?\d*)%/);
      const speedMatch = line.match(/at\s+([\d.]+\s*[KMGT]?i?B\/s)/i);
      const sizeMatch = line.match(/of\s+~?([\d.]+\s*[KMGT]?i?B)/i);
      const etaMatch = line.match(/ETA\s+(\S+)/);

      if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        event.sender.send('download-progress', {
          id,
          status: 'downloading',
          progress: percent,
          speed: speedMatch ? speedMatch[1] : 'calculating...',
          sizeTotal: sizeMatch ? sizeMatch[1] : '',
          sizeTransferred: '',
          timeRemaining: etaMatch ? etaMatch[1] : ''
        });
      }

      // Merging step
      if (line.includes('[Merger]') || line.includes('Merging')) {
        event.sender.send('download-progress', {
          id,
          status: 'merging',
          progress: 99
        });
      }
    }
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('Merging') || text.includes('merge') || text.includes('[Merger]')) {
      event.sender.send('download-progress', {
        id,
        status: 'merging',
        progress: 99
      });
    }
  });

  child.on('close', (code) => {
    if (code === 0) {
      event.sender.send('download-progress', { id, status: 'completed', progress: 100 });
    } else {
      event.sender.send('download-progress', {
        id,
        status: 'failed',
        error: `yt-dlp exited with code ${code}`
      });
    }
  });

  // Kill handler
  ipcMain.once(`kill-download-${id}`, () => {
    try {
      child.kill();
      event.sender.send('download-progress', { id, status: 'cancelled', progress: 0 });
    } catch (e) {
      console.error(e);
    }
  });
});

// ── Open folder utility ──
ipcMain.handle('open-folder', async (event, folderPath) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return true;
  }
  return false;
});

// ── Delete Task and Files ──
ipcMain.handle('confirm-delete', async (event, title, outputDir) => {
  const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['删除记录 (Remove Task)', '取消 (Cancel)'],
    defaultId: 1,
    cancelId: 1,
    title: '确认删除',
    message: `您确定要删除任务 "${title}" 吗？`,
    checkboxLabel: '同时删除本地已下载的文件 (Delete local files)',
    checkboxChecked: true
  });
  
  if (response === 1) return { action: 'cancel' };
  
  if (checkboxChecked) {
    try {
      if (fs.existsSync(outputDir)) {
        const files = fs.readdirSync(outputDir);
        const sanitizedTitle = title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
        const prefix = sanitizedTitle.substring(0, 10).trim();
        if (prefix.length > 0) {
          for (const file of files) {
            if (file.includes(prefix)) {
               try {
                 fs.unlinkSync(path.join(outputDir, file));
               } catch(e){}
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
  
  return { action: 'delete', deleteFiles: checkboxChecked };
});
