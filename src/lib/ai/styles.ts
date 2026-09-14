import {
  blobDisplayUrl,
  deleteBlobs,
  downloadPrivateBlob,
  getJsonBlob,
  listByPrefix,
  putJsonBlob,
  styleImagePrefix,
  styleManifestPath,
  uploadStyleImage,
} from "@/lib/blob";
import { dataUrlToImageInput, type ImageInput } from "./images";
import { analyzeStyleImages, computeStyleSignature } from "./style-profile";
import type {
  StyleForClient,
  StyleManifest,
  StyleSummary,
} from "./schemas";

const STYLES_PREFIX = "styles/";

function styleIdFromManifestPath(pathname: string): string | null {
  const match = pathname.match(/^styles\/([^/]+)\/style\.json$/);
  return match ? match[1] : null;
}

export async function loadManifest(id: string): Promise<StyleManifest | null> {
  return getJsonBlob<StyleManifest>(styleManifestPath(id));
}

async function saveManifest(manifest: StyleManifest): Promise<StyleManifest> {
  const next = { ...manifest, updatedAt: new Date().toISOString() };
  await putJsonBlob(styleManifestPath(next.id), next);
  return next;
}

export async function createStyle(name: string): Promise<StyleManifest> {
  const now = new Date().toISOString();
  const manifest: StyleManifest = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled style",
    createdAt: now,
    updatedAt: now,
    images: [],
    profile: null,
    signature: null,
  };
  await putJsonBlob(styleManifestPath(manifest.id), manifest);
  return manifest;
}

export async function deleteStyle(id: string): Promise<void> {
  const imagePaths = (await listByPrefix(styleImagePrefix(id))).map(
    (blob) => blob.pathname,
  );
  await deleteBlobs([...imagePaths, styleManifestPath(id)]);
}

/**
 * Regenerate the derived text profile when the current image set no longer
 * matches the cached signature. Returns the (possibly updated) manifest.
 */
export async function regenerateIfStale(
  manifest: StyleManifest,
  send?: (status: string) => void,
): Promise<StyleManifest> {
  const signature = computeStyleSignature(
    manifest.images.map((image) => image.pathname),
  );

  if (manifest.images.length === 0) {
    if (manifest.profile === null && manifest.signature === null) {
      return manifest;
    }
    return saveManifest({ ...manifest, profile: null, signature: null });
  }

  if (signature === manifest.signature && manifest.profile) {
    return manifest;
  }

  send?.("Deriving style profile…");
  const images = await Promise.all(
    manifest.images.map(async (image) => {
      const { data, mediaType } = await downloadPrivateBlob(image.pathname);
      return { data, mediaType } satisfies ImageInput;
    }),
  );
  const profile = await analyzeStyleImages({ images });
  return saveManifest({ ...manifest, profile, signature });
}

export async function addImages(
  id: string,
  dataUrls: string[],
  send?: (status: string) => void,
): Promise<StyleManifest> {
  const manifest = await loadManifest(id);
  if (!manifest) {
    throw new Error("Style not found");
  }

  send?.(`Uploading ${dataUrls.length} image${dataUrls.length === 1 ? "" : "s"}…`);
  const addedAt = new Date().toISOString();
  const uploaded = await Promise.all(
    dataUrls.map(async (dataUrl) => {
      const input = dataUrlToImageInput(dataUrl);
      const { pathname, contentType } = await uploadStyleImage(
        id,
        input.data,
        input.mediaType,
      );
      return { pathname, contentType, addedAt };
    }),
  );

  const withImages: StyleManifest = {
    ...manifest,
    images: [...manifest.images, ...uploaded],
  };

  return regenerateIfStale(withImages, send);
}

export function toClient(manifest: StyleManifest): StyleForClient {
  return {
    ...manifest,
    images: manifest.images.map((image) => ({
      url: blobDisplayUrl(image.pathname),
      contentType: image.contentType,
      addedAt: image.addedAt,
    })),
  };
}

export function toSummary(manifest: StyleManifest): StyleSummary {
  const first = manifest.images[0];
  return {
    id: manifest.id,
    name: manifest.name,
    updatedAt: manifest.updatedAt,
    imageCount: manifest.images.length,
    thumbnailUrl: first ? blobDisplayUrl(first.pathname) : null,
    summary: manifest.profile?.summary ?? null,
  };
}

export async function listStyles(): Promise<StyleSummary[]> {
  const manifests = await listByPrefix(STYLES_PREFIX);
  const ids = manifests
    .map((blob) => styleIdFromManifestPath(blob.pathname))
    .filter((id): id is string => id !== null);

  const loaded = await Promise.all(ids.map((id) => loadManifest(id)));
  return loaded
    .filter((manifest): manifest is StyleManifest => manifest !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

/** Hydrate a saved style for the design pipeline: text profile + image inputs. */
export async function resolveStyle(id: string): Promise<{
  profile: StyleManifest["profile"];
  images: ImageInput[];
}> {
  const manifest = await loadManifest(id);
  if (!manifest) {
    throw new Error("Style not found");
  }

  const images = await Promise.all(
    manifest.images.map(async (image) => {
      const { data, mediaType } = await downloadPrivateBlob(image.pathname);
      return { data, mediaType } satisfies ImageInput;
    }),
  );

  return { profile: manifest.profile, images };
}
