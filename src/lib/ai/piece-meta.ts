import { itemsMatch } from "./keep";
import type { PieceIntent, PieceReference } from "./schemas";

export const MAX_PIECE_REFERENCES = 6;

export function labelFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Piece";
}

export function pieceDisplayName(piece: PieceReference): string {
  return piece.label.trim() || "unnamed piece";
}

export function describePieceIntent(intent: PieceIntent): string {
  switch (intent) {
    case "replace":
      return "Replace";
    case "add":
      return "Add";
    default: {
      const _exhaustive: never = intent;
      throw new Error(`Unhandled piece intent: ${_exhaustive}`);
    }
  }
}

export function formatPieceLine(piece: PieceReference, index: number): string {
  const n = index + 1;
  const name = pieceDisplayName(piece);
  switch (piece.intent) {
    case "replace": {
      const target = piece.replaces?.trim();
      return target
        ? `${n}. REPLACE — photograph of "${name}" must replace "${target}". Remove "${target}" (do not keep, restyle, or leave it in place) and install this exact object in a suitable position.`
        : `${n}. REPLACE — photograph of "${name}" must replace the closest matching existing piece. Remove that current piece; do not keep both.`;
    }
    case "add":
      return `${n}. ADD — photograph of "${name}" must appear as a new object in the room. Do not use it as a swap for an existing piece; place it in addition to the rest of the redesign.`;
    default: {
      const _exhaustive: never = piece.intent;
      throw new Error(`Unhandled piece intent: ${_exhaustive}`);
    }
  }
}

export function formatPieceLines(pieces: PieceReference[]): string {
  return pieces.map((piece, index) => formatPieceLine(piece, index)).join("\n");
}

export function pieceConstraintBlock(pieces: PieceReference[]): string {
  if (pieces.length === 0) return "";

  return `USER PIECE REFERENCES — photos of specific objects to place, NOT style mood boards.
Copy each object faithfully: silhouette, materials, color, and distinctive details.
Scale them to this room. Do not invent a generic substitute.
${formatPieceLines(pieces)}`;
}

export function replacedItemNames(pieces: PieceReference[]): string[] {
  const names: string[] = [];
  for (const piece of pieces) {
    if (piece.intent !== "replace") continue;
    const target = piece.replaces?.trim();
    if (target) names.push(target);
  }
  return names;
}

export function stripReplacedKeepItems(
  keepItems: string[],
  pieces: PieceReference[],
): string[] {
  const replaced = replacedItemNames(pieces);
  if (replaced.length === 0) return keepItems;
  return keepItems.filter(
    (keep) => !replaced.some((item) => itemsMatch(keep, item)),
  );
}
