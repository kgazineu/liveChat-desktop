import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_STATE, fitWindowState, parseWindowState } from '../src/main/window-state';

const primary = { x: 0, y: 0, width: 1920, height: 1040 };

describe('estado da janela', () => {
  it('ignora arquivos inválidos e usa o tamanho padrão', () => {
    expect(parseWindowState(null)).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState('texto')).toEqual(DEFAULT_WINDOW_STATE);
    expect(parseWindowState({ width: 'grande', height: Number.NaN, maximized: 'sim' })).toEqual(DEFAULT_WINDOW_STATE);
  });

  it('restaura posição, tamanho e maximização salvos', () => {
    const state = parseWindowState({ width: 1280.4, height: 800, x: 100, y: 60, maximized: true });

    expect(fitWindowState(state, [primary])).toEqual({ width: 1280, height: 800, x: 100, y: 60, maximized: true });
  });

  it('respeita o tamanho mínimo e não ultrapassa a maior tela disponível', () => {
    expect(fitWindowState({ width: 300, height: 200, maximized: false }, [primary]))
      .toEqual({ width: 960, height: 640, maximized: false });
    expect(fitWindowState({ width: 5000, height: 3000, maximized: false }, [primary]))
      .toEqual({ width: 1920, height: 1040, maximized: false });
  });

  it('descarta a posição quando a janela ficaria fora de todos os monitores', () => {
    const offscreen = { width: 1280, height: 800, x: 2600, y: 100, maximized: false };

    expect(fitWindowState(offscreen, [primary])).toEqual({ width: 1280, height: 800, maximized: false });
    expect(fitWindowState(offscreen, [primary, { x: 1920, y: 0, width: 1920, height: 1080 }]))
      .toEqual(offscreen);
  });
});
