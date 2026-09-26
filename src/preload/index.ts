import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../main/constants';
import type {
  DesktopCallState,
  DesktopNotificationRequest,
  DesktopSessionResponse,
  LiveChatDesktopBridge,
} from './contracts';

function subscribe(channel: string, listener: (...args: unknown[]) => void) {
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: LiveChatDesktopBridge = Object.freeze({
  platform: process.platform,
  session: Object.freeze({
    persist: (session: DesktopSessionResponse) => ipcRenderer.invoke(IPC_CHANNELS.sessionPersist, session),
    accessToken: () => ipcRenderer.invoke(IPC_CHANNELS.sessionAccessToken),
    hasRefreshToken: () => ipcRenderer.invoke(IPC_CHANNELS.sessionHasRefreshToken),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.sessionRefresh),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.sessionClear),
  }),
  call: Object.freeze({
    setState: (state: DesktopCallState) => ipcRenderer.invoke(IPC_CHANNELS.callSetState, state),
    onOpen: (listener: () => void) => subscribe(IPC_CHANNELS.navigationOpenCall, listener),
  }),
  notifications: Object.freeze({
    show: (notification: DesktopNotificationRequest) => ipcRenderer.invoke(IPC_CHANNELS.notificationShow, notification),
  }),
  updater: Object.freeze({
    onReady: (listener: (version: string) => void) => subscribe(
      IPC_CHANNELS.updaterReady,
      listener as (...args: unknown[]) => void,
    ),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updaterInstall),
  }),
});

contextBridge.exposeInMainWorld('liveChatDesktop', bridge);
