import { describe, expect, it } from 'vitest';
import { isAllowedPermission, shouldUseSystemAudioLoopback } from '../src/main/security';

describe('permissões do renderer remoto', () => {
  it('limita mídia a câmera e microfone', () => {
    expect(isAllowedPermission('media', ['audio', 'video'])).toBe(true);
    expect(isAllowedPermission('media', ['unknown'])).toBe(false);
  });

  it('permite somente mídia, captura de tela e notificações', () => {
    expect(isAllowedPermission('display-capture')).toBe(true);
    expect(isAllowedPermission('notifications')).toBe(true);
    expect(isAllowedPermission('clipboard-read')).toBe(false);
    expect(isAllowedPermission('geolocation')).toBe(false);
  });

  it('habilita loopback somente quando solicitado no Windows', () => {
    expect(shouldUseSystemAudioLoopback(true, 'win32')).toBe(true);
    expect(shouldUseSystemAudioLoopback(false, 'win32')).toBe(false);
    expect(shouldUseSystemAudioLoopback(true, 'linux')).toBe(false);
    expect(shouldUseSystemAudioLoopback(true, 'darwin')).toBe(false);
  });
});
