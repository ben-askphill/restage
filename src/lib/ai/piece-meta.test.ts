import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPieceLine, pieceConstraintBlock, pieceListError } from "./piece-meta";
import { parsePiecePayloads } from "./pieces";
import {
  designBriefSchema,
  pieceReferencePayloadSchema,
  type DesignBrief,
  type RoomInventory,
} from "./schemas";
import { assembleImageInstruction } from "./prompt";

const SOFA = "beige three-seat sofa against the far wall";

function inventory(): RoomInventory {
  return {
    roomType: "living room",
    cameraAngle: "standing in the doorway",
    aspectRatio: "3:2",
    architecture: {
      walls: "white walls",
      windows: [{ location: "left wall", keep: true }],
      doors: [{ location: "entry", keep: true }],
      ceilingHeightM: 2.6,
      floorMaterial: "oak",
      builtIns: [],
    },
    fixedElements: ["radiator under the window"],
    lighting: {
      naturalSources: [
        { type: "window", wall: "left", orientation: "west" },
      ],
      existingArtificial: ["brass flush mount on the ceiling"],
      dominantDirection: "from the left window",
      mood: "daylight",
    },
    dimensions: {
      source: "estimated-from-photo",
      roomWidthM: 4,
      roomDepthM: 5,
      confidence: "medium",
      referenceUsed: "door height",
    },
    existingFurniture: [
      { item: SOFA, keep: false, note: "" },
      { item: "brass flush mount on the ceiling", keep: false, note: "" },
    ],
    constraintsFromUser: {
      style: "",
      budgetTier: "mid",
      region: "Netherlands",
      keepItems: [],
      function: "",
    },
  };
}

describe("piece add vs replace", () => {
  it("accepts an add with only a label", () => {
    assert.equal(
      pieceListError(
        [{ label: "walnut sofa", intent: "add" }],
        [],
      ),
      null,
    );
    assert.equal(
      pieceListError(
        [{ label: "walnut sofa", intent: "add" }],
        [SOFA],
      ),
      null,
    );
  });

  it("still requires an analyzed item for replace", () => {
    assert.equal(
      pieceListError([{ label: "linen chair", intent: "replace" }], [SOFA]),
      "Choose an analyzed item for every piece you replace.",
    );
    assert.equal(
      pieceListError(
        [{ label: "linen chair", intent: "replace", replaces: "missing lamp" }],
        [SOFA],
      ),
      "Choose an analyzed item for every piece you replace.",
    );
    assert.equal(
      pieceListError(
        [{ label: "linen chair", intent: "replace", replaces: SOFA }],
        [SOFA],
      ),
      null,
    );
  });

  it("does not ask an add to sit with a keep-list or analyzed item", () => {
    const line = formatPieceLine(
      { id: "piece-1", label: "wool rug", intent: "add" },
      0,
    );
    assert.match(line, /ADD/);
    assert.match(line, /wool rug/);
    assert.match(line, /new object in the room/);
    assert.doesNotMatch(line, /placed with|alongside|keep/i);
  });

  it("parses an add payload of photo, label, and intent for plan, render, and refine", () => {
    const payload = pieceReferencePayloadSchema.parse({
      id: "piece-1",
      label: "wool rug",
      intent: "add",
      image: "data:image/jpeg;base64,abc",
      alongside: "beige sofa",
    });
    assert.equal(payload.intent, "add");
    assert.equal("alongside" in payload, false);
    assert.equal(payload.replaces, undefined);

    const pieces = parsePiecePayloads([payload]);
    assert.equal(pieces.length, 1);
    assert.equal(pieces[0]?.meta.intent, "add");
    assert.equal(pieces[0]?.meta.replaces, undefined);

    const room = inventory();
    const brief: DesignBrief = designBriefSchema.parse({
      ...room,
      designStrategy: {
        focalPoint: "the sofa",
        layoutConcept: "place the uploaded rug in the seating area",
        palette: ["oak", "wool"],
        materials: ["wood", "wool"],
        reasoning: "The rug is a new piece.",
      },
      pieceReferences: [pieces[0]?.meta],
    });

    const instruction = assembleImageInstruction(brief);
    assert.match(instruction, /wool rug/);
    assert.match(instruction, /new object in the room/);
    assert.doesNotMatch(instruction, /placed with|alongside/i);
    assert.match(instruction, new RegExp(room.aspectRatio));
    assert.match(pieceConstraintBlock(brief.pieceReferences), /wool rug/);
  });
});
