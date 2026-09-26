import { app, net, safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRODUCTION_APP_URL } from './constants';
import type { DesktopSessionResponse } from '../preload/contracts';

interface StoredRefreshSession {
  refreshToken: string;
  refreshExpiresIn?: string;
}

interface RuntimeConfig {
  apiUrl: string;
}

let accessToken: string | null = null;

function storagePath() {
  return join(app.getPath('userData'), 'secure-session.bin');
}

function assertSecureStorage() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento seguro do sistema operacional não está disponível.');
  }
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('Configure um keyring seguro no Linux antes de salvar a sessão.');
  }
}

function validSession(session: DesktopSessionResponse) {
  return typeof session?.token === 'string' && session.token.trim().length > 0 &&
    typeof session.refreshToken === 'string' && session.refreshToken.trim().length > 0;
}

async function readStoredSession(): Promise<StoredRefreshSession | null> {
  try {
    assertSecureStorage();
    const encrypted = await readFile(storagePath());
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as Partial<StoredRefreshSession>;
    if (typeof parsed.refreshToken !== 'string' || !parsed.refreshToken.trim()) return null;
    if (parsed.refreshExpiresIn && Date.parse(parsed.refreshExpiresIn) <= Date.now()) {
      await clearDesktopSession();
      return null;
    }
    return {
      refreshToken: parsed.refreshToken,
      ...(typeof parsed.refreshExpiresIn === 'string' ? { refreshExpiresIn: parsed.refreshExpiresIn } : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function persistDesktopSession(session: DesktopSessionResponse) {
  if (!validSession(session)) throw new Error('Resposta de autenticação inválida.');
  assertSecureStorage();
  const stored: StoredRefreshSession = {
    refreshToken: session.refreshToken,
    ...(session.refreshExpiresIn ? { refreshExpiresIn: session.refreshExpiresIn } : {}),
  };
  const encrypted = safeStorage.encryptString(JSON.stringify(stored));
  await writeFile(storagePath(), encrypted, { mode: 0o600 });
  accessToken = session.token;
}

export function desktopAccessToken() {
  return accessToken;
}

export async function hasDesktopRefreshToken() {
  return (await readStoredSession()) !== null;
}

export async function clearDesktopSession() {
  accessToken = null;
  await rm(storagePath(), { force: true });
}

export async function refreshDesktopSession() {
  const stored = await readStoredSession();
  if (!stored) throw new Error('Sessão desktop ausente ou expirada.');

  const runtimeResponse = await net.fetch(new URL('/api/runtime-config', PRODUCTION_APP_URL).toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!runtimeResponse.ok) throw new Error('Não foi possível carregar a configuração da API.');
  const runtime = await runtimeResponse.json() as Partial<RuntimeConfig>;
  if (typeof runtime.apiUrl !== 'string') throw new Error('Configuração da API inválida.');
  const apiUrl = new URL(runtime.apiUrl);
  if (apiUrl.protocol !== 'https:') throw new Error('A API configurada não usa HTTPS.');

  const response = await net.fetch(new URL('/users/refresh', `${apiUrl.toString().replace(/\/$/, '')}/`).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
  });
  if (!response.ok) {
    if (response.status === 401) await clearDesktopSession();
    throw new Error(`Não foi possível renovar a sessão (HTTP ${response.status}).`);
  }

  const renewed = await response.json() as DesktopSessionResponse;
  await persistDesktopSession(renewed);
  return renewed.token;
}
