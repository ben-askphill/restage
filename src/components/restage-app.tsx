"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/upload-zone";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { callApi, fileToDataUrl } from "@/lib/client-api";
import type {
  DesignBrief,
  RoomInventory,
  ShoppingList,
  UserBriefInput,
} from "@/lib/ai/schemas";
import { Loader2, ScanSearch, Sparkles } from "lucide-react";

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
      const roomImages = await Promise.all(roomFiles.map(fileToDataUrl));
      const floorPlan = floorPlanFile[0]
        ? await fileToDataUrl(floorPlanFile[0])
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
      const styleRefs = await Promise.all(styleFiles.map(fileToDataUrl));

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
          roomImage: roomDataUrl,
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
          roomImage: roomDataUrl,
          styleReferences: styleRefs,
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
    styleFiles,
    brief,
    qualityGate,
  ]);

  const handleRefine = useCallback(
    async (instruction: string) => {
      if (!designBrief || !renderResult || !roomDataUrl) return;

      setError(null);
      setStatusText("Refining design…");

      try {
        const styleRefs = await Promise.all(styleFiles.map(fileToDataUrl));
        const refined = await callApi<RenderResult>(
          "/api/refine",
          {
            designBrief,
            roomImage: roomDataUrl,
            currentRenderUrl: renderResult.imageUrl,
            instruction,
            styleReferences: styleRefs,
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
    [designBrief, renderResult, roomDataUrl, styleFiles, qualityGate],
  );

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Restage</h1>
            <p className="text-sm text-muted-foreground">
              Your personal AI interior designer
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        {!hasResults && (
          <>
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-medium">Upload your space</h2>
                <p className="text-sm text-muted-foreground">
                  Start with a photo of the room you want to redesign.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <UploadZone
                  label="Room photo"
                  description="Required — the room to redesign"
                  files={roomFiles}
                  onChange={resetFromPhotoChange}
                />
                <UploadZone
                  label="Style references"
                  description="Optional — mood and material inspiration"
                  files={styleFiles}
                  onChange={setStyleFiles}
                  multiple
                />
                <UploadZone
                  label="Floor plan"
                  description="Optional — image or PDF for dimensions"
                  files={floorPlanFile}
                  onChange={setFloorPlanFile}
                  accept="image/*,.pdf"
                />
              </div>
            </section>

            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-medium">Design brief</h2>
                <p className="text-sm text-muted-foreground">
                  Tell us how you use the room and what direction you want.
                </p>
              </div>
              <BriefForm value={brief} onChange={setBrief} />
            </section>

            {!inventory && (
              <Button
                size="lg"
                onClick={handleAnalyze}
                disabled={!canAnalyze || busy}
                className="w-full sm:w-auto"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <ScanSearch className="mr-2 size-4" />
                    Analyze room
                  </>
                )}
              </Button>
            )}
          </>
        )}

        {(analyzing || generating || hasResults) && (
          <section className="space-y-6">
            <ProgressStages
              currentStage={currentStage}
              completedStages={completedStages}
              statusText={statusText}
            />
          </section>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-medium">What should stay?</h2>
              <p className="text-sm text-muted-foreground">
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

            <div className="flex items-center gap-3">
              <Checkbox
                id="qualityGate"
                checked={qualityGate}
                onCheckedChange={(value) => setQualityGate(value === true)}
              />
              <Label htmlFor="qualityGate" className="text-sm">
                Auto quality check (recommended) — critiques render and refines
                once if needed
              </Label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={!canGenerate || busy}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Generate redesign
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleAnalyze}
                disabled={!canAnalyze || busy}
              >
                Re-analyze
              </Button>
            </div>
          </section>
        )}

        {hasResults && (
          <section className="space-y-10">
            {designBrief.constraintsFromUser.keepItems.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Kept: {designBrief.constraintsFromUser.keepItems.join(" · ")}
              </p>
            )}

            <BeforeAfterSlider
              beforeSrc={roomDataUrl}
              afterSrc={renderResult.imageUrl}
            />

            <Card>
              <CardHeader>
                <CardTitle>Design rationale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>{designBrief.designStrategy.reasoning}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Palette
                    </p>
                    <p>{designBrief.designStrategy.palette.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Materials
                    </p>
                    <p>{designBrief.designStrategy.materials.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Layout
                    </p>
                    <p>{designBrief.designStrategy.layoutConcept}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Focal point
                    </p>
                    <p>{designBrief.designStrategy.focalPoint}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {shoppingList && <ShoppingListView list={shoppingList} />}

            <div className="flex justify-center pb-20">
              <Button
                variant="outline"
                onClick={() => {
                  setDesignBrief(null);
                  setRenderResult(null);
                  setShoppingList(null);
                  setCompletedStages(["analyze"]);
                }}
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
