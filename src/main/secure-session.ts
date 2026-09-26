import { app, net, safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PRODUCTION_APP_URL } from './constants';
import { isAllowedApiUrl } from './url-policy';
import type { DesktopSessionResponse } from '../preload/contracts';

interface StoredRefreshSession {
  refreshToken: string;
  refreshExpiresIn?: string;
}

interface RuntimeConfig {
  apiUrl: string;
}

const MAX_TOKEN_LENGTH = 64 * 1024;
let accessToken: string | null = null;
let sessionGeneration = 0;
let mutationQueue: Promise<void> = Promise.resolve();
let pendingRefresh: Promise<string> | null = null;

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
    session.token.length <= MAX_TOKEN_LENGTH &&
    typeof session.refreshToken === 'string' && session.refreshToken.trim().length > 0 &&
    session.refreshToken.length <= MAX_TOKEN_LENGTH &&
    validFutureExpiry(session.refreshExpiresIn);
}

function validFutureExpiry(value: string | undefined) {
  if (value === undefined) return true;
  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function mutateSession(operation: () => Promise<void>) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

async function readStoredSession(): Promise<StoredRefreshSession | null> {
  try {
    assertSecureStorage();
    const encrypted = await readFile(storagePath());
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as Partial<StoredRefreshSession>;
    if (typeof parsed.refreshToken !== 'string' || !parsed.refreshToken.trim() ||
      parsed.refreshToken.length > MAX_TOKEN_LENGTH) return null;
    if (!validFutureExpiry(parsed.refreshExpiresIn)) {
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

export function persistDesktopSession(session: DesktopSessionResponse) {
  const generation = ++sessionGeneration;
  pendingRefresh = null;
  return mutateSession(() => writeDesktopSession(session, generation));
}

async function writeDesktopSession(session: DesktopSessionResponse, generation: number) {
  if (!validSession(session)) throw new Error('Resposta de autenticação inválida.');
  if (generation !== sessionGeneration) throw new Error('A sessão foi alterada durante a operação.');
  assertSecureStorage();
  const stored: StoredRefreshSession = {
    refreshToken: session.refreshToken,
    ...(session.refreshExpiresIn ? { refreshExpiresIn: session.refreshExpiresIn } : {}),
  };
  const encrypted = safeStorage.encryptString(JSON.stringify(stored));
  await writeFile(storagePath(), encrypted, { mode: 0o600 });
  if (generation !== sessionGeneration) {
    await rm(storagePath(), { force: true });
    throw new Error('A sessão foi alterada durante a operação.');
  }
  accessToken = session.token;
}

export function desktopAccessToken() {
  return accessToken;
}

export async function hasDesktopRefreshToken() {
  return (await readStoredSession()) !== null;
}

export function clearDesktopSession() {
  const generation = ++sessionGeneration;
  accessToken = null;
  pendingRefresh = null;
  return mutateSession(async () => {
    if (generation !== sessionGeneration) return;
    await rm(storagePath(), { force: true });
  });
}

export function refreshDesktopSession() {
  if (pendingRefresh) return pendingRefresh;
  const operation = performDesktopRefresh();
  pendingRefresh = operation;
  void operation.finally(() => {
    if (pendingRefresh === operation) pendingRefresh = null;
  }).catch(() => undefined);
  return operation;
}

async function performDesktopRefresh() {
  const generation = sessionGeneration;
  const stored = await readStoredSession();
  if (!stored || generation !== sessionGeneration) throw new Error('Sessão desktop ausente ou expirada.');

  const runtimeResponse = await net.fetch(new URL('/api/runtime-config', PRODUCTION_APP_URL).toString(), {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (!runtimeResponse.ok) throw new Error('Não foi possível carregar a configuração da API.');
  const runtime = await runtimeResponse.json() as Partial<RuntimeConfig>;
  if (typeof runtime.apiUrl !== 'string' || !isAllowedApiUrl(runtime.apiUrl)) {
    throw new Error('A origem configurada para a API não é autorizada.');
  }

  const response = await net.fetch(new URL('/users/refresh', runtime.apiUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 401 && generation === sessionGeneration) await clearDesktopSession();
    throw new Error(`Não foi possível renovar a sessão (HTTP ${response.status}).`);
  }
  if (generation !== sessionGeneration) throw new Error('A sessão foi encerrada durante a renovação.');

  const renewed = await response.json() as DesktopSessionResponse;
  await mutateSession(() => writeDesktopSession(renewed, generation));
  return renewed.token;
}
