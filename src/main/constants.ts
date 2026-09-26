export const PRODUCTION_APP_URL = 'https://livechat.kaiangazineu.dev';
export const PRODUCTION_API_URL = 'https://livechat-api.kaiangazineu.dev';
export const APP_ORIGIN = new URL(PRODUCTION_APP_URL).origin;
export const API_ORIGIN = new URL(PRODUCTION_API_URL).origin;

export const IPC_CHANNELS = {
  sessionPersist: 'livechat:session:persist',
  sessionAccessToken: 'livechat:session:access-token',
  sessionHasRefreshToken: 'livechat:session:has-refresh-token',
  sessionRefresh: 'livechat:session:refresh',
  sessionClear: 'livechat:session:clear',
  callSetState: 'livechat:call:set-state',
  notificationShow: 'livechat:notification:show',
  navigationOpenCall: 'livechat:navigation:open-call',
  updaterReady: 'livechat:updater:ready',
  updaterInstall: 'livechat:updater:install',
} as const;
