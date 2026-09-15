"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/upload-zone";
import { StylePicker } from "@/components/style-picker";
import { BriefForm } from "@/components/brief-form";
import { KeepPicker } from "@/components/keep-picker";
import {
  ProgressStages,
  type StageId,
} from "@/components/progress-stages";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { ShoppingListView } from "@/components/shopping-list";
import { RefineBar } from "@/components/refine-bar";
import { Button } from "@/components/ui/button";
import { callApi, fileToPreparedDataUrl } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type {
  DesignBrief,
  RoomInventory,
  ShoppingList,
  UserBriefInput,
} from "@/lib/ai/schemas";
import { Check, ChevronDown, Loader2, ScanSearch, Sofa, Sparkles } from "lucide-react";

type RenderResult = { imageUrl: string; mediaType: string };

function getDefaultRegion(): string {
  if (typeof navigator === "undefined") return "United States";
  const locale = navigator.language;
  if (locale.includes("nl")) return "Netherlands";
  if (locale.includes("en-GB")) return "United Kingdom";
  if (locale.includes("de")) return "Germany";
  if (locale.includes("fr")) return "France";
  return "United States";
}

const defaultBrief: UserBriefInput = {
  roomType: "living room",
  style: "Warm minimal",
  budgetTier: "mid",
  region: getDefaultRegion(),
  keepItems: [],
  function: "",
};

export function RestageApp() {
  const [roomFiles, setRoomFiles] = useState<File[]>([]);
  const [styleFiles, setStyleFiles] = useState<File[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [floorPlanFile, setFloorPlanFile] = useState<File[]>([]);
  const [brief, setBrief] = useState<UserBriefInput>(defaultBrief);
  const [qualityGate, setQualityGate] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentStage, setCurrentStage] = useState<StageId | null>(null);
  const [completedStages, setCompletedStages] = useState<StageId[]>([]);
  const [statusText, setStatusText] = useState("");

  const [inventory, setInventory] = useState<RoomInventory | null>(null);
  const [designBrief, setDesignBrief] = useState<DesignBrief | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [roomDataUrl, setRoomDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBrief((current) => ({ ...current, region: getDefaultRegion() }));
  }, []);

  const busy = analyzing || generating;
  const canAnalyze = roomFiles.length > 0 && brief.function.trim().length > 0;
  const canGenerate = inventory !== null && roomDataUrl !== null;
  const hasResults = designBrief && renderResult && roomDataUrl;
  const showKeepStep = inventory !== null && !hasResults && !generating;

  const resetFromPhotoChange = (files: File[]) => {
    setRoomFiles(files);
    setInventory(null);
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setCompletedStages([]);
    setRoomDataUrl(null);
    setBrief((current) => ({ ...current, keepItems: [] }));
  };

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;

    setAnalyzing(true);
    setError(null);
    setInventory(null);
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setCompletedStages([]);
    setStatusText("");

    try {
      const roomImages = await Promise.all(roomFiles.map(fileToPreparedDataUrl));
      const floorPlan = floorPlanFile[0]
        ? await fileToPreparedDataUrl(floorPlanFile[0])
        : undefined;

      setRoomDataUrl(roomImages[0]);
      setCurrentStage("analyze");
      const analyzed = await callApi<RoomInventory>(
        "/api/analyze",
        { roomImages, floorPlan, userBrief: brief },
        setStatusText,
      );
      setInventory(analyzed);
      setBrief((current) => ({ ...current, keepItems: [] }));
      setCompletedStages(["analyze"]);
      setCurrentStage(null);
      setStatusText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setCurrentStage(null);
    } finally {
      setAnalyzing(false);
    }
  }, [canAnalyze, roomFiles, floorPlanFile, brief]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !inventory || !roomDataUrl) return;

    setGenerating(true);
    setError(null);
    setDesignBrief(null);
    setRenderResult(null);
    setShoppingList(null);
    setCompletedStages(["analyze"]);
    setStatusText("");

    try {
      // Re-encode from the file input so a stale HEIC data URL is not reused.
      const roomImage = roomFiles[0]
        ? await fileToPreparedDataUrl(roomFiles[0])
        : roomDataUrl;
      setRoomDataUrl(roomImage);

      // A selected saved style is resolved server-side via styleId; only fall
      // back to one-off data-URL references when no style is chosen.
      const styleRefs = selectedStyleId
        ? []
        : await Promise.all(styleFiles.map(fileToPreparedDataUrl));

      setCurrentStage("design");
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
              region: brief.region,
              function: brief.function,
              keepItems: brief.keepItems,
            },
          },
          keepItems: brief.keepItems,
          roomImage,
          styleId: selectedStyleId ?? undefined,
        },
        setStatusText,
      );
      setDesignBrief(planned);
      setCompletedStages(["analyze", "design"]);

      setCurrentStage("render");
      const rendered = await callApi<RenderResult>(
        "/api/render",
        {
          designBrief: planned,
          roomImage,
          styleReferences: styleRefs,
          styleId: selectedStyleId ?? undefined,
          qualityGate,
        },
        setStatusText,
      );
      setRenderResult(rendered);
      setCompletedStages(["analyze", "design", "render"]);

      setCurrentStage("shop");
      const list = await callApi<ShoppingList>(
        "/api/shopping-list",
        { designBrief: planned, renderUrl: rendered.imageUrl },
        setStatusText,
      );
      setShoppingList(list);
      setCompletedStages(["analyze", "design", "render", "shop"]);
      setCurrentStage(null);
      setStatusText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setCurrentStage(null);
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    inventory,
    roomDataUrl,
    roomFiles,
    styleFiles,
    selectedStyleId,
    brief,
    qualityGate,
  ]);

  const handleRefine = useCallback(
    async (instruction: string) => {
      if (!designBrief || !renderResult || !roomDataUrl) return;

      setError(null);
      setStatusText("Refining design…");

      try {
        const roomImage = roomFiles[0]
          ? await fileToPreparedDataUrl(roomFiles[0])
          : roomDataUrl;
        setRoomDataUrl(roomImage);
        const styleRefs = selectedStyleId
          ? []
          : await Promise.all(styleFiles.map(fileToPreparedDataUrl));
        const refined = await callApi<RenderResult>(
          "/api/refine",
          {
            designBrief,
            roomImage,
            currentRenderUrl: renderResult.imageUrl,
            instruction,
            styleReferences: styleRefs,
            styleId: selectedStyleId ?? undefined,
            qualityGate,
          },
          setStatusText,
        );
        setRenderResult(refined);
        setStatusText("Updating shopping list…");

        const list = await callApi<ShoppingList>(
          "/api/shopping-list",
          { designBrief, renderUrl: refined.imageUrl },
          setStatusText,
        );
        setShoppingList(list);
        setStatusText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Refinement failed");
      }
    },
    [
      designBrief,
      renderResult,
      roomDataUrl,
      roomFiles,
      styleFiles,
      selectedStyleId,
      qualityGate,
    ],
  );

  return (
    <div className="min-h-screen bg-background">
      <header>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary sm:size-12">
              <Sofa className="size-5 text-primary-foreground sm:size-6" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-primary sm:text-2xl">
              Restage
            </span>
          </div>
          {hasResults ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2">
              <Check className="size-3.5 text-primary" strokeWidth={3} />
              <span className="text-[13px] font-bold">
                Analyzed · Designed · Rendered · Sourced
              </span>
            </div>
          ) : (
            <div className="hidden text-[15px] font-medium text-muted-foreground sm:block">
              Your personal AI interior designer
            </div>
          )}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-5xl space-y-12 px-5 pt-6 sm:px-10",
          hasResults ? "pb-10" : "pb-20",
        )}
      >
        {!hasResults && (
          <>
            <section className="space-y-10">
              <div className="flex flex-col items-center gap-3 pt-4 text-center">
                <h1 className="text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">
                  Upload your space
                </h1>
                <p className="text-lg font-medium text-muted-foreground">
                  Start with a photo of the room you want to redesign.
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
                  onChange={setFloorPlanFile}
                  accept="image/*,.pdf"
                />
              </div>

              <div className="space-y-3">
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
                  {oneOffOpen && (
                    <div className="border-t px-4 py-4">
                      {selectedStyleId && (
                        <p className="mb-3 text-xs text-muted-foreground">
                          A saved style is selected — it takes priority. Deselect
                          it to use these one-off references.
                        </p>
                      )}
                      <UploadZone
                        label="Style references"
                        description="Mood and material inspiration"
                        badge="Optional"
                        files={styleFiles}
                        onChange={setStyleFiles}
                        multiple
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-7">
              <div className="space-y-1.5">
                <h2 className="text-[28px] font-extrabold tracking-[-0.02em]">
                  Design brief
                </h2>
                <p className="font-medium text-muted-foreground">
                  Tell us how you use the room and what direction you want.
                </p>
              </div>
              <BriefForm value={brief} onChange={setBrief} />
            </section>

            {!inventory && (
              <div className="flex justify-center">
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
                      Analyze room
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {(analyzing || generating || showKeepStep) && (
          <section>
            <ProgressStages
              currentStage={currentStage}
              completedStages={completedStages}
              statusText={statusText}
            />
          </section>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">
            {error}
            {error.includes("AI_GATEWAY") || error.includes("BLOB") ? (
              <p className="mt-2 text-xs opacity-80">
                Configure environment variables to enable live AI features. The
                UI loads without them — see README for setup.
              </p>
            ) : null}
          </div>
        )}

        {showKeepStep && inventory && (
          <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
            {roomDataUrl && (
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-3xl bg-muted">
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
                  {roomFiles[0]?.name ?? "room photo"} ·{" "}
                  {inventory.existingFurniture.length} items detected
                </span>
              </div>
            )}

            <div className="flex flex-col gap-6">
              <div className="space-y-1.5">
                <h2 className="text-[32px] font-extrabold tracking-[-0.025em]">
                  What should stay?
                </h2>
                <p className="font-medium text-muted-foreground">
                  Check anything that should remain as it is. You can also type
                  an item that was missed.
                </p>
              </div>
              <KeepPicker
                furniture={inventory.existingFurniture}
                keepItems={brief.keepItems}
                onChange={(keepItems) =>
                  setBrief((current) => ({ ...current, keepItems }))
                }
                disabled={busy}
              />

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
                  Auto quality check (recommended) — critiques render and
                  refines once if needed
                </span>
              </label>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || busy}
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
                  onClick={handleAnalyze}
                  disabled={!canAnalyze || busy}
                  className="h-14 rounded-full px-7 text-[17px] font-bold"
                >
                  Re-analyze
                </Button>
              </div>
            </div>
          </section>
        )}

        {hasResults && (
          <section className="space-y-10">
            {designBrief.constraintsFromUser.keepItems.length > 0 && (
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
            )}

            <BeforeAfterSlider
              beforeSrc={roomDataUrl}
              afterSrc={renderResult.imageUrl}
            />

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

            {shoppingList && <ShoppingListView list={shoppingList} />}

            <div className="flex justify-center pb-8">
              <Button
                variant="secondary"
                onClick={() => {
                  setDesignBrief(null);
                  setRenderResult(null);
                  setShoppingList(null);
                  setCompletedStages(["analyze"]);
                }}
                className="h-12 rounded-full px-6 text-[15px] font-bold"
              >
                Change keep list
              </Button>
            </div>
          </section>
        )}
      </main>

      {hasResults && (
        <RefineBar onRefine={handleRefine} disabled={generating} />
      )}
    </div>
  );
}
