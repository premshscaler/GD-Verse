// A stable id per browser tab: survives reloads, differs between tabs (so two tabs can test a room).
const ID_KEY = 'gd.clientId';
const NAME_KEY = 'gd.name';

const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export function getClientId() {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) { id = uuid(); sessionStorage.setItem(ID_KEY, id); }
    return id;
  } catch {
    return uuid();
  }
}

export const getSavedName = () => { try { return sessionStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
export const saveName = (n) => { try { sessionStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } };
