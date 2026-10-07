import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  screen,
  session,
  type IpcMainInvokeEvent,
} from 'electron';
import electronUpdater from 'electron-updater';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS, PRODUCTION_APP_URL } from './constants';
import {
  clearDesktopSession,
  desktopAccessToken,
  hasDesktopRefreshToken,
  persistDesktopSession,
  refreshDesktopSession,
} from './secure-session';
import { configureSessionSecurity, secureWebContents } from './security';
import { isAllowedAppUrl } from './url-policy';
import { fitWindowState, MIN_WINDOW_SIZE, parseWindowState, type WindowState } from './window-state';
import type {
  DesktopCallState,
  DesktopNotificationRequest,
  DesktopSessionResponse,
} from '../preload/contracts';

const { autoUpdater } = electronUpdater;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(currentDirectory, '../preload/index.mjs');
const singleInstanceLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | null = null;
let callActive = false;
let updateDownloaded = false;

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => focusMainWindow());
  void app.whenReady().then(startApplication);
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
}

async function startApplication() {
  app.setAppUserModelId('dev.kaiangazineu.livechat');
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  configureSessionSecurity(session.defaultSession, () => mainWindow);
  createMainWindow();
  configureUpdater();

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
    else focusMainWindow();
  });
}

function windowStatePath() {
  return join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  let saved: unknown = null;
  try {
    saved = JSON.parse(readFileSync(windowStatePath(), 'utf8'));
  } catch {
    // Primeira execução ou arquivo corrompido: usa o tamanho padrão.
  }
  return fitWindowState(parseWindowState(saved), screen.getAllDisplays().map(display => display.workArea));
}

function saveWindowState(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  const bounds = window.getNormalBounds();
  const state: WindowState = { ...bounds, maximized: window.isMaximized() };
  try {
    writeFileSync(windowStatePath(), JSON.stringify(state));
  } catch {
    // Não salvar a posição da janela não impede o uso do aplicativo.
  }
}

function createMainWindow() {
  const windowState = loadWindowState();
  const window = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(windowState.x != null && windowState.y != null ? { x: windowState.x, y: windowState.y } : {}),
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    title: 'LiveChat',
    // Mesma cor da coluna de servidores, para que a janela não pisque em outro tom antes de carregar.
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  mainWindow = window;
  secureWebContents(window);

  window.once('ready-to-show', () => {
    if (windowState.maximized) window.maximize();
    window.show();
  });
  window.on('close', () => saveWindowState(window));
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.on('render-process-gone', () => {
    if (!window.isDestroyed()) void window.loadURL(PRODUCTION_APP_URL);
  });
  void window.loadURL(PRODUCTION_APP_URL);
}

function focusMainWindow() {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const window = mainWindow;
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!window || event.sender.id !== window.webContents.id || !isAllowedAppUrl(senderUrl)) {
    throw new Error('Origem do renderer não autorizada.');
  }
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.sessionPersist, async (event, value: DesktopSessionResponse) => {
    assertTrustedSender(event);
    await persistDesktopSession(value);
  });
  ipcMain.handle(IPC_CHANNELS.sessionAccessToken, event => {
    assertTrustedSender(event);
    return desktopAccessToken();
  });
  ipcMain.handle(IPC_CHANNELS.sessionHasRefreshToken, async event => {
    assertTrustedSender(event);
    return hasDesktopRefreshToken();
  });
  ipcMain.handle(IPC_CHANNELS.sessionRefresh, async event => {
    assertTrustedSender(event);
    return refreshDesktopSession();
  });
  ipcMain.handle(IPC_CHANNELS.sessionClear, async event => {
    assertTrustedSender(event);
    await clearDesktopSession();
  });
  ipcMain.handle(IPC_CHANNELS.callSetState, (event, value: DesktopCallState) => {
    assertTrustedSender(event);
    const active = value?.active === true;
    const title = typeof value?.title === 'string' ? value.title.trim().slice(0, 100) : '';
    callActive = active;
    mainWindow?.setTitle(active ? `LiveChat — Em chamada${title ? `: ${title}` : ''}` : 'LiveChat');
    mainWindow?.setProgressBar(active ? 2 : -1, active ? { mode: 'indeterminate' } : undefined);
  });
  ipcMain.handle(IPC_CHANNELS.notificationShow, (event, value: DesktopNotificationRequest) => {
    assertTrustedSender(event);
    showDesktopNotification(value);
  });
  ipcMain.handle(IPC_CHANNELS.updaterInstall, event => {
    assertTrustedSender(event);
    if (!updateDownloaded) throw new Error('Nenhuma atualização está pronta para instalar.');
    autoUpdater.quitAndInstall(false, true);
  });
}

function showDesktopNotification(value: DesktopNotificationRequest) {
  if (!Notification.isSupported()) return;
  if (!value || (value.kind !== 'message' && value.kind !== 'call')) return;
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 100) : '';
  const body = typeof value.body === 'string' ? value.body.trim().slice(0, 500) : '';
  if (!title || !body) return;

  const notification = new Notification({ title, body, silent: false });
  notification.on('click', () => {
    focusMainWindow();
    if (value.kind === 'call' || callActive) {
      mainWindow?.webContents.send(IPC_CHANNELS.navigationOpenCall);
    }
  });
  notification.show();
}

function configureUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-downloaded', info => {
    updateDownloaded = true;
    mainWindow?.webContents.send(IPC_CHANNELS.updaterReady, info.version);
  });
  autoUpdater.on('error', error => {
    console.error('Falha ao verificar ou baixar atualização:', error.message);
  });
  mainWindow?.webContents.once('did-finish-load', () => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  });
  const updateTimer = setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 6 * 60 * 60 * 1000);
  updateTimer.unref();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
