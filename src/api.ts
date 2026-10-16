import type { TekkenApi } from '../shared/types';

declare global {
  interface Window {
    tekken?: TekkenApi;
  }
}

/** В Electron API приходит из preload; в обычном браузере (для разработки) — заглушка с демо-данными */
export let api: TekkenApi = window.tekken as TekkenApi;

export async function initApi() {
  if (!window.tekken) {
    const { mockApi } = await import('./mock/mockApi');
    api = mockApi;
  }
}
