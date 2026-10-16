import { contextBridge, ipcRenderer } from 'electron';
import type { JobState, TekkenApi } from '../shared/types';

const api: TekkenApi = {
  getCharacters: () => ipcRenderer.invoke('getCharacters'),
  getCharacter: (id) => ipcRenderer.invoke('getCharacter', id),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (patch) => ipcRenderer.invoke('saveSettings', patch),
  startUpdate: (opts) => ipcRenderer.invoke('startUpdate', opts),
  cancelUpdate: () => ipcRenderer.invoke('cancelUpdate'),
  getJob: () => ipcRenderer.invoke('getJob'),
  onJob: (cb) => {
    const h = (_e: unknown, s: JobState) => cb(s);
    ipcRenderer.on('job', h);
    return () => ipcRenderer.removeListener('job', h);
  },
  onCharacterUpdated: (cb) => {
    const h = (_e: unknown, id: string) => cb(id);
    ipcRenderer.on('character-updated', h);
    return () => ipcRenderer.removeListener('character-updated', h);
  },
  onVisionForce: (cb) => {
    const h = () => cb();
    ipcRenderer.on('vision-force', h);
    return () => ipcRenderer.removeListener('vision-force', h);
  },
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  openDataFolder: () => ipcRenderer.invoke('openDataFolder'),
  visionSources: (kinds) => ipcRenderer.invoke('visionSources', kinds),
  makePortable: () => ipcRenderer.invoke('makePortable'),
  getMeta: () => ipcRenderer.invoke('getMeta'),
  getMatchup: (id) => ipcRenderer.invoke('getMatchup', id),
  saveMatchup: (id, m) => ipcRenderer.invoke('saveMatchup', id, m),
  getUserCombos: (id) => ipcRenderer.invoke('getUserCombos', id),
  saveUserCombos: (id, list) => ipcRenderer.invoke('saveUserCombos', id, list),
  saveMeta: (patch) => ipcRenderer.invoke('saveMeta', patch),
};

contextBridge.exposeInMainWorld('tekken', api);
