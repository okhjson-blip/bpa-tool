import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithAuthContext(context, callback) {
  return storage.run(context, callback);
}

export function getAuthContext() {
  return storage.getStore() || null;
}
