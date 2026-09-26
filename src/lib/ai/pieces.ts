import {
  pieceReferencePayloadSchema,
  type PieceReference,
  type PieceReferencePayload,
} from "./schemas";
import { dataUrlToImageInput, type ImageInput } from "./images";
import { MAX_PIECE_REFERENCES } from "./piece-meta";

export type PieceWithImage = {
  meta: PieceReference;
  image: ImageInput;
};

export function parsePiecePayloads(raw: unknown): PieceWithImage[] {
  const parsed = pieceReferencePayloadSchema.array().safeParse(raw ?? []);
  if (!parsed.success) {
    throw new Error("Invalid piece references");
  }
  if (parsed.data.length > MAX_PIECE_REFERENCES) {
    throw new Error(`At most ${MAX_PIECE_REFERENCES} piece photos can be used`);
  }
  return parsed.data.map((payload) => payloadToPiece(payload));
}

function payloadToPiece(payload: PieceReferencePayload): PieceWithImage {
  const { image, ...meta } = payload;
  return { meta, image: dataUrlToImageInput(image) };
}

export function metasFromPieces(pieces: PieceWithImage[]): PieceReference[] {
  return pieces.map((piece) => piece.meta);
}

export {
  MAX_PIECE_REFERENCES,
  describePieceIntent,
  formatPieceLine,
  formatPieceLines,
  labelFromFilename,
  pieceConstraintBlock,
  pieceDisplayName,
  replacedItemNames,
  stripReplacedKeepItems,
} from "./piece-meta";
