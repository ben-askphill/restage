import sharp from "sharp";
import type { ImageInput } from "./images";

/**
 * Ratios Gemini 3.1 Flash Image accepts on imageConfig.aspectRatio.
 * `output2k` is the pixel frame that model returns at the 2K size this app
 * requests when IMAGE_QUALITY is high. Those pixels are the model's output,
 * not a crop or letterbox of the upload.
 *
 * https://ai.google.dev/gemini-api/docs/image-generation
 */
const SUPPORTED_RATIOS = [
  { aspectRatio: "1:1", widthOverHeight: 1 / 1, output2k: { width: 2048, height: 2048 } },
  { aspectRatio: "1:4", widthOverHeight: 1 / 4, output2k: { width: 1024, height: 4096 } },
  { aspectRatio: "1:8", widthOverHeight: 1 / 8, output2k: { width: 768, height: 6144 } },
  { aspectRatio: "2:3", widthOverHeight: 2 / 3, output2k: { width: 1696, height: 2528 } },
  { aspectRatio: "3:2", widthOverHeight: 3 / 2, output2k: { width: 2528, height: 1696 } },
  { aspectRatio: "3:4", widthOverHeight: 3 / 4, output2k: { width: 1792, height: 2400 } },
  { aspectRatio: "4:1", widthOverHeight: 4 / 1, output2k: { width: 4096, height: 1024 } },
  { aspectRatio: "4:3", widthOverHeight: 4 / 3, output2k: { width: 2400, height: 1792 } },
  { aspectRatio: "4:5", widthOverHeight: 4 / 5, output2k: { width: 1856, height: 2304 } },
  { aspectRatio: "5:4", widthOverHeight: 5 / 4, output2k: { width: 2304, height: 1856 } },
  { aspectRatio: "8:1", widthOverHeight: 8 / 1, output2k: { width: 6144, height: 768 } },
  { aspectRatio: "9:16", widthOverHeight: 9 / 16, output2k: { width: 1536, height: 2752 } },
  { aspectRatio: "16:9", widthOverHeight: 16 / 9, output2k: { width: 2752, height: 1536 } },
  { aspectRatio: "21:9", widthOverHeight: 21 / 9, output2k: { width: 3168, height: 1344 } },
] as const;

export type SupportedAspectRatio =
  (typeof SUPPORTED_RATIOS)[number]["aspectRatio"];

/** Pixel frame the image model emits at 2K for the chosen ratio. */
export type RenderFrame = {
  aspectRatio: SupportedAspectRatio;
  width: number;
  height: number;
};

/**
 * Previous fixed output. 1536×1024 was sent as Gemini aspect ratio 3:2 for
 * every photo, including portrait rooms.
 */
export const LEGACY_FIXED_FRAME = {
  width: 1536,
  height: 1024,
  aspectRatio: "3:2",
} as const;

/** EXIF orientations 5–8 rotate the stored pixels by 90°, swapping the axes. */
const ORIENTATIONS_THAT_SWAP_AXES = new Set([5, 6, 7, 8]);

export function closestSupportedAspectRatio(
  width: number,
  height: number,
): SupportedAspectRatio {
  if (
    !(width > 0) ||
    !(height > 0) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error("Room photo dimensions must be positive.");
  }

  const actual = Math.log(width / height);
  let best: (typeof SUPPORTED_RATIOS)[number] = SUPPORTED_RATIOS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of SUPPORTED_RATIOS) {
    const distance = Math.abs(actual - Math.log(candidate.widthOverHeight));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.aspectRatio;
}

function frameForRatio(aspectRatio: SupportedAspectRatio): RenderFrame {
  const match = SUPPORTED_RATIOS.find(
    (candidate) => candidate.aspectRatio === aspectRatio,
  );
  if (!match) {
    throw new Error(`Unsupported aspect ratio: ${aspectRatio}`);
  }
  return {
    aspectRatio: match.aspectRatio,
    width: match.output2k.width,
    height: match.output2k.height,
  };
}

/**
 * Display size of a photo. Honors EXIF orientation so a sideways-stored
 * phone photo is measured as the user sees it. Does not resize the bytes.
 */
export async function orientedPixelSize(
  image: ImageInput,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(Buffer.from(image.data), {
    failOn: "none",
  }).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error("Couldn't read the room photo's dimensions.");
  }
  if (
    meta.orientation &&
    ORIENTATIONS_THAT_SWAP_AXES.has(meta.orientation)
  ) {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * Output frame for a room photograph. Uses that photo's pixels — not a floor
 * plan — and snaps to the closest ratio the image model accepts.
 */
export async function resolveRenderFrame(
  image: ImageInput,
): Promise<RenderFrame> {
  const size = await orientedPixelSize(image);
  return frameForRatio(closestSupportedAspectRatio(size.width, size.height));
}

export async function aspectRatioForRoomPhoto(
  image: ImageInput,
): Promise<SupportedAspectRatio> {
  const frame = await resolveRenderFrame(image);
  return frame.aspectRatio;
}

export async function withRoomPhotoAspectRatio<
  T extends { aspectRatio: string },
>(value: T, roomImage: ImageInput): Promise<T> {
  const aspectRatio = await aspectRatioForRoomPhoto(roomImage);
  return { ...value, aspectRatio };
}
