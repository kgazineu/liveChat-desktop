export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface DisplayArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_WINDOW_SIZE = { width: 960, height: 640 } as const;
export const DEFAULT_WINDOW_STATE: WindowState = { width: 1440, height: 900, maximized: false };

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Lê o estado salvo sem confiar no arquivo: qualquer campo inválido volta ao padrão. */
export function parseWindowState(raw: unknown): WindowState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WINDOW_STATE };
  const value = raw as Record<string, unknown>;
  const state: WindowState = {
    width: finiteNumber(value.width) ? Math.round(value.width) : DEFAULT_WINDOW_STATE.width,
    height: finiteNumber(value.height) ? Math.round(value.height) : DEFAULT_WINDOW_STATE.height,
    maximized: value.maximized === true,
  };
  if (finiteNumber(value.x) && finiteNumber(value.y)) {
    state.x = Math.round(value.x);
    state.y = Math.round(value.y);
  }
  return state;
}

/**
 * Ajusta o estado às telas atuais: limita o tamanho à maior área disponível e descarta a posição
 * quando a janela ficaria fora de todos os monitores (por exemplo, depois de desconectar um monitor).
 */
export function fitWindowState(state: WindowState, displays: DisplayArea[]): WindowState {
  const largest = displays.reduce<DisplayArea | null>(
    (best, display) => (!best || display.width * display.height > best.width * best.height ? display : best),
    null,
  );
  const maxWidth = largest ? Math.max(MIN_WINDOW_SIZE.width, largest.width) : Number.POSITIVE_INFINITY;
  const maxHeight = largest ? Math.max(MIN_WINDOW_SIZE.height, largest.height) : Number.POSITIVE_INFINITY;
  const fitted: WindowState = {
    width: Math.min(Math.max(state.width, MIN_WINDOW_SIZE.width), maxWidth),
    height: Math.min(Math.max(state.height, MIN_WINDOW_SIZE.height), maxHeight),
    maximized: state.maximized,
  };
  if (state.x == null || state.y == null) return fitted;

  // A barra de título (topo da janela) precisa continuar alcançável em algum monitor.
  const titleBarVisible = displays.some(display =>
    state.x! + fitted.width - 100 >= display.x &&
    state.x! + 100 <= display.x + display.width &&
    state.y! >= display.y &&
    state.y! + 40 <= display.y + display.height);
  if (titleBarVisible) {
    fitted.x = state.x;
    fitted.y = state.y;
  }
  return fitted;
}
