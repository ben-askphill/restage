import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toJSONSchema } from "zod";
import {
  ceilingFixtureSourceRule,
  isCeilingLightingFixture,
  promoteCeilingFixtures,
  sameCeilingFixture,
  unkeptCeilingFixtures,
} from "./ceiling-fixtures";
import { buildAnalyzeInventoryPrompt } from "./inventory-prompt";
import { assembleImageInstruction } from "./prompt";
import { roomInventorySchema, type DesignBrief, type RoomInventory } from "./schemas";

const HALLWAY_CHANDELIER =
  "black-and-brass multi-arm chandelier with exposed globe bulbs on the ceiling";

const HALLWAY_WITHOUT_THE_WORD =
  "black and brass multi-arm light with exposed globe bulbs hanging from the ceiling";

const CONSOLE_LAMP = "brass table lamp on the console";

function inventory(overrides: Partial<RoomInventory> = {}): RoomInventory {
  return {
    roomType: "hallway",
    cameraAngle: "standing, looking down the hall",
    aspectRatio: "3:2",
    architecture: {
      walls: "white walls",
      windows: [],
      doors: [{ location: "far end of the hall", keep: true }],
      ceilingHeightM: 2.7,
      floorMaterial: "wood",
      builtIns: [],
    },
    fixedElements: ["radiator on the left wall"],
    lighting: {
      naturalSources: [],
      existingArtificial: [],
      dominantDirection: "from the far door",
      mood: "bright",
    },
    dimensions: {
      source: "estimated-from-photo",
      roomWidthM: 1.6,
      roomDepthM: 4,
      confidence: "low",
      referenceUsed: "interior door",
    },
    existingFurniture: [
      {
        item: CONSOLE_LAMP,
        keep: false,
        note: "on the console",
      },
      {
        item: "narrow console table against the wall",
        keep: false,
        note: "wood",
      },
    ],
    constraintsFromUser: {
      style: "Warm minimal",
      budgetTier: "mid",
      region: "United States",
      keepItems: [],
      function: "entry",
    },
    ...overrides,
  };
}

describe("ceiling lighting fixtures", () => {
  it("recognizes chandeliers, flush mounts, pendants, and similar ceiling lights", () => {
    assert.equal(isCeilingLightingFixture(HALLWAY_CHANDELIER), true);
    assert.equal(isCeilingLightingFixture(HALLWAY_WITHOUT_THE_WORD), true);
    assert.equal(isCeilingLightingFixture("white flush-mounted ceiling light"), true);
    assert.equal(isCeilingLightingFixture("glass pendant over the table"), true);
    assert.equal(isCeilingLightingFixture("semi-flush mount with a linen drum"), true);
    assert.equal(isCeilingLightingFixture("black track lighting on the ceiling"), true);
    assert.equal(isCeilingLightingFixture(CONSOLE_LAMP), false);
    assert.equal(isCeilingLightingFixture("arc floor lamp in the corner"), false);
    assert.equal(isCeilingLightingFixture("natural light from the ceiling"), false);
    assert.equal(isCeilingLightingFixture("radiator on the left wall"), false);
  });

  it("does not treat two different pendants as the same fixture", () => {
    assert.equal(
      sameCeilingFixture(
        "glass pendant over the dining table",
        "linen pendant in the bedroom",
      ),
      false,
    );
    assert.equal(
      sameCeilingFixture(
        "black brass chandelier",
        HALLWAY_CHANDELIER,
      ),
      true,
    );
  });

  it("promotes a ceiling fixture that was filed only as lighting or architecture", () => {
    const dropped = inventory({
      fixedElements: ["radiator on the left wall", HALLWAY_CHANDELIER],
      lighting: {
        naturalSources: [],
        existingArtificial: [HALLWAY_CHANDELIER, CONSOLE_LAMP],
        dominantDirection: "from the far door",
        mood: "bright",
      },
      architecture: {
        walls: "white walls",
        windows: [],
        doors: [{ location: "far end of the hall", keep: true }],
        ceilingHeightM: 2.7,
        floorMaterial: "wood",
        builtIns: ["window seat"],
      },
    });

    const promoted = promoteCeilingFixtures(dropped);
    const names = promoted.existingFurniture.map((piece) => piece.item);

    assert.ok(names.includes(HALLWAY_CHANDELIER));
    assert.ok(names.includes(CONSOLE_LAMP));
    assert.equal(
      names.filter((name) => name === HALLWAY_CHANDELIER).length,
      1,
    );
    assert.equal(
      promoted.existingFurniture.find((piece) => piece.item === HALLWAY_CHANDELIER)
        ?.keep,
      false,
    );
    assert.ok(!promoted.fixedElements.includes(HALLWAY_CHANDELIER));
    assert.ok(promoted.fixedElements.includes("radiator on the left wall"));
    assert.deepEqual(promoted.architecture.builtIns, ["window seat"]);
    assert.ok(
      promoted.lighting.existingArtificial.includes(HALLWAY_CHANDELIER),
    );
  });

  it("does not duplicate a ceiling fixture already on the furniture list", () => {
    const listed = inventory({
      existingFurniture: [
        {
          item: "black and brass multi-arm chandelier",
          keep: false,
          note: "centered on the ceiling",
        },
        { item: CONSOLE_LAMP, keep: false, note: "console" },
      ],
      fixedElements: [HALLWAY_CHANDELIER],
      lighting: {
        naturalSources: [],
        existingArtificial: [HALLWAY_CHANDELIER],
        dominantDirection: "overhead",
        mood: "warm",
      },
    });

    const promoted = promoteCeilingFixtures(listed);
    const chandeliers = promoted.existingFurniture.filter((piece) =>
      /chandelier/i.test(piece.item),
    );
    assert.equal(chandeliers.length, 1);
    assert.equal(chandeliers[0]?.item, "black and brass multi-arm chandelier");
    assert.ok(!promoted.fixedElements.includes(HALLWAY_CHANDELIER));
  });

  it("keeps a second, different ceiling fixture", () => {
    const promoted = promoteCeilingFixtures(
      inventory({
        lighting: {
          naturalSources: [],
          existingArtificial: [
            "glass pendant over the dining table",
            "linen pendant in the bedroom",
          ],
          dominantDirection: "overhead",
          mood: "warm",
        },
      }),
    );
    const pendants = promoted.existingFurniture.filter((piece) =>
      /pendant/i.test(piece.item),
    );
    assert.equal(pendants.length, 2);
  });
});

describe("analyze prompt and schema", () => {
  const prompt = buildAnalyzeInventoryPrompt({
    userBrief: {
      roomType: "hallway",
      style: "Warm minimal",
      budgetTier: "mid",
      region: "United States",
      keepItems: [],
      function: "entry",
    },
    hasFloorPlan: false,
  });

  it("asks for ceiling fixtures in the keep, replace, and source list", () => {
    assert.match(prompt, /chandelier/i);
    assert.match(prompt, /flush mount/i);
    assert.match(prompt, /pendant/i);
    assert.match(prompt, /existingFurniture/);
    assert.match(prompt, /keep, replace, or source/);
    assert.match(prompt, /not permanent architecture/i);
    assert.match(prompt, /table lamp/i);
    assert.doesNotMatch(
      prompt,
      /list every visible movable piece/i,
    );
  });

  it("schema describes ceiling fixtures as furniture, not fixed architecture", () => {
    const json = toJSONSchema(roomInventorySchema);
    const properties = json.properties as Record<
      string,
      { description?: string; properties?: Record<string, { description?: string }> }
    >;
    const furniture = properties.existingFurniture?.description ?? "";
    const fixed = properties.fixedElements?.description ?? "";
    const lighting = properties.lighting?.properties?.existingArtificial?.description ?? "";
    const builtIns =
      properties.architecture?.properties?.builtIns?.description ?? "";

    assert.match(furniture, /chandelier/i);
    assert.match(furniture, /flush mount/i);
    assert.match(furniture, /pendant/i);
    assert.match(furniture, /keep, replace, or source/i);
    assert.match(fixed, /do not list chandeliers/i);
    assert.match(lighting, /existingFurniture/i);
    assert.match(builtIns, /not built-ins/i);
  });
});

describe("downstream keep, replace, and source instructions", () => {
  it("tells the render to replace an unkept ceiling fixture", () => {
    const promoted = promoteCeilingFixtures(
      inventory({
        fixedElements: [HALLWAY_CHANDELIER, "radiator on the left wall"],
        lighting: {
          naturalSources: [],
          existingArtificial: [HALLWAY_CHANDELIER],
          dominantDirection: "from the far door",
          mood: "bright",
        },
      }),
    );
    const brief: DesignBrief = {
      ...promoted,
      designStrategy: {
        focalPoint: "the console",
        layoutConcept: "keep the hall clear",
        palette: ["white", "brass"],
        materials: ["wood", "metal"],
        reasoning: "A lighter fixture opens the hall.",
      },
      pieceReferences: [],
    };

    const instruction = assembleImageInstruction(brief);
    assert.match(instruction, /Ceiling light fixtures are replaceable/);
    assert.match(instruction, /ceiling lighting fixtures \(chandeliers, flush mounts, pendants/);
    assert.match(instruction, /not on the keep list/);
    assert.match(instruction, /radiator on the left wall/);
    assert.doesNotMatch(instruction, new RegExp(HALLWAY_CHANDELIER, "i"));
  });

  it("copies a kept ceiling fixture into the render keep list", () => {
    const promoted = promoteCeilingFixtures(
      inventory({
        lighting: {
          naturalSources: [],
          existingArtificial: [HALLWAY_CHANDELIER],
          dominantDirection: "overhead",
          mood: "bright",
        },
      }),
    );
    const brief: DesignBrief = {
      ...promoted,
      existingFurniture: promoted.existingFurniture.map((piece) =>
        piece.item === HALLWAY_CHANDELIER ? { ...piece, keep: true } : piece,
      ),
      constraintsFromUser: {
        ...promoted.constraintsFromUser,
        keepItems: [HALLWAY_CHANDELIER],
      },
      designStrategy: {
        focalPoint: "the console",
        layoutConcept: "keep the hall clear",
        palette: ["white", "brass"],
        materials: ["wood", "metal"],
        reasoning: "Keep the existing chandelier.",
      },
      pieceReferences: [],
    };

    const instruction = assembleImageInstruction(brief);
    assert.match(instruction, /HARD KEEP LIST/);
    assert.match(instruction, new RegExp(HALLWAY_CHANDELIER, "i"));
    assert.equal(
      ceilingFixtureSourceRule(unkeptCeilingFixtures(brief.existingFurniture)),
      "",
    );
  });

  it("sources a replacement when the ceiling fixture is not kept", () => {
    const promoted = promoteCeilingFixtures(
      inventory({
        lighting: {
          naturalSources: [],
          existingArtificial: [HALLWAY_CHANDELIER],
          dominantDirection: "overhead",
          mood: "bright",
        },
      }),
    );
    const rule = ceilingFixtureSourceRule(
      unkeptCeilingFixtures(promoted.existingFurniture),
    );
    assert.match(rule, new RegExp(HALLWAY_CHANDELIER, "i"));
    assert.match(rule, /buyable replacement/i);
    assert.doesNotMatch(rule, new RegExp(CONSOLE_LAMP, "i"));

    const kept = promoted.existingFurniture.map((piece) =>
      piece.item === HALLWAY_CHANDELIER ? { ...piece, keep: true } : piece,
    );
    assert.equal(ceilingFixtureSourceRule(unkeptCeilingFixtures(kept)), "");
  });
});
