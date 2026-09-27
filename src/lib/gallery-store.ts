const DB_NAME = "restage-gallery";
const DB_VERSION = 1;
const STORE = "generations";

export type GalleryRecord = {
  id: string;
  createdAt: number;
  roomType: string;
  styleLabel: string;
  region: string;
  mediaType: string;
  image: Blob;
};

export type NewGalleryRecord = Omit<GalleryRecord, "id" | "createdAt">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the gallery"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (handler: () => void) => {
          if (settled) return;
          settled = true;
          handler();
        };

        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => finish(() => resolve(request.result));
        request.onerror = () =>
          finish(() =>
            reject(request.error ?? new Error("Gallery request failed")),
          );
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          finish(() =>
            reject(tx.error ?? new Error("Gallery request failed")),
          );
        };
      }),
  );
}

export async function saveGeneration(
  input: NewGalleryRecord,
): Promise<GalleryRecord> {
  const record: GalleryRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.add(record));
  return record;
}

export async function listGenerations(): Promise<GalleryRecord[]> {
  const records = await withStore<GalleryRecord[]>("readonly", (store) =>
    store.getAll(),
  );
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteGeneration(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function blobFromImageUrl(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Couldn't save the image to your gallery");
  }
  return response.blob();
}
