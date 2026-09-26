import { describe, expect, it } from 'vitest';
import { isAllowedPermission } from '../src/main/security';

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
});
