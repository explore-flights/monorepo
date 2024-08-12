import { ConsentLevel } from '../consent.model';

const STORAGE_PREFIX = 'FLIGHTS:';
const CONSENT_LEVELS_KEY = 'CONSENT';
const STORAGE_IGNORE_KEY = '__STORAGE_IGNORE';

export enum EventSource {
  SET,
  REMOVE,
  SYNC,
}

export type BrowserStoreEvent = [EventSource.SET, string, string] | [EventSource.REMOVE, string, null] | [EventSource.SYNC, string, string | null];
export type BrowserStoreEventHandler = (e: BrowserStoreEvent) => void;
export type ConsentEvent = [boolean, Set<ConsentLevel>];
export type ConsentEventHandler = (consent: ConsentEvent) => void;

class StoreNode {
  value: string | null;
  isPersistent: boolean;
  ignoreStorageEvent: boolean;
  handlers: Array<BrowserStoreEventHandler>;

  constructor(readonly consentLevel: ConsentLevel, readonly key: string) {
    this.value = null;
    this.isPersistent = false;
    this.ignoreStorageEvent = false;
    this.handlers = [];
  }

  withIgnoreStorageEvent(action: () => void): void {
    const prev = this.ignoreStorageEvent;
    this.ignoreStorageEvent = true;
    try {
      action();
    } finally {
      this.ignoreStorageEvent = prev;
    }
  }

  push(event: BrowserStoreEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

function parseConsentLevels(raw: string | null): Iterable<ConsentLevel> {
  if (raw == null) {
    return [];
  }

  return JSON.parse(raw) as ConsentLevel[];
}

function assertKeyValid(key: string) {
  if (key === STORAGE_IGNORE_KEY || key === CONSENT_LEVELS_KEY) {
    throw new Error(`key=${key} is not allowed`);
  }
}

export class BrowserStore {
  private readonly storeNodeMap = new Map<string, StoreNode>();
  private readonly allowedConsentLevels = new Set<ConsentLevel>();
  private readonly consentEventHandlers: Array<ConsentEventHandler> = [];
  private readonly removeEventListener: () => void;
  private ignoreStorageEvent : boolean;

  constructor(private readonly storage: Storage, private readonly ignoreClose: boolean) {
    const handleStorageEvent = this.handleStorageEvent.bind(this);
    this.removeEventListener = () => window.removeEventListener('storage', handleStorageEvent);
    window.addEventListener('storage', handleStorageEvent);

    this.ignoreStorageEvent = this.storage.getItem(STORAGE_PREFIX + STORAGE_IGNORE_KEY) !== null;

    this.updateAllowedConsentLevels(parseConsentLevels(this.storage.getItem(STORAGE_PREFIX + CONSENT_LEVELS_KEY)));
  }

  private withOthersIgnoreStorageEvent(action: () => void): void {
    // add a value for the STORAGE_SYNC_KEY so that other active tabs know to ignore the following removes
    const prev = this.storage.getItem(STORAGE_PREFIX + STORAGE_IGNORE_KEY);
    this.storage.setItem(STORAGE_PREFIX + STORAGE_IGNORE_KEY, '');
    try {
      action();
    } finally {
      if (prev !== null) {
        this.storage.setItem(STORAGE_PREFIX + STORAGE_IGNORE_KEY, prev);
      } else {
        this.storage.removeItem(STORAGE_PREFIX + STORAGE_IGNORE_KEY);
      }
    }
  }

  private handleStorageEvent(event: StorageEvent): void {
    if (event.storageArea !== this.storage || event.key === null || !event.key.startsWith(STORAGE_PREFIX)) {
      return;
    }

    const key = event.key.substring(STORAGE_PREFIX.length);
    if (key === STORAGE_IGNORE_KEY) {
      this.ignoreStorageEvent = event.newValue !== null;
      return;
    }

    if (key === CONSENT_LEVELS_KEY) {
      this.updateAllowedConsentLevels(parseConsentLevels(event.newValue));
      this.flush();
      this.pushConsentUpdate(event.newValue ? this.allowedConsentLevels : null);
      return;
    }

    const node = this.storeNodeMap.get(key);

    // every internal set/remove action with the storage should do so by setting the ignoreStorageEvent to true
    // right before the call to the underlying storage, then setting it to false again so that we dont end up in
    // a self updating cycle
    if (this.ignoreStorageEvent || node === undefined || node.ignoreStorageEvent) {
      return;
    }

    const { newValue } = event;
    node.isPersistent = newValue !== null;
    node.value = newValue;
    node.push([EventSource.SYNC, node.key, newValue]);
  }

  private getOrCreateNode(consentLevel: ConsentLevel, key: string): StoreNode {
    let node = this.storeNodeMap.get(key);
    if (node === undefined) {
      node = new StoreNode(consentLevel, key);
      this.storeNodeMap.set(key, node);

      if (this.allowedConsentLevels.has(consentLevel)) {
        const value = this.storage.getItem(STORAGE_PREFIX + node.key);

        if (value !== null) {
          node.isPersistent = true;
          node.value = value;
          node.push([EventSource.SYNC, node.key, value]);
        }
      }
    }

    if (consentLevel !== node.consentLevel) {
      throw new Error(`ConsentLevels for node ${key} do not match: ${node.consentLevel} and ${consentLevel}`);
    }

    return node;
  }

  private updateAllowedConsentLevels(consentLevels: Iterable<ConsentLevel>): void {
    this.allowedConsentLevels.clear();
    this.allowedConsentLevels.add(ConsentLevel.STRICTLY_NECESSARY);

    for (const consentLevel of consentLevels) {
      this.allowedConsentLevels.add(consentLevel);
    }
  }

  private pushConsentUpdate(consentLevels: Iterable<ConsentLevel> | null): void {
    for (const handler of this.consentEventHandlers) {
      handler([consentLevels != null, new Set(consentLevels)]);
    }
  }

  private flush(): void {
    const consentRemovedNodes: Array<StoreNode> = [];

    for (const node of this.storeNodeMap.values()) {
      if (this.allowedConsentLevels.has(node.consentLevel)) {
        if (!node.isPersistent) {
          // if it's not yet persistent, retrieve current value
          // if value present, store latest value in storage
          // if value is not present, try to retrieve from storage
          const nodeValue = node.value;

          if (nodeValue !== null) {
            node.withIgnoreStorageEvent(() => this.storage.setItem(STORAGE_PREFIX + node.key, nodeValue));
            node.isPersistent = true;
          } else {
            const storageValue = this.storage.getItem(STORAGE_PREFIX + node.key);

            if (storageValue !== null) {
              node.isPersistent = true;
              node.value = storageValue;
              node.push([EventSource.SYNC, node.key, storageValue]);
            }
          }
        }
      } else {
        consentRemovedNodes.push(node);
      }
    }

    if (consentRemovedNodes.length > 0) {
      this.withOthersIgnoreStorageEvent(() => {
        for (const node of consentRemovedNodes) {
          node.withIgnoreStorageEvent(() => this.storage.removeItem(STORAGE_PREFIX + node.key));
          node.isPersistent = false;
        }
      });
    }
  }

  private unsubscribeConsent(handler: ConsentEventHandler): void {
    const index = this.consentEventHandlers.indexOf(handler);
    if (index !== -1) {
      this.consentEventHandlers.splice(index, 1);
    }
  }

  hasConsent(): boolean {
    return this.storage.getItem(STORAGE_PREFIX + CONSENT_LEVELS_KEY) !== null;
  }

  setConsentLevels(consentLevels: Iterable<ConsentLevel>): void {
    this.updateAllowedConsentLevels(consentLevels);
    this.flush();
    this.storage.setItem(STORAGE_PREFIX + CONSENT_LEVELS_KEY, JSON.stringify(Array.from(this.allowedConsentLevels)));
    this.pushConsentUpdate(this.allowedConsentLevels);
  }

  getConsentLevels(): Set<ConsentLevel> {
    return new Set(this.allowedConsentLevels);
  }

  subscribeConsent(handler: ConsentEventHandler): () => void {
    this.consentEventHandlers.push(handler);

    const unsubscribeConsent = this.unsubscribeConsent.bind(this);
    return () => unsubscribeConsent(handler);
  }

  set(consentLevel: ConsentLevel, key: string, value: string): void {
    assertKeyValid(key);
    const node = this.getOrCreateNode(consentLevel, key);

    if (this.allowedConsentLevels.has(node.consentLevel)) {
      node.withIgnoreStorageEvent(() => this.storage.setItem(STORAGE_PREFIX + node.key, value));
      node.isPersistent = true;
    }

    node.value = value;
    node.push([EventSource.SET, node.key, value]);
  }

  get(consentLevel: ConsentLevel, key: string): string | null {
    assertKeyValid(key);
    return this.getOrCreateNode(consentLevel, key).value;
  }

  remove(key: string): void {
    assertKeyValid(key);
    const node = this.storeNodeMap.get(key);

    if (node !== undefined) {
      node.withIgnoreStorageEvent(() => this.storage.removeItem(STORAGE_PREFIX + node.key));
      node.isPersistent = false;
      node.value = null;
      node.push([EventSource.REMOVE, node.key, null]);
    } else {
      this.storage.removeItem(STORAGE_PREFIX + key);
    }
  }

  subscribe(consentLevel: ConsentLevel, key: string, handler: BrowserStoreEventHandler): () => void {
    assertKeyValid(key);
    const node = this.getOrCreateNode(consentLevel, key);
    node.handlers.push(handler);

    return () => {
      const index = node.handlers.indexOf(handler);
      if (index !== -1) {
        node.handlers.splice(index, 1);
      }
    };
  }

  close(): void {
    if (this.ignoreClose) {
      return;
    }

    this.removeEventListener();
    this.storeNodeMap.clear();
    this.consentEventHandlers.splice(0, Infinity);
  }
}
