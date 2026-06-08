const { ipcRenderer, shell } = require('electron');

// ── DOM Elements ──
// Title bar
const minBtn = document.getElementById('min-btn');
const maxBtn = document.getElementById('max-btn');
const closeBtn = document.getElementById('close-btn');
const maxIconRect = document.getElementById('max-icon-rect');
const maxIconRestore = document.getElementById('max-icon-restore');
const settingsBtn = document.getElementById('settings-btn');

// Input section
const videoUrl = document.getElementById('video-url');
const analyzeBtn = document.getElementById('analyze-btn');
const sniffBtn = document.getElementById('sniff-btn');
const urlError = document.getElementById('url-error');
const analysisLoading = document.getElementById('analysis-loading');
const analysisError = document.getElementById('analysis-error');
const analysisErrMsg = document.getElementById('analysis-err-msg');

// Results
const videoResult = document.getElementById('video-result');
const videoSite = document.getElementById('video-site');
const videoTitle = document.getElementById('video-title');
const videoStream = document.getElementById('video-stream');
const downloadBtn = document.getElementById('download-btn');

// Playlist Results
const playlistResult = document.getElementById('playlist-result');
const playlistSite = document.getElementById('playlist-site');
const playlistTitle = document.getElementById('playlist-title');
const playlistCount = document.getElementById('playlist-count');
const playlistRes = document.getElementById('playlist-res');
const downloadPlaylistBtn = document.getElementById('download-playlist-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const playlistEntries = document.getElementById('playlist-entries');

// Queue
const queueList = document.getElementById('queue-list');
const emptyQueue = document.getElementById('empty-queue');

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const pathDisplay = document.getElementById('path-display');
const changePathBtn = document.getElementById('change-path-btn');
const autoSubfolder = document.getElementById('auto-subfolder');
const defaultRes = document.getElementById('default-res');
const biliCookies = document.getElementById('bili-cookies');
const customUa = document.getElementById('custom-ua');

// ── State ──
let currentDownloadDir = '';
let analyzedMetadata = null; // Stores currently analyzed video/playlist
const downloadQueue = [];
let activeDownloadCount = 0;
const MAX_CONCURRENT_DOWNLOADS = 3;

// ── Initialization ──
ipcRenderer.invoke('get-default-download-dir').then(dir => {
  currentDownloadDir = dir;
  pathDisplay.textContent = dir;
});

// Load settings
defaultRes.value = localStorage.getItem('defaultResolution') || 'best';
biliCookies.value = localStorage.getItem('biliCookies') || '';
customUa.value = localStorage.getItem('customUa') || '';
autoSubfolder.checked = localStorage.getItem('autoSubfolder') !== 'false';

// Save settings (now triggered by Save button)
const saveSettingsBtn = document.getElementById('save-settings-btn');
saveSettingsBtn.addEventListener('click', () => {
  localStorage.setItem('defaultResolution', defaultRes.value);
  localStorage.setItem('biliCookies', biliCookies.value.trim());
  localStorage.setItem('customUa', customUa.value.trim());
  localStorage.setItem('autoSubfolder', autoSubfolder.checked);
  settingsModal.classList.add('hidden');
});

// ── Window Controls ──
minBtn.addEventListener('click', () => ipcRenderer.send('window-minimize'));
maxBtn.addEventListener('click', () => ipcRenderer.send('window-maximize'));
closeBtn.addEventListener('click', () => ipcRenderer.send('window-close'));

ipcRenderer.on('window-maximized', (event, isMaximized) => {
  if (isMaximized) {
    maxIconRect.classList.add('hidden');
    maxIconRestore.classList.remove('hidden');
  } else {
    maxIconRect.classList.remove('hidden');
    maxIconRestore.classList.add('hidden');
  }
});

// ── Settings Modal ──
settingsBtn.addEventListener('click', () => {
  defaultRes.value = localStorage.getItem('defaultResolution') || 'best';
  biliCookies.value = localStorage.getItem('biliCookies') || '';
  customUa.value = localStorage.getItem('customUa') || '';
  autoSubfolder.checked = localStorage.getItem('autoSubfolder') !== 'false';
  settingsModal.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

changePathBtn.addEventListener('click', async () => {
  const newPath = await ipcRenderer.invoke('select-directory', currentDownloadDir);
  if (newPath) {
    currentDownloadDir = newPath;
    pathDisplay.textContent = newPath;
  }
});

// ── Analysis Logic ──
videoUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    analyzeUrl();
  }
});

analyzeBtn.addEventListener('click', analyzeUrl);

sniffBtn.addEventListener('click', () => {
  const url = videoUrl.value.trim();
  if (!url || !/^https?:\/\//.test(url)) {
    urlError.classList.remove('hidden');
    return;
  }
  urlError.classList.add('hidden');
  ipcRenderer.send('open-sniffer', url);
});

ipcRenderer.on('sniffer-result', (event, url) => {
  videoUrl.value = url;
  analyzeUrl();
});

async function analyzeUrl() {
  const url = videoUrl.value.trim();
  if (!url || !/^https?:\/\//.test(url)) {
    urlError.classList.remove('hidden');
    return;
  }
  
  urlError.classList.add('hidden');
  hideAllResults();
  
  analysisLoading.classList.remove('hidden');
  videoUrl.disabled = true;
  analyzeBtn.disabled = true;

  const response = await ipcRenderer.invoke('get-video-info', {
    url,
    biliCookies: localStorage.getItem('biliCookies') || '',
    customUa: localStorage.getItem('customUa') || ''
  });

  analysisLoading.classList.add('hidden');
  videoUrl.disabled = false;
  analyzeBtn.disabled = false;

  if (response.error) {
    analysisErrMsg.textContent = response.error;
    analysisError.classList.remove('hidden');
  } else if (response.metadata) {
    analyzedMetadata = response.metadata;
    if (analyzedMetadata.isPlaylist) {
      renderPlaylistResult(analyzedMetadata);
    } else {
      renderVideoResult(analyzedMetadata);
    }
  }
}

function hideAllResults() {
  videoResult.classList.add('hidden');
  playlistResult.classList.add('hidden');
  analysisError.classList.add('hidden');
}

function renderVideoResult(meta) {
  videoSite.textContent = meta.site;
  videoTitle.textContent = meta.title;
  
  videoStream.innerHTML = '';
  Object.values(meta.streams).forEach(stream => {
    const opt = document.createElement('option');
    opt.value = stream.id;
    opt.textContent = stream.quality + (stream.formatted_size ? ` (${stream.formatted_size})` : '');
    if (stream.id === 'best') opt.selected = true;
    videoStream.appendChild(opt);
  });
  
  videoResult.classList.remove('hidden');
}

function renderPlaylistResult(meta) {
  playlistSite.textContent = meta.site;
  playlistTitle.textContent = meta.title;
  playlistCount.textContent = `(${meta.entries.length})`;
  playlistRes.value = defaultRes.value;

  playlistEntries.innerHTML = '';
  meta.entries.forEach((entry, idx) => {
    const el = document.createElement('label');
    el.className = 'playlist-entry';
    el.innerHTML = `
      <input type="checkbox" class="playlist-checkbox" value="${idx}" checked>
      <span class="playlist-entry-title" title="${entry.title}">${entry.title}</span>
    `;
    playlistEntries.appendChild(el);
  });

  updatePlaylistDownloadBtn();
  const checkboxes = document.querySelectorAll('.playlist-checkbox');
  checkboxes.forEach(cb => cb.addEventListener('change', updatePlaylistDownloadBtn));
  
  playlistResult.classList.remove('hidden');
}

selectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.playlist-checkbox').forEach(cb => cb.checked = true);
  updatePlaylistDownloadBtn();
});

deselectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.playlist-checkbox').forEach(cb => cb.checked = false);
  updatePlaylistDownloadBtn();
});

function updatePlaylistDownloadBtn() {
  const checked = document.querySelectorAll('.playlist-checkbox:checked').length;
  downloadPlaylistBtn.textContent = `Download Selected (${checked})`;
  downloadPlaylistBtn.disabled = checked === 0;
}

// ── Download Trigger ──
downloadBtn.addEventListener('click', () => {
  if (!analyzedMetadata) return;
  const streamId = videoStream.value;
  const url = videoUrl.value.trim();
  const savedRes = localStorage.getItem('defaultResolution') || 'best';
  const resLimit = streamId === 'best' ? savedRes : 'best';
  
  enqueueDownload(url, analyzedMetadata.title, analyzedMetadata.channel, streamId, resLimit, analyzedMetadata.site);
  hideAllResults();
  videoUrl.value = '';
});

downloadPlaylistBtn.addEventListener('click', () => {
  if (!analyzedMetadata || !analyzedMetadata.isPlaylist) return;
  const resLimit = playlistRes.value;
  
  document.querySelectorAll('.playlist-checkbox:checked').forEach(cb => {
    const idx = parseInt(cb.value, 10);
    const entry = analyzedMetadata.entries[idx];
    if (entry && entry.url) {
      enqueueDownload(entry.url, entry.title, entry.channel || analyzedMetadata.channel, 'best', resLimit, analyzedMetadata.site);
    }
  });
  
  hideAllResults();
  videoUrl.value = '';
});

// ── Download Queue Logic ──
function sanitizePath(str) {
  return str.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'Download';
}

function enqueueDownload(url, title, channel, format, resolutionLimit, site) {
  downloadQueue.push({ url, title, channel, format, resolutionLimit, site });
  updateQueueVisibility();
  processDownloadQueue();
}

async function processDownloadQueue() {
  if (activeDownloadCount >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) return;
  
  const { url, title, channel, format, resolutionLimit, site } = downloadQueue.shift();
  activeDownloadCount++;
  
  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  
  let outputDir = currentDownloadDir;
  const isAutoSubfolder = localStorage.getItem('autoSubfolder') !== 'false';
  if (isAutoSubfolder) {
    const siteFolder = sanitizePath(site || 'Other');
    const channelFolder = sanitizePath(channel || 'Unknown');
    outputDir = await ipcRenderer.invoke('path-join', currentDownloadDir, siteFolder, channelFolder);
  }
  
  createQueueItemUI(id, title, channel, outputDir);
  
  ipcRenderer.send('download-video', {
    id, url, format, resolutionLimit, outputDir,
    biliCookies: localStorage.getItem('biliCookies') || '',
    customUa: localStorage.getItem('customUa') || ''
  });
}

function updateQueueVisibility() {
  const hasItems = queueList.children.length > 0 || downloadQueue.length > 0;
  if (hasItems) {
    emptyQueue.classList.add('hidden');
  } else {
    emptyQueue.classList.remove('hidden');
  }
}

// ── UI Generation for Tasks ──
function getOrCreateChannelGroup(channelName) {
  const safeId = 'group-' + btoa(encodeURIComponent(channelName)).replace(/[^a-zA-Z0-9]/g, '');
  let group = document.getElementById(safeId);
  
  if (!group) {
    group = document.createElement('div');
    group.id = safeId;
    group.className = 'channel-group';
    
    const header = document.createElement('div');
    header.className = 'channel-header';
    header.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <span>${channelName}</span>
    `;
    
    const tasks = document.createElement('div');
    tasks.className = 'channel-tasks';
    
    header.addEventListener('click', () => group.classList.toggle('collapsed'));
    
    group.appendChild(header);
    group.appendChild(tasks);
    queueList.appendChild(group);
  }
  
  return group.querySelector('.channel-tasks');
}

function createQueueItemUI(id, title, channel, outputDir) {
  const tasksContainer = getOrCreateChannelGroup(channel || 'Uncategorized');
  
  const el = document.createElement('div');
  el.className = 'queue-item';
  el.id = `task-${id}`;
  el.innerHTML = `
    <div class="queue-item-header">
      <span class="queue-item-title" title="${title}">${title}</span>
      <div class="queue-item-actions">
        <span class="queue-item-status" id="status-${id}">Starting...</span>
        <button class="queue-action-btn stop-btn" id="stop-${id}" title="Stop Download">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="6" width="12" height="12"></rect>
          </svg>
        </button>
        <button class="queue-action-btn folder-btn hidden" id="folder-${id}" title="打开文件位置">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
        <button class="queue-action-btn delete-btn" id="delete-${id}" title="Delete Task">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar" id="progress-${id}" style="width: 0%"></div>
    </div>
  `;
  
  tasksContainer.appendChild(el);
  updateQueueVisibility();

  document.getElementById(`stop-${id}`).addEventListener('click', () => {
    ipcRenderer.send(`kill-download-${id}`);
  });

  document.getElementById(`folder-${id}`).addEventListener('click', () => {
    ipcRenderer.invoke('open-folder', outputDir);
  });

  document.getElementById(`delete-${id}`).addEventListener('click', async () => {
    const statusText = document.getElementById(`status-${id}`).textContent;
    // Ask main process to confirm
    const result = await ipcRenderer.invoke('confirm-delete', title, outputDir);
    if (result.action === 'cancel') return;
    
    // Stop if still running
    if (!statusText.includes('Completed') && !statusText.includes('Failed') && !statusText.includes('Cancelled')) {
      ipcRenderer.send(`kill-download-${id}`);
    }
    
    el.remove();
    // Check if channel group is empty
    if (tasksContainer.children.length === 0) {
      tasksContainer.parentElement.remove();
    }
    updateQueueVisibility();
  });
}

// ── IPC Listeners for Progress ──
ipcRenderer.on('download-progress', (event, { id, status, progress, error }) => {
  const statusEl = document.getElementById(`status-${id}`);
  const progressEl = document.getElementById(`progress-${id}`);
  if (!statusEl || !progressEl) return;

  if (status === 'downloading') {
    statusEl.textContent = `${progress}%`;
    progressEl.style.width = `${progress}%`;
  } else if (status === 'merging') {
    statusEl.textContent = 'Merging (ffmpeg)...';
    progressEl.style.width = '100%';
    progressEl.style.background = 'var(--success-color)';
  } else if (status === 'completed') {
    statusEl.textContent = 'Completed';
    progressEl.style.width = '100%';
    progressEl.style.background = 'var(--success-color)';
    document.getElementById(`stop-${id}`).style.display = 'none';
    document.getElementById(`folder-${id}`).classList.remove('hidden');
    activeDownloadCount--;
    processDownloadQueue();
  } else if (status === 'failed') {
    statusEl.textContent = 'Failed';
    statusEl.style.color = 'var(--danger-color)';
    statusEl.title = error || 'Unknown error';
    progressEl.style.background = 'var(--danger-color)';
    document.getElementById(`stop-${id}`).style.display = 'none';
    activeDownloadCount--;
    processDownloadQueue();
  } else if (status === 'cancelled') {
    statusEl.textContent = 'Cancelled';
    statusEl.style.color = 'var(--danger-color)';
    progressEl.style.background = 'var(--danger-color)';
    document.getElementById(`stop-${id}`).style.display = 'none';
    activeDownloadCount--;
    processDownloadQueue();
  }
});

// ── Tab Navigation ──
const tabDownloadBtn = document.getElementById('tab-download-btn');
const tabSubsBtn = document.getElementById('tab-subs-btn');
const downloadTabContent = document.getElementById('download-tab-content');
const subsTabContent = document.getElementById('subs-tab-content');

tabDownloadBtn.addEventListener('click', () => {
  tabDownloadBtn.classList.add('active');
  tabSubsBtn.classList.remove('active');
  downloadTabContent.classList.remove('hidden');
  subsTabContent.classList.add('hidden');
});

tabSubsBtn.addEventListener('click', () => {
  tabSubsBtn.classList.add('active');
  tabDownloadBtn.classList.remove('active');
  subsTabContent.classList.remove('hidden');
  downloadTabContent.classList.add('hidden');
  renderSubscriptionsList();
});

// ── Channel Subscriptions Logic ──
let subscriptions = JSON.parse(localStorage.getItem('yddownload_subscriptions') || '[]');
let selectedSubId = null;
let activeSubVideos = [];

const subUrlInput = document.getElementById('sub-url-input');
const subAddBtn = document.getElementById('sub-add-btn');
const subAddError = document.getElementById('sub-add-error');
const subListLoading = document.getElementById('sub-list-loading');
const subsList = document.getElementById('subs-list');

const subDetailEmpty = document.getElementById('sub-detail-empty');
const subDetailContent = document.getElementById('sub-detail-content');
const subDetailSite = document.getElementById('sub-detail-site');
const subDetailTitle = document.getElementById('sub-detail-title');
const subDetailUrl = document.getElementById('sub-detail-url');
const subLastChecked = document.getElementById('sub-last-checked');
const subFetchCount = document.getElementById('sub-fetch-count');
const subFetchBtn = document.getElementById('sub-fetch-btn');
const subDownloadRes = document.getElementById('sub-download-res');
const subDownloadBtn = document.getElementById('sub-download-btn');
const subSelectAllBtn = document.getElementById('sub-select-all-btn');
const subDeselectAllBtn = document.getElementById('sub-deselect-all-btn');
const subVideosLoading = document.getElementById('sub-videos-loading');
const subVideosError = document.getElementById('sub-videos-error');
const subVideosErrMsg = document.getElementById('sub-videos-err-msg');
const subVideosList = document.getElementById('sub-videos-list');

// Initialize sub res selection
subDownloadRes.value = localStorage.getItem('defaultResolution') || 'best';

function renderSubscriptionsList() {
  subsList.innerHTML = '';
  if (subscriptions.length === 0) {
    subsList.innerHTML = `<div class="muted-text" style="text-align: center; padding: 20px 0; font-size: 12px; width: 100%;">暂无订阅</div>`;
    return;
  }

  subscriptions.forEach(sub => {
    const el = document.createElement('div');
    el.className = `sub-list-item ${selectedSubId === sub.id ? 'active' : ''}`;
    el.innerHTML = `
      <div class="sub-info-left" title="${sub.title}">
        <span class="site-badge">${sub.site}</span>
        <span class="sub-channel-name">${sub.title}</span>
      </div>
      <button class="sub-delete-btn" title="取消订阅">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    el.querySelector('.sub-info-left').addEventListener('click', () => {
      selectSubscription(sub.id);
    });

    el.querySelector('.sub-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      unsubscribeChannel(sub.id);
    });

    subsList.appendChild(el);
  });
}

subAddBtn.addEventListener('click', addSubscription);
subUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSubscription();
});

async function addSubscription() {
  let url = subUrlInput.value.trim();
  if (!url || !/^https?:\/\//.test(url)) {
    subAddError.classList.remove('hidden');
    subAddError.textContent = '请输入有效的 http/https 链接';
    return;
  }

  // Auto-append /videos for YouTube channel URLs to avoid yt-dlp returning tabs (videos, live, shorts)
  if (url.match(/^https?:\/\/(www\.)?youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/)) {
    url = url.replace(/\/$/, '') + '/videos';
  }

  subAddError.classList.add('hidden');
  subListLoading.classList.remove('hidden');
  subUrlInput.disabled = true;
  subAddBtn.disabled = true;

  try {
    const response = await ipcRenderer.invoke('get-video-info', {
      url,
      biliCookies: localStorage.getItem('biliCookies') || '',
      customUa: localStorage.getItem('customUa') || '',
      playlistEnd: 1
    });

    if (response.error) {
      subAddError.textContent = '无法解析频道，请检查链接或 Cookie: ' + response.error.substring(0, 100);
      subAddError.classList.remove('hidden');
    } else if (response.metadata) {
      const meta = response.metadata;
      const channelTitle = meta.title || '未命名频道';
      const site = meta.site || 'Unknown';

      const exists = subscriptions.find(s => s.url === url);
      if (exists) {
        subAddError.textContent = '该频道已在订阅列表中';
        subAddError.classList.remove('hidden');
      } else {
        const newSub = {
          id: 'sub_' + Date.now(),
          url: url,
          title: channelTitle,
          site: site,
          addedAt: Date.now(),
          lastChecked: Date.now()
        };
        subscriptions.push(newSub);
        localStorage.setItem('yddownload_subscriptions', JSON.stringify(subscriptions));
        subUrlInput.value = '';
        renderSubscriptionsList();
        selectSubscription(newSub.id);
      }
    }
  } catch (err) {
    subAddError.textContent = '解析异常: ' + err.message;
    subAddError.classList.remove('hidden');
  } finally {
    subListLoading.classList.add('hidden');
    subUrlInput.disabled = false;
    subAddBtn.disabled = false;
  }
}

function unsubscribeChannel(id) {
  const sub = subscriptions.find(s => s.id === id);
  if (!sub) return;
  if (confirm(`确定要取消订阅 "${sub.title}" 吗？`)) {
    subscriptions = subscriptions.filter(s => s.id !== id);
    localStorage.setItem('yddownload_subscriptions', JSON.stringify(subscriptions));
    if (selectedSubId === id) {
      selectedSubId = null;
      subDetailContent.classList.add('hidden');
      subDetailEmpty.classList.remove('hidden');
    }
    renderSubscriptionsList();
  }
}

function selectSubscription(id) {
  selectedSubId = id;
  renderSubscriptionsList();

  const sub = subscriptions.find(s => s.id === id);
  if (!sub) return;

  subDetailEmpty.classList.add('hidden');
  subDetailContent.classList.remove('hidden');

  subDetailSite.textContent = sub.site;
  subDetailTitle.textContent = sub.title;
  subDetailUrl.textContent = sub.url;
  subDetailUrl.title = "在浏览器中打开";

  const dateStr = sub.lastChecked ? new Date(sub.lastChecked).toLocaleString() : '未更新';
  subLastChecked.textContent = `上次更新: ${dateStr}`;

  subVideosList.innerHTML = '';
  activeSubVideos = [];
  subVideosError.classList.add('hidden');
  subDownloadBtn.disabled = true;
  subDownloadBtn.textContent = '下载所选 (0)';

  fetchLatestVideos(sub);
}

subDetailUrl.addEventListener('click', () => {
  const url = subDetailUrl.textContent;
  if (url && /^https?:\/\//.test(url)) {
    shell.openExternal(url).catch(err => console.error(err));
  }
});

subFetchBtn.addEventListener('click', () => {
  const sub = subscriptions.find(s => s.id === selectedSubId);
  if (sub) {
    fetchLatestVideos(sub);
  }
});

async function fetchLatestVideos(sub) {
  subVideosLoading.classList.remove('hidden');
  subVideosError.classList.add('hidden');
  subVideosList.innerHTML = '';
  subFetchBtn.disabled = true;
  subDownloadBtn.disabled = true;
  subDownloadBtn.textContent = '下载所选 (0)';

  const limit = parseInt(subFetchCount.value, 10) || 10;
  
  // Auto-fix existing subscriptions
  if (sub.url.match(/^https?:\/\/(www\.)?youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/)) {
    sub.url = sub.url.replace(/\/$/, '') + '/videos';
    localStorage.setItem('yddownload_subscriptions', JSON.stringify(subscriptions));
  }

  try {
    const response = await ipcRenderer.invoke('get-video-info', {
      url: sub.url,
      biliCookies: localStorage.getItem('biliCookies') || '',
      customUa: localStorage.getItem('customUa') || '',
      playlistEnd: limit
    });

    if (response.error) {
      subVideosErrMsg.textContent = response.error;
      subVideosError.classList.remove('hidden');
    } else if (response.metadata && response.metadata.entries) {
      activeSubVideos = response.metadata.entries.filter(v => {
        if (v.is_live === true) return false;
        if (v.duration != null && v.duration <= 60) return false;
        return true;
      });

      renderFetchedVideos();

      sub.lastChecked = Date.now();
      localStorage.setItem('yddownload_subscriptions', JSON.stringify(subscriptions));
      subLastChecked.textContent = `上次更新: ${new Date(sub.lastChecked).toLocaleString()}`;
    } else {
      subVideosErrMsg.textContent = '未获取到视频内容';
      subVideosError.classList.remove('hidden');
    }
  } catch (err) {
    subVideosErrMsg.textContent = '请求异常: ' + err.message;
    subVideosError.classList.remove('hidden');
  } finally {
    subVideosLoading.classList.add('hidden');
    subFetchBtn.disabled = false;
  }
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function renderFetchedVideos() {
  subVideosList.innerHTML = '';
  if (activeSubVideos.length === 0) {
    subVideosList.innerHTML = `<div class="muted-text" style="text-align: center; padding: 20px 0; font-size: 12px; width: 100%;">频道暂无视频</div>`;
    return;
  }

  activeSubVideos.forEach((video, idx) => {
    const el = document.createElement('div');
    el.className = 'sub-video-item';

    const thumbUrl = video.thumbnail || '';
    const durationStr = formatDuration(video.duration);

    el.innerHTML = `
      <input type="checkbox" class="sub-video-checkbox" data-idx="${idx}" checked>
      <div class="sub-video-thumb-wrapper">
        <img src="${thumbUrl}" class="sub-video-thumb" onerror="this.style.display='none'">
        <span class="sub-video-duration">${durationStr}</span>
      </div>
      <div class="sub-video-info">
        <span class="sub-video-title" title="${video.title}">${video.title}</span>
      </div>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const cb = el.querySelector('.sub-video-checkbox');
        cb.checked = !cb.checked;
        updateSelectedCount();
      }
    });

    el.querySelector('.sub-video-checkbox').addEventListener('change', () => {
      updateSelectedCount();
    });

    subVideosList.appendChild(el);
  });

  updateSelectedCount();
}

function updateSelectedCount() {
  const checkedBoxes = document.querySelectorAll('.sub-video-checkbox:checked');
  subDownloadBtn.disabled = checkedBoxes.length === 0;
  subDownloadBtn.textContent = `下载所选 (${checkedBoxes.length})`;
}

subSelectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.sub-video-checkbox').forEach(cb => cb.checked = true);
  updateSelectedCount();
});

subDeselectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.sub-video-checkbox').forEach(cb => cb.checked = false);
  updateSelectedCount();
});

subDownloadBtn.addEventListener('click', () => {
  const checkedBoxes = document.querySelectorAll('.sub-video-checkbox:checked');
  if (checkedBoxes.length === 0) return;

  const sub = subscriptions.find(s => s.id === selectedSubId);
  if (!sub) return;

  const resLimit = subDownloadRes.value;

  checkedBoxes.forEach(cb => {
    const idx = parseInt(cb.dataset.idx, 10);
    const video = activeSubVideos[idx];
    if (video && video.url) {
      enqueueDownload(
        video.url,
        video.title,
        sub.title,
        'best',
        resLimit,
        sub.site
      );
    }
  });

  tabDownloadBtn.click();
});

// ── Refresh All Subscriptions ──
const subRefreshAllBtn = document.getElementById('sub-refresh-all-btn');

subRefreshAllBtn.addEventListener('click', async () => {
  if (subscriptions.length === 0) return;

  subRefreshAllBtn.disabled = true;
  subRefreshAllBtn.style.opacity = '0.5';

  let errors = 0;
  for (let sub of subscriptions) {
    try {
      const response = await ipcRenderer.invoke('get-video-info', {
        url: sub.url,
        biliCookies: localStorage.getItem('biliCookies') || '',
        customUa: localStorage.getItem('customUa') || '',
        playlistEnd: 1
      });
      if (response.metadata) {
        sub.title = response.metadata.title || sub.title;
        sub.lastChecked = Date.now();
      } else {
        errors++;
      }
    } catch (e) {
      console.error(e);
      errors++;
    }
  }

  localStorage.setItem('yddownload_subscriptions', JSON.stringify(subscriptions));
  renderSubscriptionsList();

  if (selectedSubId) {
    const currentSub = subscriptions.find(s => s.id === selectedSubId);
    if (currentSub) {
      selectSubscription(selectedSubId);
    }
  }

  subRefreshAllBtn.disabled = false;
  subRefreshAllBtn.style.opacity = '1';

  if (errors > 0) {
    alert(`刷新完成，但有 ${errors} 个频道刷新失败。请检查网络。`);
  }
});
