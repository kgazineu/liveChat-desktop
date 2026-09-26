import {
  desktopCapturer,
  dialog,
  shell,
  type BrowserWindow,
  type DisplayMediaRequestHandlerHandlerRequest,
  type Session,
  type WebContents,
} from 'electron';
import { isAllowedAppUrl, isSafeExternalUrl } from './url-policy';

const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'notifications']);

export function isAllowedPermission(permission: string, mediaTypes: readonly string[] = []) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  if (permission !== 'media') return true;
  return mediaTypes.length === 0 || mediaTypes.every(type => type === 'audio' || type === 'video');
}

function trustedContents(contents: WebContents | null, mainWindow: BrowserWindow | null, requestingUrl?: string) {
  return contents != null && mainWindow != null && contents.id === mainWindow.webContents.id &&
    isAllowedAppUrl(requestingUrl || contents.getURL());
}

export async function openExternalUrl(rawUrl: string) {
  if (!isSafeExternalUrl(rawUrl)) return;
  await shell.openExternal(rawUrl, { activate: true });
}

export function secureWebContents(window: BrowserWindow) {
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedAppUrl(targetUrl)) return;
    event.preventDefault();
    void openExternalUrl(targetUrl);
  });
  window.webContents.on('will-redirect', (event, targetUrl) => {
    if (isAllowedAppUrl(targetUrl)) return;
    event.preventDefault();
    void openExternalUrl(targetUrl);
  });
  window.webContents.setWindowOpenHandler(details => {
    void openExternalUrl(details.url);
    return { action: 'deny' };
  });
}

async function selectDesktopSource(parent: BrowserWindow) {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    fetchWindowIcons: true,
    thumbnailSize: { width: 320, height: 180 },
  });
  if (sources.length === 0) return null;

  const cancelId = sources.length;
  const selection = await dialog.showMessageBox(parent, {
    type: 'question',
    title: 'Compartilhar tela ou janela',
    message: 'Escolha o conteúdo que será compartilhado',
    detail: 'A captura pode ser interrompida a qualquer momento pelo botão “Parar compartilhamento” do LiveChat.',
    buttons: [...sources.map(source => source.name || 'Tela sem nome'), 'Cancelar'],
    cancelId,
    defaultId: 0,
    noLink: true,
  });
  return selection.response === cancelId ? null : sources[selection.response] ?? null;
}

export function configureSessionSecurity(electronSession: Session, getMainWindow: () => BrowserWindow | null) {
  electronSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    const mediaTypes = 'mediaType' in details && typeof details.mediaType === 'string'
      ? [details.mediaType]
      : [];
    return trustedContents(contents, getMainWindow(), requestingOrigin) &&
      isAllowedPermission(permission, mediaTypes);
  });

  electronSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details && Array.isArray(details.mediaTypes)
      ? details.mediaTypes
      : [];
    callback(trustedContents(contents, getMainWindow(), details.requestingUrl) &&
      isAllowedPermission(permission, mediaTypes));
  });

  electronSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || !trustedDisplayRequest(request, mainWindow)) {
      callback({});
      return;
    }

    try {
      const source = await selectDesktopSource(mainWindow);
      if (!source) callback({});
      else callback({ video: source });
    } catch {
      callback({});
    }
  }, { useSystemPicker: true });
}

function trustedDisplayRequest(request: DisplayMediaRequestHandlerHandlerRequest, mainWindow: BrowserWindow) {
  return request.frame != null && request.frame.top === request.frame &&
    request.frame.url != null && isAllowedAppUrl(request.frame.url) &&
    request.frame.processId === mainWindow.webContents.mainFrame.processId;
}
