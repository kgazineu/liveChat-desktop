export interface DesktopSessionResponse {
  token: string;
  expiresIn?: string;
  refreshToken: string;
  refreshExpiresIn?: string;
}

export interface DesktopCallState {
  active: boolean;
  title?: string;
}

export interface DesktopNotificationRequest {
  title: string;
  body: string;
  kind: 'message' | 'call';
}

export interface LiveChatDesktopBridge {
  readonly platform: NodeJS.Platform;
  readonly session: {
    persist(session: DesktopSessionResponse): Promise<void>;
    accessToken(): Promise<string | null>;
    hasRefreshToken(): Promise<boolean>;
    refresh(): Promise<string>;
    clear(): Promise<void>;
  };
  readonly call: {
    setState(state: DesktopCallState): Promise<void>;
    onOpen(listener: () => void): () => void;
  };
  readonly notifications: {
    show(notification: DesktopNotificationRequest): Promise<void>;
  };
  readonly updater: {
    onReady(listener: (version: string) => void): () => void;
    install(): Promise<void>;
  };
}
