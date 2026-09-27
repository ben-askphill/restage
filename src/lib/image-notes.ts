export type ImageNote = {
  id: string;
  /** Percent from the left edge of the rendered image. */
  x: number;
  /** Percent from the top edge of the rendered image. */
  y: number;
  text: string;
};

export function formatImageNotes(notes: ImageNote[]): string {
  const lines = notes
    .map((note, index) => {
      const text = note.text.trim();
      if (!text) return null;
      return `${index + 1}. At ${Math.round(note.x)}% from the left and ${Math.round(note.y)}% from the top: ${text}`;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) return "";
  return `Targeted comments on specific parts of the rendered image (percentages of the image, origin at the top-left):\n${lines.join("\n")}`;
}

export function composeRefineInstruction(
  instruction: string,
  notes: ImageNote[],
): string {
  const noteBlock = formatImageNotes(notes);
  const trimmed = instruction.trim();
  if (trimmed && noteBlock) return `${trimmed}\n\n${noteBlock}`;
  if (noteBlock) return noteBlock;
  return trimmed;
}
