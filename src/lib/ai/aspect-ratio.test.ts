import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  LEGACY_FIXED_FRAME,
  closestSupportedAspectRatio,
  orientedPixelSize,
  resolveRenderFrame,
  withRoomPhotoAspectRatio,
} from "./aspect-ratio";
import type { ImageInput } from "./images";

async function jpeg(
  width: number,
  height: number,
  orientation?: number,
): Promise<ImageInput> {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 170, b: 160 },
    },
  }).jpeg();
  if (orientation) {
    pipeline = pipeline.withMetadata({ orientation });
  }
  const data = new Uint8Array(await pipeline.toBuffer());
  return { data, mediaType: "image/jpeg" };
}

function frameLabel(frame: { width: number; height: number }): string {
  return `${frame.width}x${frame.height}`;
}

describe("room photo aspect ratio", () => {
  it("snaps displayed pixels to the closest supported ratio", () => {
    assert.equal(closestSupportedAspectRatio(6048, 8064), "3:4");
    assert.equal(closestSupportedAspectRatio(8064, 6048), "4:3");
    assert.equal(closestSupportedAspectRatio(1536, 1024), "3:2");
    assert.equal(closestSupportedAspectRatio(1024, 1536), "2:3");
    assert.equal(closestSupportedAspectRatio(1080, 1920), "9:16");
    assert.equal(closestSupportedAspectRatio(1000, 1000), "1:1");
  });

  it("a portrait upload does not resolve to 1536x1024", async () => {
    const portrait = await jpeg(900, 1200);
    const size = await orientedPixelSize(portrait);
    assert.deepEqual(size, { width: 900, height: 1200 });

    const frame = await resolveRenderFrame(portrait);
    assert.equal(frame.aspectRatio, "3:4");
    assert.notEqual(frameLabel(frame), frameLabel(LEGACY_FIXED_FRAME));
    assert.notEqual(frame.aspectRatio, LEGACY_FIXED_FRAME.aspectRatio);
    assert.ok(frame.height > frame.width);
  });

  it("treats an EXIF-rotated landscape file as the displayed portrait ratio", async () => {
    // iPhone hallway photos are stored 4:3 landscape with orientation 6,
    // which displays as 3:4. Measuring the stored pixels would pick 4:3.
    const storedLandscape = await jpeg(1200, 900, 6);
    const size = await orientedPixelSize(storedLandscape);
    assert.deepEqual(size, { width: 900, height: 1200 });

    const frame = await resolveRenderFrame(storedLandscape);
    assert.equal(frame.aspectRatio, "3:4");
    assert.notEqual(frameLabel(frame), "1536x1024");
  });

  it("keeps a landscape 3:2 photo on 3:2", async () => {
    const landscape = await jpeg(1500, 1000);
    const frame = await resolveRenderFrame(landscape);
    assert.equal(frame.aspectRatio, "3:2");
    assert.deepEqual(
      { width: frame.width, height: frame.height },
      { width: 2528, height: 1696 },
    );
  });

  it("replaces a stale landscape brief with the room photo ratio", async () => {
    const portrait = await jpeg(900, 1200);
    const stamped = await withRoomPhotoAspectRatio(
      { aspectRatio: "3:2", roomType: "hallway" },
      portrait,
    );
    assert.equal(stamped.aspectRatio, "3:4");
    assert.equal(stamped.roomType, "hallway");
  });
});
