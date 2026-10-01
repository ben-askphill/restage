"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/upload-zone";
import { StylePicker } from "@/components/style-picker";
import { BriefForm } from "@/components/brief-form";
import { KeepPicker } from "@/components/keep-picker";
import { PiecePicker, type PieceDraft } from "@/components/piece-picker";
import {
  FLOW_STAGES,
  ProgressStages,
  type FlowStageId,
} from "@/components/progress-stages";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { ShoppingListView } from "@/components/shopping-list";
import { RefineBar } from "@/components/refine-bar";
import { RenderNotes } from "@/components/render-notes";
import { GalleryLibrary } from "@/components/gallery-library";
import { Button } from "@/components/ui/button";
import { callApi, fileToPreparedDataUrl } from "@/lib/client-api";
import { downloadFilename, downloadUrl } from "@/lib/download-image";
import { blobFromImageUrl, listGenerations, saveGeneration } from "@/lib/gallery-store";
import { composeRefineInstruction, type ImageNote } from "@/lib/image-notes";
import { itemsMatch } from "@/lib/ai/keep";
import {
  describePieceIntent,
  labelFromFilename,
  pieceListError,
} from "@/lib/ai/piece-meta";
import { cn } from "@/lib/utils";
import type {
  DesignBrief,
  PieceReference,
  PieceReferencePayload,
  RoomInventory,
  ShoppingList,
  UserBriefInput,
} from "@/lib/ai/schemas";
import {
  Check,
  ChevronDown,
  Download,
  Images,
  Loader2,
  ScanSearch,
  Sofa,
  Sparkles,
} from "lucide-react";

type RenderResult = { imageUrl: string; mediaType: string };

const defaultBrief: UserBriefInput = {
  roomType: "living room",
  style: "",
  budgetTier: "mid",
  region: "Netherlands",
  keepItems: [],
  function: "",
};

function withRegion(brief: UserBriefInput): UserBriefInput {
  const region = brief.region.trim();
  if (region.length > 0) return brief;
  return { ...brief, region: "Netherlands" };
}

function draftsToMetas(pieces: PieceDraft[]): PieceReference[] {
  return pieces.map((piece) => {
    const label = piece.label.trim() || labelFromFilename(piece.file.name);
    switch (piece.intent) {
      case "replace":
        return {
          id: piece.id,
          label,
          intent: piece.intent,
          replaces: piece.replaces.trim(),
        };
      case "add":
        return {
          id: piece.id,
          label,
          intent: piece.intent,
        };
      default: {
        const _exhaustive: never = piece.intent;
        throw new Error(`Unhandled piece intent: ${_exhaustive}`);
      }
    }
  });
}

async function draftsToPayloads(
  pieces: PieceDraft[],
): Promise<PieceReferencePayload[]> {
  const metas = draftsToMetas(pieces);
  return Promise.all(
    pieces.map(async (piece, index) => ({
      ...metas[index],
      image: await fileToPreparedDataUrl(piece.file),
    })),
  );
}

function pieceChipLabel(piece: PieceReference): string {
  switch (piece.intent) {
    case "replace":
      return piece.replaces
        ? `Replaces ${piece.replaces}: ${piece.label}`
        : `Replace with ${piece.label}`;
    case "add":
      return `Add: ${piece.label}`;
    default: {
      const _exhaustive: never = piece.intent;
      return `${describePieceIntent(_exhaustive)}: ${piece.label}`;
    }
  }
}

function hotswapInstruction(pieces: PieceDraft[]): string {
  if (pieces.length === 0) {
    return "Remove previously inserted custom furniture and restage those spots so the room stays coherent.";
  }
  const lines = pieces.map((piece) => {
    const label = piece.label.trim() || "uploaded piece";
    switch (piece.intent) {
      case "replace":
        return `Replace "${piece.replaces}" with the uploaded "${label}".`;
      case "add":
        return `Add the uploaded "${label}" as a new object in the room.`;
      default: {
        const _exhaustive: never = piece.intent;
        throw new Error(`Unhandled piece intent: ${_exhaustive}`);
      }
    }
  });
  return `Update the furniture using the uploaded piece photos. Keep the rest of this design.\n${lines.join("\n")}`;
}

function styleLabelForSave(
  brief: UserBriefInput,
  selectedStyleId: string | null,
): string {
  const written = brief.style.trim();
  if (written) return written;
  if (selectedStyleId) return "Saved style";
  return "No written style";
}

function DownloadImageButton({
  url,
  filename,
  onError,
}: {
  url: string;
  filename: string;
  onError: (message: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={downloading}
      onClick={async () => {
        setDownloading(true);
        try {
          await downloadUrl(url, filename);
        } catch (err) {
          onError(
            err instanceof Error ? err.message : "Couldn't download the image",
          );
        } finally {
          setDownloading(false);
        }
      }}
      className="h-12 gap-2 rounded-full px-6 text-[15px] font-bold"
    >
      {downloading ? <Loader2 className="animate-spin" /> : <Download />}
      Download image
    </Button>
  );
}

export function RestageApp() {
  const [step, setStep] = useState<FlowStageId>("space");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [galleryCount, setGalleryCount] = useState(0);
  const [piecesAck, setPiecesAck] = useState(false);

  const [roomFiles, setRoomFiles] = useState<File[]>([]);
  const [styleFiles, setStyleFiles] = useState<File[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [pieces, setPieces] = useState<PieceDraft[]>([]);
  const [floorPlanFile, setFloorPlanFile] = useState<File[]>([]);
  const [brief, setBrief] = useState<UserBriefInput>(defaultBrief);
  const [qualityGate, setQualityGate] = useState(true);
  const [imageNotes, setImageNotes] = useState<ImageNote[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [sourcing, setSourcing] = useState(false);
  const [activity, setActivity] = useState<FlowStageId | null>(null);
  const [statusText, setStatusText] = useState("");

  const [inventory, setInventory] = useState<RoomInventory | null>(null);
  const [designBrief, setDesignBrief] = useState<DesignBrief | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [roomDataUrl, setRoomDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busy = analyzing || generating || refining || sourcing;
  const furnitureNames =
    inventory?.existingFurniture.map((item) => item.item) ?? [];
  const assignmentError = pieceListError(pieces, furnitureNames);
  const canAnalyze = roomFiles.length > 0;

  useEffect(() => {
    let active = true;
    listGenerations()
      .then((items) => {
        if (active) setGalleryCount(items.length);
      })
      .catch(() => {
        if (active) setGalleryCount(0);
      });
    return () => {
      active = false;
    };
  }, [galleryRevision]);

  const stageAvailable = useCallback(
    (stage: FlowStageId): boolean => {
      switch (stage) {
        case "space":
          return true;
        case "pieces":
        case "style":
          return inventory !== null;
        case "render":
          return renderResult !== null && designBrief !== null;
        case "source":
          return shoppingList !== null;
        default: {
          const _exhaustive: never = stage;
          throw new Error(`Unhandled stage: ${String(_exhaustive)}`);
        }
      }
    },
    [inventory, renderResult, designBrief, shoppingList],
  );

  const completed: FlowStageId[] = [];
  if (inventory) completed.push("space");
  if (piecesAck || designBrief) completed.push("pieces");
  if (designBrief) completed.push("style");
  if (renderResult) completed.push("render");
  if (shoppingList) completed.push("source");

  const available = FLOW_STAGES.map((stage) => stage.id).filter((id) =>
    stageAvailable(id),
  );

  const clearResults = () => {
    setInventory(null);
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setRoomDataUrl(null);
    setImageNotes([]);
    setPiecesAck(false);
    setStatusText("");
    setActivity(null);
    setBrief((current) => ({ ...current, keepItems: [] }));
    setPieces((current) =>
      current.map((piece) => ({ ...piece, replaces: "" })),
    );
  };

  const resetFromPhotoChange = (files: File[]) => {
    setRoomFiles(files);
    clearResults();
    setStep("space");
    setGalleryOpen(false);
  };

  const handlePiecesChange = (next: PieceDraft[]) => {
    setPieces(next);
    const replaced = next
      .filter((piece) => piece.intent === "replace" && piece.replaces.trim())
      .map((piece) => piece.replaces.trim());
    if (replaced.length === 0) return;
    setBrief((current) => {
      const keepItems = current.keepItems.filter(
        (keep) => !replaced.some((item) => itemsMatch(keep, item)),
      );
      if (keepItems.length === current.keepItems.length) return current;
      return { ...current, keepItems };
    });
  };

  const goTo = (next: FlowStageId) => {
    if (busy || !stageAvailable(next)) return;
    if (next === "style" || next === "render" || next === "source") {
      setPiecesAck(true);
    }
    setError(null);
    setGalleryOpen(false);
    setStep(next);
  };

  const rememberRender = useCallback(
    async (result: RenderResult, sourceBrief: UserBriefInput) => {
      try {
        const image = await blobFromImageUrl(result.imageUrl);
        await saveGeneration({
          roomType: sourceBrief.roomType,
          styleLabel: styleLabelForSave(sourceBrief, selectedStyleId),
          region: withRegion(sourceBrief).region,
          mediaType: result.mediaType || image.type || "image/jpeg",
          image,
        });
        setGalleryRevision((current) => current + 1);
        setNotice("Saved to your gallery.");
      } catch (err) {
        setNotice(
          err instanceof Error
            ? err.message
            : "Couldn't save this generation to the gallery.",
        );
      }
    },
    [selectedStyleId],
  );

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;

    setAnalyzing(true);
    setActivity("space");
    setError(null);
    setNotice(null);
    setInventory(null);
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setImageNotes([]);
    setPiecesAck(false);
    setStatusText("Analyzing room…");

    try {
      const roomImages = await Promise.all(roomFiles.map(fileToPreparedDataUrl));
      const floorPlan = floorPlanFile[0]
        ? await fileToPreparedDataUrl(floorPlanFile[0])
        : undefined;

      setRoomDataUrl(roomImages[0]);
      const analyzed = await callApi<RoomInventory>(
        "/api/analyze",
        { roomImages, floorPlan, userBrief: withRegion(brief) },
        setStatusText,
      );
      setInventory(analyzed);
      setBrief((current) => ({ ...current, keepItems: [] }));
      setPieces((current) =>
        current.map((piece) => ({ ...piece, replaces: "" })),
      );
      setStep("pieces");
      setStatusText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
      setActivity(null);
    }
  }, [canAnalyze, roomFiles, floorPlanFile, brief]);

  const refreshShopping = useCallback(
    async (planned: DesignBrief, imageUrl: string) => {
      setActivity("source");
      setStatusText("Sourcing furniture…");
      const list = await callApi<ShoppingList>(
        "/api/shopping-list",
        { designBrief: planned, renderUrl: imageUrl },
        setStatusText,
      );
      setShoppingList(list);
      setStatusText("");
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!inventory || !roomDataUrl || assignmentError) {
      if (assignmentError) {
        setError(assignmentError);
        setStep("pieces");
      }
      return;
    }

    setGenerating(true);
    setError(null);
    setNotice(null);
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setImageNotes([]);
    setPiecesAck(true);
    setActivity("style");
    setStatusText("Designing…");

    try {
      const roomImage = roomFiles[0]
        ? await fileToPreparedDataUrl(roomFiles[0])
        : roomDataUrl;
      setRoomDataUrl(roomImage);

      const styleRefs = selectedStyleId
        ? []
        : await Promise.all(styleFiles.map(fileToPreparedDataUrl));
      const pieceReferences = await draftsToPayloads(pieces);

      const planned = await callApi<DesignBrief>(
        "/api/plan",
        {
          inventory: {
            ...inventory,
            roomType: brief.roomType,
            constraintsFromUser: {
              ...inventory.constraintsFromUser,
              style: brief.style,
              budgetTier: brief.budgetTier,
              region: withRegion(brief).region,
              function: brief.function,
              keepItems: brief.keepItems,
            },
          },
          keepItems: brief.keepItems,
          roomImage,
          styleId: selectedStyleId ?? undefined,
          pieceReferences,
        },
        setStatusText,
      );
      setDesignBrief(planned);

      setActivity("render");
      setStep("render");
      setStatusText("Rendering…");
      const rendered = await callApi<RenderResult>(
        "/api/render",
        {
          designBrief: planned,
          roomImage,
          styleReferences: styleRefs,
          styleId: selectedStyleId ?? undefined,
          pieceReferences,
          qualityGate,
        },
        setStatusText,
      );
      setRenderResult(rendered);
      await rememberRender(rendered, brief);

      try {
        await refreshShopping(planned, rendered.imageUrl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "The render is ready, but sourcing failed",
        );
      }
      setStep("render");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStep("style");
      setActivity(null);
      setStatusText("");
    } finally {
      setGenerating(false);
      setActivity(null);
    }
  }, [
    inventory,
    roomDataUrl,
    assignmentError,
    roomFiles,
    styleFiles,
    selectedStyleId,
    pieces,
    brief,
    qualityGate,
    rememberRender,
    refreshShopping,
  ]);

  const currentRoomImage = useCallback(async () => {
    if (roomFiles[0]) {
      const roomImage = await fileToPreparedDataUrl(roomFiles[0]);
      setRoomDataUrl(roomImage);
      return roomImage;
    }
    return roomDataUrl;
  }, [roomFiles, roomDataUrl]);

  const handleRefine = useCallback(
    async (instruction: string) => {
      if (!designBrief || !renderResult) return;
      const combined = composeRefineInstruction(instruction, imageNotes);
      if (!combined) return;

      setRefining(true);
      setActivity("render");
      setError(null);
      setNotice(null);
      setStatusText("Refining design…");

      try {
        const roomImage = await currentRoomImage();
        if (!roomImage) return;
        const styleRefs = selectedStyleId
          ? []
          : await Promise.all(styleFiles.map(fileToPreparedDataUrl));
        const pieceReferences = await draftsToPayloads(pieces);
        const nextBrief: DesignBrief = {
          ...designBrief,
          roomType: brief.roomType,
          pieceReferences: draftsToMetas(pieces),
          constraintsFromUser: {
            ...designBrief.constraintsFromUser,
            style: brief.style,
            budgetTier: brief.budgetTier,
            region: withRegion(brief).region,
            function: brief.function,
            keepItems: brief.keepItems,
          },
        };
        setDesignBrief(nextBrief);

        const refined = await callApi<RenderResult>(
          "/api/refine",
          {
            designBrief: nextBrief,
            roomImage,
            currentRenderUrl: renderResult.imageUrl,
            instruction: combined,
            styleReferences: styleRefs,
            styleId: selectedStyleId ?? undefined,
            pieceReferences,
            qualityGate,
          },
          setStatusText,
        );
        setRenderResult(refined);
        setImageNotes([]);
        await rememberRender(refined, brief);

        try {
          await refreshShopping(nextBrief, refined.imageUrl);
        } catch (err) {
          setError(
            err instanceof Error
              ? `${err.message} The updated image is still saved.`
              : "Image updated, but the shopping list could not be refreshed.",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Refinement failed");
      } finally {
        setRefining(false);
        setActivity(null);
        setStatusText("");
      }
    },
    [
      designBrief,
      renderResult,
      imageNotes,
      currentRoomImage,
      selectedStyleId,
      styleFiles,
      pieces,
      brief,
      qualityGate,
      rememberRender,
      refreshShopping,
    ],
  );

  const openSource = async () => {
    if (!designBrief || !renderResult) return;
    if (shoppingList) {
      goTo("source");
      return;
    }
    setSourcing(true);
    setError(null);
    try {
      await refreshShopping(designBrief, renderResult.imageUrl);
      setStep("source");
      setGalleryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sourcing failed");
    } finally {
      setSourcing(false);
      setActivity(null);
    }
  };

  const startNewGeneration = () => {
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setImageNotes([]);
    setError(null);
    setNotice(null);
    setStatusText("");
    setActivity(null);
    setGalleryOpen(false);
    setStep("style");
  };

  const hasRender = Boolean(designBrief && renderResult && roomDataUrl);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <header className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-4 lg:py-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary">
              <Sofa className="size-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-extrabold leading-none tracking-tight text-primary">
                Restage
              </div>
              <p className="mt-1 hidden text-xs font-medium leading-none text-muted-foreground lg:block">
                Your personal AI interior designer
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-pressed={galleryOpen}
            onClick={() => setGalleryOpen((open) => !open)}
            className="h-8 justify-self-end gap-1.5 rounded-full px-3 text-sm font-bold lg:col-start-3 lg:row-start-1"
          >
            <Images className="size-4" />
            Gallery
            {galleryCount > 0 ? (
              <span className="rounded-full bg-background px-1.5 text-[11px] leading-5">
                {galleryCount}
              </span>
            ) : null}
          </Button>
          {galleryOpen ? null : (
            <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">
              <ProgressStages
                viewed={step}
                completed={completed}
                available={available}
                busyStage={activity}
                locked={busy}
                statusText={statusText}
                onSelect={goTo}
              />
            </div>
          )}
        </header>
      </div>

      <main
        className={cn(
          "mx-auto max-w-5xl space-y-10 px-5 pt-8 sm:px-10",
          hasRender && step === "render" && !galleryOpen ? "pb-36" : "pb-16",
        )}
      >
        {galleryOpen ? (
          <GalleryLibrary
            key={galleryRevision}
            revision={galleryRevision}
            onBack={() => setGalleryOpen(false)}
            onChanged={() => setGalleryRevision((current) => current + 1)}
          />
        ) : (
          <>
            {error ? (
              <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">
                {error}
                {error.includes("AI_GATEWAY") || error.includes("BLOB") ? (
                  <p className="mt-2 text-xs opacity-80">
                    Configure environment variables to enable live AI features.
                    The UI loads without them — see README for setup.
                  </p>
                ) : null}
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-2xl bg-muted px-5 py-3 text-sm font-medium text-muted-foreground">
                {notice}
              </div>
            ) : null}

            {step === "space" ? (
              <section className="space-y-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <h1 className="text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">
                    Upload your space
                  </h1>
                  <p className="max-w-xl text-lg font-medium text-muted-foreground">
                    Start with a photo of the room. Style, furniture, and the
                    brief come after this room is analyzed.
                  </p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <UploadZone
                    label="Room photo"
                    description="The room to redesign"
                    badge="Required"
                    files={roomFiles}
                    onChange={resetFromPhotoChange}
                  />
                  <UploadZone
                    label="Floor plan"
                    description="Image or PDF for dimensions"
                    badge="Optional"
                    files={floorPlanFile}
                    onChange={(files) => {
                      setFloorPlanFile(files);
                      clearResults();
                      setStep("space");
                    }}
                    accept="image/*,.pdf"
                  />
                </div>
                {inventory && roomDataUrl ? (
                  <div className="mx-auto flex max-w-md flex-col gap-3">
                    <div className="relative overflow-hidden rounded-3xl bg-muted">
                      {/* Room photos are local data URLs, not remote assets. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={roomDataUrl}
                        alt="Analyzed room"
                        className="block w-full object-cover"
                      />
                      <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background py-2 pl-3.5 pr-4 text-[13px] font-bold shadow-sm">
                        <Check className="size-3.5 text-primary" strokeWidth={3} />
                        Analyzed
                      </div>
                    </div>
                    <span className="text-center text-[13px] font-medium text-faint">
                      {inventory.existingFurniture.length} items detected
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-center gap-3">
                  <Button
                    onClick={handleAnalyze}
                    disabled={!canAnalyze || busy}
                    className="h-14 gap-2.5 rounded-full px-8 text-[17px] font-bold [&_svg:not([class*='size-'])]:size-5"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <ScanSearch />
                        {inventory ? "Analyze again" : "Analyze"}
                      </>
                    )}
                  </Button>
                  {inventory ? (
                    <Button
                      variant="secondary"
                      onClick={() => goTo("pieces")}
                      disabled={busy}
                      className="h-14 rounded-full px-7 text-[17px] font-bold"
                    >
                      Continue to pieces
                    </Button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === "pieces" && inventory ? (
              <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                {roomDataUrl ? (
                  <div className="flex flex-col gap-3">
                    <div className="relative overflow-hidden rounded-3xl bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={roomDataUrl}
                        alt="Analyzed room"
                        className="block w-full object-cover"
                      />
                    </div>
                    <span className="text-center text-[13px] font-medium text-faint">
                      {roomFiles[0]?.name ?? "room photo"} ·{" "}
                      {inventory.existingFurniture.length} items detected
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-col gap-8">
                  <div className="space-y-1.5">
                    <h1 className="text-[32px] font-extrabold tracking-[-0.025em]">
                      Pieces
                    </h1>
                    <p className="font-medium text-muted-foreground">
                      Upload extra furniture, lighting, rugs, or other pieces.
                      Add places a piece in the room. Replace swaps an item
                      found in the analysis.
                    </p>
                  </div>
                  <PiecePicker
                    pieces={pieces}
                    onChange={handlePiecesChange}
                    furniture={inventory.existingFurniture}
                    disabled={busy}
                    intro={null}
                  />
                  <div className="space-y-1.5">
                    <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
                      What should stay?
                    </h2>
                    <p className="font-medium text-muted-foreground">
                      Check anything that should remain as it is. You can also
                      type an item that was missed.
                    </p>
                  </div>
                  <KeepPicker
                    furniture={inventory.existingFurniture}
                    keepItems={brief.keepItems}
                    replacedItems={pieces
                      .filter(
                        (piece) =>
                          piece.intent === "replace" && piece.replaces.trim(),
                      )
                      .map((piece) => piece.replaces.trim())}
                    onChange={(keepItems) =>
                      setBrief((current) => ({ ...current, keepItems }))
                    }
                    disabled={busy}
                  />
                  {assignmentError ? (
                    <p className="text-sm font-medium text-destructive">
                      {assignmentError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => goTo("style")}
                      disabled={busy || Boolean(assignmentError)}
                      className="h-14 rounded-full px-8 text-[17px] font-bold"
                    >
                      Continue to style
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => goTo("space")}
                      disabled={busy}
                      className="h-14 rounded-full px-7 text-[17px] font-bold"
                    >
                      Back
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {step === "style" && inventory ? (
              <section className="space-y-8">
                <div className="space-y-1.5">
                  <h1 className="text-4xl font-extrabold tracking-[-0.025em]">
                    Style and brief
                  </h1>
                  <p className="font-medium text-muted-foreground">
                    Pick a saved style if you have one, then fill the brief.
                    Style direction and how the room is used can be left blank.
                  </p>
                </div>
                <StylePicker
                  selected={selectedStyleId}
                  onSelect={setSelectedStyleId}
                />
                <div className="rounded-lg border border-dashed">
                  <button
                    type="button"
                    onClick={() => setOneOffOpen((open) => !open)}
                    aria-expanded={oneOffOpen}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-muted-foreground"
                  >
                    <span>Or upload one-off references for this render only</span>
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform",
                        oneOffOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {oneOffOpen ? (
                    <div className="border-t px-4 py-4">
                      {selectedStyleId ? (
                        <p className="mb-3 text-xs text-muted-foreground">
                          A saved style is selected — it takes priority. Deselect
                          it to use these one-off references.
                        </p>
                      ) : null}
                      <UploadZone
                        label="Style references"
                        description="Mood and material inspiration"
                        badge="Optional"
                        files={styleFiles}
                        onChange={setStyleFiles}
                        multiple
                      />
                    </div>
                  ) : null}
                </div>
                <BriefForm value={brief} onChange={setBrief} />
                <label className="flex cursor-pointer items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={qualityGate}
                    onClick={() => setQualityGate((value) => !value)}
                    className={cn(
                      "relative h-[26px] w-11 shrink-0 rounded-full transition-colors",
                      qualityGate ? "bg-primary" : "bg-[#ddd5cc]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-[3px] size-5 rounded-full bg-white transition-all",
                        qualityGate ? "left-[21px]" : "left-[3px]",
                      )}
                    />
                  </button>
                  <span className="text-sm font-medium">
                    Auto quality check (recommended) — critiques the render and
                    refines once if needed
                  </span>
                </label>
                {assignmentError ? (
                  <p className="text-sm font-medium text-destructive">
                    {assignmentError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleGenerate}
                    disabled={busy || Boolean(assignmentError)}
                    className="h-14 gap-2.5 rounded-full px-8 text-[17px] font-bold [&_svg:not([class*='size-'])]:size-5"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        Generate redesign
                      </>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => goTo("pieces")}
                    disabled={busy}
                    className="h-14 rounded-full px-7 text-[17px] font-bold"
                  >
                    Back
                  </Button>
                </div>
              </section>
            ) : null}

            {step === "render" && hasRender && designBrief && renderResult && roomDataUrl ? (
              <section className="space-y-10">
                <div className="space-y-1.5">
                  <h1 className="text-4xl font-extrabold tracking-[-0.025em]">
                    Render
                  </h1>
                  <p className="font-medium text-muted-foreground">
                    Compare the room, pin a note on the image, or swap a piece
                    without starting over.
                  </p>
                </div>

                {designBrief.constraintsFromUser.keepItems.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-bold text-muted-foreground">
                      Kept:
                    </span>
                    {designBrief.constraintsFromUser.keepItems.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-muted px-3.5 py-1.5 text-[13px] font-semibold"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}

                {(designBrief.pieceReferences ?? []).length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-bold text-muted-foreground">
                      Your pieces:
                    </span>
                    {designBrief.pieceReferences.map((piece) => (
                      <span
                        key={piece.id}
                        className="rounded-full bg-tint px-3.5 py-1.5 text-[13px] font-semibold text-tint-foreground"
                      >
                        {pieceChipLabel(piece)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <BeforeAfterSlider
                  beforeSrc={roomDataUrl}
                  afterSrc={renderResult.imageUrl}
                />

                <div className="flex flex-wrap gap-3">
                  <DownloadImageButton
                    url={renderResult.imageUrl}
                    filename={downloadFilename(
                      designBrief.roomType,
                      renderResult.mediaType,
                    )}
                    onError={setError}
                  />
                  <Button
                    type="button"
                    onClick={openSource}
                    disabled={busy}
                    className="h-12 rounded-full px-6 text-[15px] font-bold"
                  >
                    {sourcing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      "Continue to sourcing"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => goTo("style")}
                    disabled={busy}
                    className="h-12 rounded-full px-6 text-[15px] font-bold"
                  >
                    Back
                  </Button>
                </div>

                <RenderNotes
                  src={renderResult.imageUrl}
                  notes={imageNotes}
                  onChange={setImageNotes}
                  disabled={busy}
                />

                <div className="space-y-4 rounded-3xl border border-border p-5 sm:p-6">
                  <div className="space-y-1">
                    <h3 className="text-[22px] font-extrabold tracking-[-0.02em]">
                      Swap a piece
                    </h3>
                    <p className="text-sm font-medium text-muted-foreground">
                      Upload different furniture, or switch between Add and Replace.
                      Add needs no existing item. Applying it updates this
                      render in place.
                    </p>
                  </div>
                  <PiecePicker
                    pieces={pieces}
                    onChange={handlePiecesChange}
                    furniture={inventory?.existingFurniture ?? []}
                    disabled={busy}
                    intro={null}
                  />
                  {assignmentError ? (
                    <p className="text-sm font-medium text-destructive">
                      {assignmentError}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => handleRefine(hotswapInstruction(pieces))}
                    disabled={busy || Boolean(assignmentError)}
                    className="h-12 rounded-full px-6 text-[15px] font-bold"
                  >
                    {refining ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      "Apply to this render"
                    )}
                  </Button>
                </div>

                <div className="flex flex-col gap-5 rounded-3xl border border-border p-6 sm:p-8">
                  <h3 className="text-[22px] font-extrabold tracking-[-0.02em]">
                    Design rationale
                  </h3>
                  <p className="max-w-4xl text-[15px] leading-[1.65]">
                    {designBrief.designStrategy.reasoning}
                  </p>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                        Palette
                      </p>
                      <p className="text-[15px] leading-normal">
                        {designBrief.designStrategy.palette.join(" · ")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                        Materials
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {designBrief.designStrategy.materials.map((material) => (
                          <span
                            key={material}
                            className="rounded-full bg-muted px-3 py-1.5 text-[13px] font-semibold"
                          >
                            {material}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                        Layout
                      </p>
                      <p className="text-[15px] leading-normal">
                        {designBrief.designStrategy.layoutConcept}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                        Focal point
                      </p>
                      <p className="text-[15px] leading-normal">
                        {designBrief.designStrategy.focalPoint}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {step === "render" && !hasRender ? (
              <section className="flex flex-col items-center gap-4 py-16 text-center">
                {busy ? (
                  <>
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-[17px] font-bold">
                      {statusText || "Rendering…"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[17px] font-bold">
                      This generation is not ready yet.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setStep("style")}
                      className="h-12 rounded-full px-6 text-[15px] font-bold"
                    >
                      Back to style
                    </Button>
                  </>
                )}
              </section>
            ) : null}

            {step === "source" && shoppingList && renderResult && designBrief ? (
              <section className="space-y-8">
                <div className="space-y-1.5">
                  <h1 className="text-4xl font-extrabold tracking-[-0.025em]">
                    Source
                  </h1>
                  <p className="font-medium text-muted-foreground">
                    Shop the pieces in this design, go back to change an earlier
                    step, or start a new generation.
                  </p>
                </div>
                <ShoppingListView list={shoppingList} />
                <DownloadImageButton
                  url={renderResult.imageUrl}
                  filename={downloadFilename(
                    designBrief.roomType,
                    renderResult.mediaType,
                  )}
                  onError={setError}
                />
                <div className="space-y-3 rounded-3xl border border-border p-5 sm:p-6">
                  <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
                    Go back to an earlier stage
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => goTo("render")}
                      className="h-11 rounded-full px-5 text-[15px] font-bold"
                    >
                      Back to render
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => goTo("style")}
                      className="h-11 rounded-full px-5 text-[15px] font-bold"
                    >
                      Back to style
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => goTo("pieces")}
                      className="h-11 rounded-full px-5 text-[15px] font-bold"
                    >
                      Back to pieces
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => goTo("space")}
                      className="h-11 rounded-full px-5 text-[15px] font-bold"
                    >
                      Back to upload
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  <Button
                    type="button"
                    onClick={startNewGeneration}
                    className="h-14 rounded-full px-8 text-[17px] font-bold"
                  >
                    New generation
                  </Button>
                  <p className="text-sm font-medium text-muted-foreground">
                    Clears this render and returns to the style brief. The image
                    stays in your gallery.
                  </p>
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>

      {hasRender && step === "render" && !galleryOpen ? (
        <RefineBar
          onRefine={handleRefine}
          disabled={busy}
          allowEmpty={imageNotes.length > 0}
        />
      ) : null}
    </div>
  );
}
