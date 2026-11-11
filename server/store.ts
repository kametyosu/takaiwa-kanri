import { getStore } from '@netlify/blobs';
export type Entry<T> = { data: T; etag: string };
export interface Store {
  get<T>(key: string): Promise<Entry<T> | null>;
  put(key: string, data: unknown, etag: string | null): Promise<boolean>;
  remove(key: string): Promise<void>;
}
export function blobStore(): Store {
  const store = getStore({ name: 'takaiwa-management-v1', consistency: 'strong' });
  return {
    async get<T>(key: string) {
      // SDK 11.1.9 のローカルエミュレーターは GET に ETag を付けない。
      // データを読む「前」に list の ETag を取得すれば、競合時は条件付き保存が
      // 失敗するので、新しいデータの上書きを防げる。本番は GET の ETag を使用。
      const before =
        process.env.NETLIFY_DEV === 'true'
          ? (await store.list({ prefix: key })).blobs.find((b) => b.key === key)?.etag
          : undefined;
      const v = await store.getWithMetadata(key, { type: 'json' });
      if (!v) return null;
      const etag = v.etag ?? before;
      if (!etag) {
        const e = new Error('Missing storage ETag');
        e.name = 'MissingStorageETag';
        throw e;
      }
      return { data: v.data as T, etag };
    },
    async put(key, data, etag) {
      const result = await store.setJSON(
        key,
        data,
        etag ? { onlyIfMatch: etag } : { onlyIfNew: true },
      );
      return result.modified;
    },
    async remove(key) {
      await store.delete(key);
    },
  };
}
export function memoryStore(): Store {
  const entries = new Map<string, Entry<unknown>>();
  let revision = 0;
  return {
    async get<T>(key: string) {
      const v = entries.get(key);
      return v ? (structuredClone(v) as Entry<T>) : null;
    },
    async put(key, data, etag) {
      const old = entries.get(key);
      if (old?.etag !== (etag ?? undefined)) return false;
      entries.set(key, { data: structuredClone(data), etag: String(++revision) });
      return true;
    },
    async remove(key) {
      entries.delete(key);
    },
  };
}
