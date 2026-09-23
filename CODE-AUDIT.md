# Restage — Code Audit

_Date: 2026-09-23 · Branch audited: `claude/code-audit-improvements-qyeysp` (at `b9a9a64`) · Scope: all of `src/`, config, README_

## About this report

This report comes from a multi-agent audit that was **stopped partway through**, at the owner's request. Here is how much of it finished:

- **Audit: done for 8 of 9 dimensions.** The dimensions were API cost, performance, UX, accessibility, correctness, AI output quality, maintainability/deps/docs and platform (Next.js 16 / Vercel). The dedicated **security** auditor's write-up was blocked and returned nothing. Security issues found by the other eight auditors are included.
- **Merge: done.** 153 raw findings were combined into 64 unique findings.
- **Verification: partly done.** 20 of 64 findings were checked by skeptics whose job was to disprove them. This covers **every critical and high finding** (two skeptics each: one testing whether the issue really happens, one testing whether the severity and fix are right) and the first 5 medium ones. Where a finding was verified, its severity, locations and recommendation are the **skeptics' corrected versions**. None of the verified findings was fully refuted, but most were marked "partially confirmed", usually meaning the severity was lowered or the wording tightened.
- **Not run:** the gap-finding pass and the final synthesis. Findings marked **Not verified** have evidence from their auditor but no independent check, so treat their severity as provisional.

Severity scale: **critical** = exploitable now on the public deployment, or unbounded cost or data loss; **high** = significant security, cost, correctness or UX breakage in a common flow; **medium** = noticeable defect or meaningful improvement; **low** = polish.

## Executive summary

64 findings: 1 critical, 3 high, 43 medium, 17 low.

- **Anyone can use the paid AI features.** No route requires authentication, so anyone with the URL can spend the AI Gateway budget and read, create or delete styles and stored images (**SEC-01**). This is the single most important fix. Because it's a single-owner app, a small `src/proxy.ts` check (a shared secret or signed cookie), re-checked inside each route, or Vercel Deployment Protection would cover it.
- **Server-side input handling has holes.** The server will fetch any URL a client sends (**SEC-02**). The `sharp` image pixel limit is switched off (**SEC-03**). Style uploads trust the MIME type the browser declares, which allows stored XSS through `/api/blob` (**SEC-04**). Encoded dot segments get past the `/api/blob` path allowlist (**SEC-05**).
- **The biggest AI spend levers** (none should lower output quality):
  - Saved styles attach every image in the folder, full size, to every render and refine (**COST-01**).
  - The style profile is rebuilt once per upload batch, each time from every image (**COST-02**).
  - Any quality-check failure triggers a second image generation (**COST-03**).
  - Every refine also regenerates the shopping list (**COST-05**).
  - AI calls keep running after the user cancels or disconnects (**COST-04**).
- **Output-quality bugs that also waste renders:**
  - Loose keep-item matching keeps pieces the user wanted replaced (**BUG-01**).
  - Refine prompts mislabel the input images (**AIQ-02**).
  - Every render is forced to 1536×1024 landscape, whatever the photo's shape (**AIQ-01**).
  - PDF floor plans are sent to the model labelled as JPEG (**BUG-03**).
- **Payloads and platform limits.** Images travel as base64 JSON on every step, so requests can exceed Vercel's 4.5 MB body limit (**PLAT-01**). Uploading the room photo to Blob once and passing its path around fixes both payload size and latency.
- **Lost work.** A failed quality check can discard a render that was already paid for (**BUG-02**). Results can't be restored after a refresh, undone or downloaded (**UX-02**). Refine shows no progress and clears the typed instruction on failure (**UX-01**).
- **Accessibility is poor (auditor's grade: D).** Upload zones and the before/after slider can't be operated by keyboard or screen reader (**A11Y-01**, **A11Y-02**), and nothing is announced to assistive technology.
- **Maintainability.** There are no tests and no CI, the route handlers repeat the same boilerplate, and the README has drifted from the code. Its OIDC advice doesn't work, because the code requires `AI_GATEWAY_API_KEY` (**PLAT-02**).

## All findings at a glance

| ID | Severity | Title | Effort | Verification |
|---|---|---|---|---|
| [SEC-01](#sec-01) | 🔴 Critical | No authentication or rate limiting: every paid AI route and every storage or destructive route is publicly callable | S | ✅ Partially confirmed |
| [COST-01](#cost-01) | 🟠 High | Saved styles attach every image in the folder, full size and re-downloaded, to every render, auto re-render and refine | M | ✅ Partially confirmed |
| [BUG-01](#bug-01) | 🟠 High | Fuzzy keep-item matching links unrelated furniture, so the user cannot keep one piece and replace a similar or nearby one | M | ✅ Partially confirmed |
| [AIQ-01](#aiq-01) | 🟠 High | Render size and aspect ignore both the photo and the model: fixed 1536x1024, no aspectRatio, OpenAI-only options on a Gemini default, and a 3:2 object-cover slider | M | ✅ Partially confirmed |
| [SEC-02](#sec-02) | 🟡 Medium (was high) | SSRF and unbounded download: urlToImageInput fetches any client-supplied URL on /api/refine and /api/shopping-list | S | ✅ Partially confirmed |
| [SEC-03](#sec-03) | 🟡 Medium | sharp runs with `unlimited: true` and no resize on unauthenticated input, so a small crafted image can take GBs of memory | S | ✅ Partially confirmed |
| [SEC-04](#sec-04) | 🟡 Medium | Style uploads trust the client-declared MIME type and /api/blob echoes it back, enabling stored SVG XSS on the app origin | S | ✅ Confirmed |
| [COST-02](#cost-02) | 🟡 Medium (was high) | Multi-batch style uploads re-derive the style profile once per batch, each time over every image at full resolution | S | ✅ Partially confirmed |
| [COST-03](#cost-03) | 🟡 Medium (was high) | Quality-gate design: no definition of 'critical', a heavy prompt, and any fail triggers an unchecked re-render that edits the failed image and always replaces the first | M | ✅ Partially confirmed |
| [COST-04](#cost-04) | 🟡 Medium | Runs can't be cancelled, client disconnects never reach the AI calls, the SSE stream sends no heartbeats, and timeouts give a message with no next step | M | Not verified |
| [COST-05](#cost-05) | 🟡 Medium | Every refine regenerates the shopping list with a vision LLM call and keeps the refine bar locked until it returns | S | Not verified |
| [COST-06](#cost-06) | 🟡 Medium | Vision-LLM calls get full-resolution inputs, and renders are stored, served and re-sent as multi-MB PNGs | S | Not verified |
| [BUG-02](#bug-02) | 🟡 Medium (was high) | The optional quality gate can throw away an already-paid render: no fallback, no partial result, no time budget | S | ✅ Partially confirmed |
| [BUG-03](#bug-03) | 🟡 Medium (was high) | PDF floor plans, which the UI advertises, reach the vision model labelled image/jpeg and uncompressed | S | ✅ Partially confirmed |
| [BUG-04](#bug-04) | 🟡 Medium | GET /api/styles/[id] re-derives a stale profile synchronously; if derivation keeps failing, the style can't be opened and every open is billed again | S | ✅ Partially confirmed |
| [BUG-05](#bug-05) | 🟡 Medium | Concurrent uploads to a style overwrite each other's manifest and silently drop images; a late response can show the wrong style | M | Not verified |
| [BUG-06](#bug-06) | 🟡 Medium | The refine quality gate is on by default but never sees the refine instruction, so it can revert the change the user asked for | S | Not verified |
| [AIQ-02](#aiq-02) | 🟡 Medium (was high) | Refine and auto re-render prompts mislabel the input images: labels are detached, 'the last image' is a style reference, and kept items are copied from the failed render | S | ✅ Partially confirmed |
| [AIQ-03](#aiq-03) | 🟡 Medium | Refinements never update the design brief: the 'Cheaper' and 'Keep the sofa' chips can't work, and the shopping list and rationale drift from the image | M | Not verified |
| [AIQ-04](#aiq-04) | 🟡 Medium | A selected saved style conflicts with the pre-filled style text and with the budget tier | S | Not verified |
| [AIQ-05](#aiq-05) | 🟡 Medium | One-off style references never reach the planner, so the plan's palette and the reference images can disagree | S | Not verified |
| [AIQ-06](#aiq-06) | 🟡 Medium | The planner outputs only prose, so the image model is never told which existing pieces to replace, remove or add | M | Not verified |
| [AIQ-07](#aiq-07) | 🟡 Medium | The image prompt names the clichés it wants to avoid and produces broken sentences when lists are empty | S | Not verified |
| [UX-01](#ux-01) | 🟡 Medium (was high) | Refine shows no progress, clears the typed instruction on failure, puts errors off-screen without announcing them, and doesn't count as busy | S | ✅ Partially confirmed |
| [UX-02](#ux-02) | 🟡 Medium (was high) | Results are ephemeral: no history, undo, restore after refresh, or download, and "Change keep list" deletes the current render | M | ✅ Partially confirmed |
| [UX-03](#ux-03) | 🟡 Medium | Partial failures are hidden and nothing retries a single step: a failed render re-runs the plan, and a failed list can only be recovered with a new render | M | Not verified |
| [UX-04](#ux-04) | 🟡 Medium | The implicit state machine in restage-app.tsx has no run identity: inputs stay editable mid-run and late results land on newer state | M | Not verified |
| [UX-05](#ux-05) | 🟡 Medium | Deleting the selected saved style leaves a hidden stale selection: the plan silently drops the style and the render then fails with 'Style not found' | S | Not verified |
| [UX-06](#ux-06) | 🟡 Medium | Required brief fields aren't marked: Analyze stays disabled with no reason, and a blank Style or Region returns a generic 'Invalid user brief' | S | Not verified |
| [UX-07](#ux-07) | 🟡 Medium | The sticky refine bar covers a third to half of a phone screen, and the slider handle draws over it and takes its taps | S | Not verified |
| [UX-08](#ux-08) | 🟡 Medium | The shopping list is ungrounded and not actionable: queries and retailers are plain text, prices are free strings, and there is no total | M | Not verified |
| [A11Y-01](#a11y-01) | 🟡 Medium (was high) | Upload zones can't be reached by keyboard or assistive tech, and the remove/delete buttons have no name and appear only on hover | S | ✅ Partially confirmed |
| [A11Y-02](#a11y-02) | 🟡 Medium (was high) | The before/after slider has no keyboard or assistive-tech support and loses touch drags (no touch-action, no pointercancel) | S | ✅ Partially confirmed |
| [A11Y-03](#a11y-03) | 🟡 Medium | Progress, status and error messages are never announced, and stage state is shown only visually | S | Not verified |
| [A11Y-04](#a11y-04) | 🟡 Medium | Focus and scroll position are not managed between steps, and the results view has no h1 or h2 | S | Not verified |
| [A11Y-05](#a11y-05) | 🟡 Medium | The Manage styles overlay does not behave as a modal: focus is not moved, trapped or returned, and the delete button is invisible when focused | S | Not verified |
| [A11Y-06](#a11y-06) | 🟡 Medium | Several text and UI-state colours fall below WCAG AA contrast (placeholders, faint text, error text, focus ring, switch, checkbox) | S | Not verified |
| [PERF-01](#perf-01) | 🟡 Medium | /api/blob serves immutable blobs as 'private, no-cache' with no validators, and style thumbnails are the full 2048px originals | S | Not verified |
| [PERF-02](#perf-02) | 🟡 Medium | UploadZone creates a new blob: URL for every thumbnail on every render and never revokes them | S | Not verified |
| [PERF-03](#perf-03) | 🟡 Medium | Style images are prepared all at once with Promise.all: memory spikes, and one bad file fails the whole selection | S | Not verified |
| [PLAT-01](#plat-01) | 🟡 Medium (was high) | Images travel as base64 JSON on every call: the room photo is re-uploaded for every step, and one-off references or PDFs push requests past Vercel's 4.5 MB body limit after the plan is already billed | S | ✅ Partially confirmed |
| [PLAT-02](#plat-02) | 🟡 Medium | The env checks require static keys, blocking the OIDC auth the README recommends, and misconfiguration only shows up mid-pipeline | S | Not verified |
| [PLAT-03](#plat-03) | 🟡 Medium | Inputs use a 15px font on phones, so iOS Safari zooms the page on every focus | S | Not verified |
| [MAINT-01](#maint-01) | 🟡 Medium | No server-side error logging and no AI usage or cost capture, so savings and quality can't be measured | S | Not verified |
| [MAINT-02](#maint-02) | 🟡 Medium | No tests and no CI, and in Next 16 `next build` no longer lints, so the current lint error ships | M | Not verified |
| [MAINT-03](#maint-03) | 🟡 Medium | Route handlers duplicate boilerplate, render and refine copy the quality gate, and style resolution exists in 3 divergent versions | M | Not verified |
| [DOC-01](#doc-01) | 🟡 Medium | The README has drifted from the code: routes, env vars, modules and the image-model API are misdocumented, and nothing warns that the app is unauthenticated | S | Not verified |
| [SEC-05](#sec-05) | ⚪ Low (was medium) | The /api/blob prefix allowlist can be bypassed with URL-encoded dot segments | S | ✅ Partially confirmed |
| [SEC-06](#sec-06) | ⚪ Low (was medium) | Request validation is inconsistent across routes: raw destructuring and casts, unbounded strings, 500s for bad input, and manifests never validated | M | ✅ Partially confirmed |
| [SEC-07](#sec-07) | ⚪ Low | next.config.ts is empty: no security headers, the x-powered-by header is sent, and there is no framing, referrer or robots policy | S | Not verified |
| [COST-07](#cost-07) | ⚪ Low | Prompts waste tokens: pretty-printed JSON, duplicated inventory and constraints, static rules after dynamic content, output fields the code overwrites, and no output caps | S | Not verified |
| [COST-08](#cost-08) | ⚪ Low | Room analysis depends only on the photo, yet it waits for the brief, is never cached, and Re-analyze pays for the full call again | S | Not verified |
| [BUG-07](#bug-07) | ⚪ Low | Transparent images turn black, and truncated images are silently grey-filled | S | Not verified |
| [BUG-08](#bug-08) | ⚪ Low | The only ESLint error is a redundant setState-in-effect: the region default is computed at module scope with the server's locale, and locale matching is by substring | S | Not verified |
| [AIQ-08](#aiq-08) | ⚪ Low | Output schemas have no field guidance, include fields that are always overwritten, and leave numbers unbounded | S | Not verified |
| [UX-09](#ux-09) | ⚪ Low | After a generation or refine error, the last status message keeps pulsing as if work were still running | S | Not verified |
| [UX-10](#ux-10) | ⚪ Low | My Styles gaps: no rename, no per-image removal, a new style doesn't open, and the modal can be closed mid-upload | M | Not verified |
| [UX-11](#ux-11) | ⚪ Low | Visual and mobile polish: select triggers show raw lowercase values, the header pill wraps at 320px, keep checkboxes look like radios, and reduced motion is ignored | S | Not verified |
| [A11Y-07](#a11y-07) | ⚪ Low | Selection states and field labels are missing for assistive tech (preset chips, keep and refine inputs, refine chips, style cards) | S | Not verified |
| [PERF-04](#perf-04) | ⚪ Low | heic-convert (libheif wasm) loads at module scope on the render and refine path, for a branch the app never reaches | S | Not verified |
| [PERF-05](#perf-05) | ⚪ Low | The styles list makes N+1 origin Blob reads and is fetched twice after every change | S | Not verified |
| [MAINT-04](#maint-04) | ⚪ Low | One experimental model runs every LLM task with no per-task tuning, sampling controls or fallback, through the deprecated generateObject/system API | S | Not verified |
| [MAINT-05](#maint-05) | ⚪ Low | Dead code: unused exports, UI components, schema, starter assets and redundant declarations | S | Not verified |
| [DEP-01](#dep-01) | ⚪ Low | Dependency hygiene: unused clsx and tailwind-merge, the shadcn CLI in production deps, an unused preloaded font, and no engines field | S | Not verified |

Effort: **S** < 1 hour · **M** a few hours · **L** a day or more.

## Quick wins (effort S)

- [ ] **SEC-01** (critical): No authentication or rate limiting: every paid AI route and every storage or destructive route is publicly callable
- [ ] **SEC-02** (medium): SSRF and unbounded download: urlToImageInput fetches any client-supplied URL on /api/refine and /api/shopping-list
- [ ] **SEC-03** (medium): sharp runs with `unlimited: true` and no resize on unauthenticated input, so a small crafted image can take GBs of memory
- [ ] **SEC-04** (medium): Style uploads trust the client-declared MIME type and /api/blob echoes it back, enabling stored SVG XSS on the app origin
- [ ] **COST-02** (medium): Multi-batch style uploads re-derive the style profile once per batch, each time over every image at full resolution
- [ ] **COST-05** (medium): Every refine regenerates the shopping list with a vision LLM call and keeps the refine bar locked until it returns
- [ ] **COST-06** (medium): Vision-LLM calls get full-resolution inputs, and renders are stored, served and re-sent as multi-MB PNGs
- [ ] **BUG-02** (medium): The optional quality gate can throw away an already-paid render: no fallback, no partial result, no time budget
- [ ] **BUG-03** (medium): PDF floor plans, which the UI advertises, reach the vision model labelled image/jpeg and uncompressed
- [ ] **BUG-04** (medium): GET /api/styles/[id] re-derives a stale profile synchronously; if derivation keeps failing, the style can't be opened and every open is billed again
- [ ] **BUG-06** (medium): The refine quality gate is on by default but never sees the refine instruction, so it can revert the change the user asked for
- [ ] **AIQ-02** (medium): Refine and auto re-render prompts mislabel the input images: labels are detached, 'the last image' is a style reference, and kept items are copied from the failed render
- [ ] **AIQ-04** (medium): A selected saved style conflicts with the pre-filled style text and with the budget tier
- [ ] **AIQ-05** (medium): One-off style references never reach the planner, so the plan's palette and the reference images can disagree
- [ ] **AIQ-07** (medium): The image prompt names the clichés it wants to avoid and produces broken sentences when lists are empty
- [ ] **UX-01** (medium): Refine shows no progress, clears the typed instruction on failure, puts errors off-screen without announcing them, and doesn't count as busy
- [ ] **UX-05** (medium): Deleting the selected saved style leaves a hidden stale selection: the plan silently drops the style and the render then fails with 'Style not found'
- [ ] **UX-06** (medium): Required brief fields aren't marked: Analyze stays disabled with no reason, and a blank Style or Region returns a generic 'Invalid user brief'
- [ ] **UX-07** (medium): The sticky refine bar covers a third to half of a phone screen, and the slider handle draws over it and takes its taps
- [ ] **A11Y-01** (medium): Upload zones can't be reached by keyboard or assistive tech, and the remove/delete buttons have no name and appear only on hover
- [ ] **A11Y-02** (medium): The before/after slider has no keyboard or assistive-tech support and loses touch drags (no touch-action, no pointercancel)
- [ ] **A11Y-03** (medium): Progress, status and error messages are never announced, and stage state is shown only visually
- [ ] **A11Y-04** (medium): Focus and scroll position are not managed between steps, and the results view has no h1 or h2
- [ ] **A11Y-05** (medium): The Manage styles overlay does not behave as a modal: focus is not moved, trapped or returned, and the delete button is invisible when focused
- [ ] **A11Y-06** (medium): Several text and UI-state colours fall below WCAG AA contrast (placeholders, faint text, error text, focus ring, switch, checkbox)
- [ ] **PERF-01** (medium): /api/blob serves immutable blobs as 'private, no-cache' with no validators, and style thumbnails are the full 2048px originals
- [ ] **PERF-02** (medium): UploadZone creates a new blob: URL for every thumbnail on every render and never revokes them
- [ ] **PERF-03** (medium): Style images are prepared all at once with Promise.all: memory spikes, and one bad file fails the whole selection
- [ ] **PLAT-01** (medium): Images travel as base64 JSON on every call: the room photo is re-uploaded for every step, and one-off references or PDFs push requests past Vercel's 4.5 MB body limit after the plan is already billed
- [ ] **PLAT-02** (medium): The env checks require static keys, blocking the OIDC auth the README recommends, and misconfiguration only shows up mid-pipeline
- [ ] **PLAT-03** (medium): Inputs use a 15px font on phones, so iOS Safari zooms the page on every focus
- [ ] **MAINT-01** (medium): No server-side error logging and no AI usage or cost capture, so savings and quality can't be measured
- [ ] **DOC-01** (medium): The README has drifted from the code: routes, env vars, modules and the image-model API are misdocumented, and nothing warns that the app is unauthenticated
- [ ] **SEC-05** (low): The /api/blob prefix allowlist can be bypassed with URL-encoded dot segments
- [ ] **SEC-07** (low): next.config.ts is empty: no security headers, the x-powered-by header is sent, and there is no framing, referrer or robots policy
- [ ] **COST-07** (low): Prompts waste tokens: pretty-printed JSON, duplicated inventory and constraints, static rules after dynamic content, output fields the code overwrites, and no output caps
- [ ] **COST-08** (low): Room analysis depends only on the photo, yet it waits for the brief, is never cached, and Re-analyze pays for the full call again
- [ ] **BUG-07** (low): Transparent images turn black, and truncated images are silently grey-filled
- [ ] **BUG-08** (low): The only ESLint error is a redundant setState-in-effect: the region default is computed at module scope with the server's locale, and locale matching is by substring
- [ ] **AIQ-08** (low): Output schemas have no field guidance, include fields that are always overwritten, and leave numbers unbounded
- [ ] **UX-09** (low): After a generation or refine error, the last status message keeps pulsing as if work were still running
- [ ] **UX-11** (low): Visual and mobile polish: select triggers show raw lowercase values, the header pill wraps at 320px, keep checkboxes look like radios, and reduced motion is ignored
- [ ] **A11Y-07** (low): Selection states and field labels are missing for assistive tech (preset chips, keep and refine inputs, refine chips, style cards)
- [ ] **PERF-04** (low): heic-convert (libheif wasm) loads at module scope on the render and refine path, for a branch the app never reaches
- [ ] **PERF-05** (low): The styles list makes N+1 origin Blob reads and is fetched twice after every change
- [ ] **MAINT-04** (low): One experimental model runs every LLM task with no per-task tuning, sampling controls or fallback, through the deprecated generateObject/system API
- [ ] **MAINT-05** (low): Dead code: unused exports, UI components, schema, starter assets and redundant declarations
- [ ] **DEP-01** (low): Dependency hygiene: unused clsx and tailwind-merge, the shadcn CLI in production deps, an unused preloaded font, and no engines field

## Suggested roadmap

### Phase 1: Lock down (security)

- [ ] **SEC-01** (critical, S): No authentication or rate limiting: every paid AI route and every storage or destructive route is publicly callable
- [ ] **SEC-02** (medium, S): SSRF and unbounded download: urlToImageInput fetches any client-supplied URL on /api/refine and /api/shopping-list
- [ ] **SEC-03** (medium, S): sharp runs with `unlimited: true` and no resize on unauthenticated input, so a small crafted image can take GBs of memory
- [ ] **SEC-04** (medium, S): Style uploads trust the client-declared MIME type and /api/blob echoes it back, enabling stored SVG XSS on the app origin
- [ ] **SEC-05** (low, S): The /api/blob prefix allowlist can be bypassed with URL-encoded dot segments
- [ ] **SEC-06** (low, M): Request validation is inconsistent across routes: raw destructuring and casts, unbounded strings, 500s for bad input, and manifests never validated
- [ ] **SEC-07** (low, S): next.config.ts is empty: no security headers, the x-powered-by header is sent, and there is no framing, referrer or robots policy

### Phase 2: Cut API spend without losing quality

- [ ] **COST-01** (high, M): Saved styles attach every image in the folder, full size and re-downloaded, to every render, auto re-render and refine
- [ ] **AIQ-01** (high, M): Render size and aspect ignore both the photo and the model: fixed 1536x1024, no aspectRatio, OpenAI-only options on a Gemini default, and a 3:2 object-cover slider
- [ ] **COST-02** (medium, S): Multi-batch style uploads re-derive the style profile once per batch, each time over every image at full resolution
- [ ] **COST-03** (medium, M): Quality-gate design: no definition of 'critical', a heavy prompt, and any fail triggers an unchecked re-render that edits the failed image and always replaces the first
- [ ] **COST-04** (medium, M): Runs can't be cancelled, client disconnects never reach the AI calls, the SSE stream sends no heartbeats, and timeouts give a message with no next step
- [ ] **COST-05** (medium, S): Every refine regenerates the shopping list with a vision LLM call and keeps the refine bar locked until it returns
- [ ] **COST-06** (medium, S): Vision-LLM calls get full-resolution inputs, and renders are stored, served and re-sent as multi-MB PNGs
- [ ] **AIQ-02** (medium, S): Refine and auto re-render prompts mislabel the input images: labels are detached, 'the last image' is a style reference, and kept items are copied from the failed render
- [ ] **AIQ-03** (medium, M): Refinements never update the design brief: the 'Cheaper' and 'Keep the sofa' chips can't work, and the shopping list and rationale drift from the image
- [ ] **AIQ-04** (medium, S): A selected saved style conflicts with the pre-filled style text and with the budget tier
- [ ] **AIQ-05** (medium, S): One-off style references never reach the planner, so the plan's palette and the reference images can disagree
- [ ] **AIQ-06** (medium, M): The planner outputs only prose, so the image model is never told which existing pieces to replace, remove or add
- [ ] **AIQ-07** (medium, S): The image prompt names the clichés it wants to avoid and produces broken sentences when lists are empty
- [ ] **COST-07** (low, S): Prompts waste tokens: pretty-printed JSON, duplicated inventory and constraints, static rules after dynamic content, output fields the code overwrites, and no output caps
- [ ] **COST-08** (low, S): Room analysis depends only on the photo, yet it waits for the brief, is never cached, and Re-analyze pays for the full call again
- [ ] **AIQ-08** (low, S): Output schemas have no field guidance, include fields that are always overwritten, and leave numbers unbounded

### Phase 3: Correctness, UX & accessibility

- [ ] **BUG-01** (high, M): Fuzzy keep-item matching links unrelated furniture, so the user cannot keep one piece and replace a similar or nearby one
- [ ] **BUG-02** (medium, S): The optional quality gate can throw away an already-paid render: no fallback, no partial result, no time budget
- [ ] **BUG-03** (medium, S): PDF floor plans, which the UI advertises, reach the vision model labelled image/jpeg and uncompressed
- [ ] **BUG-04** (medium, S): GET /api/styles/[id] re-derives a stale profile synchronously; if derivation keeps failing, the style can't be opened and every open is billed again
- [ ] **BUG-05** (medium, M): Concurrent uploads to a style overwrite each other's manifest and silently drop images; a late response can show the wrong style
- [ ] **BUG-06** (medium, S): The refine quality gate is on by default but never sees the refine instruction, so it can revert the change the user asked for
- [ ] **UX-01** (medium, S): Refine shows no progress, clears the typed instruction on failure, puts errors off-screen without announcing them, and doesn't count as busy
- [ ] **UX-02** (medium, M): Results are ephemeral: no history, undo, restore after refresh, or download, and "Change keep list" deletes the current render
- [ ] **UX-03** (medium, M): Partial failures are hidden and nothing retries a single step: a failed render re-runs the plan, and a failed list can only be recovered with a new render
- [ ] **UX-04** (medium, M): The implicit state machine in restage-app.tsx has no run identity: inputs stay editable mid-run and late results land on newer state
- [ ] **UX-05** (medium, S): Deleting the selected saved style leaves a hidden stale selection: the plan silently drops the style and the render then fails with 'Style not found'
- [ ] **UX-06** (medium, S): Required brief fields aren't marked: Analyze stays disabled with no reason, and a blank Style or Region returns a generic 'Invalid user brief'
- [ ] **UX-07** (medium, S): The sticky refine bar covers a third to half of a phone screen, and the slider handle draws over it and takes its taps
- [ ] **UX-08** (medium, M): The shopping list is ungrounded and not actionable: queries and retailers are plain text, prices are free strings, and there is no total
- [ ] **A11Y-01** (medium, S): Upload zones can't be reached by keyboard or assistive tech, and the remove/delete buttons have no name and appear only on hover
- [ ] **A11Y-02** (medium, S): The before/after slider has no keyboard or assistive-tech support and loses touch drags (no touch-action, no pointercancel)
- [ ] **A11Y-03** (medium, S): Progress, status and error messages are never announced, and stage state is shown only visually
- [ ] **A11Y-04** (medium, S): Focus and scroll position are not managed between steps, and the results view has no h1 or h2
- [ ] **A11Y-05** (medium, S): The Manage styles overlay does not behave as a modal: focus is not moved, trapped or returned, and the delete button is invisible when focused
- [ ] **A11Y-06** (medium, S): Several text and UI-state colours fall below WCAG AA contrast (placeholders, faint text, error text, focus ring, switch, checkbox)
- [ ] **BUG-07** (low, S): Transparent images turn black, and truncated images are silently grey-filled
- [ ] **BUG-08** (low, S): The only ESLint error is a redundant setState-in-effect: the region default is computed at module scope with the server's locale, and locale matching is by substring
- [ ] **UX-09** (low, S): After a generation or refine error, the last status message keeps pulsing as if work were still running
- [ ] **UX-10** (low, M): My Styles gaps: no rename, no per-image removal, a new style doesn't open, and the modal can be closed mid-upload
- [ ] **UX-11** (low, S): Visual and mobile polish: select triggers show raw lowercase values, the header pill wraps at 320px, keep checkboxes look like radios, and reduced motion is ignored
- [ ] **A11Y-07** (low, S): Selection states and field labels are missing for assistive tech (preset chips, keep and refine inputs, refine chips, style cards)

### Phase 4: Performance, platform, maintainability & docs

- [ ] **PERF-01** (medium, S): /api/blob serves immutable blobs as 'private, no-cache' with no validators, and style thumbnails are the full 2048px originals
- [ ] **PERF-02** (medium, S): UploadZone creates a new blob: URL for every thumbnail on every render and never revokes them
- [ ] **PERF-03** (medium, S): Style images are prepared all at once with Promise.all: memory spikes, and one bad file fails the whole selection
- [ ] **PLAT-01** (medium, S): Images travel as base64 JSON on every call: the room photo is re-uploaded for every step, and one-off references or PDFs push requests past Vercel's 4.5 MB body limit after the plan is already billed
- [ ] **PLAT-02** (medium, S): The env checks require static keys, blocking the OIDC auth the README recommends, and misconfiguration only shows up mid-pipeline
- [ ] **PLAT-03** (medium, S): Inputs use a 15px font on phones, so iOS Safari zooms the page on every focus
- [ ] **MAINT-01** (medium, S): No server-side error logging and no AI usage or cost capture, so savings and quality can't be measured
- [ ] **MAINT-02** (medium, M): No tests and no CI, and in Next 16 `next build` no longer lints, so the current lint error ships
- [ ] **MAINT-03** (medium, M): Route handlers duplicate boilerplate, render and refine copy the quality gate, and style resolution exists in 3 divergent versions
- [ ] **DOC-01** (medium, S): The README has drifted from the code: routes, env vars, modules and the image-model API are misdocumented, and nothing warns that the app is unauthenticated
- [ ] **PERF-04** (low, S): heic-convert (libheif wasm) loads at module scope on the render and refine path, for a branch the app never reaches
- [ ] **PERF-05** (low, S): The styles list makes N+1 origin Blob reads and is fetched twice after every change
- [ ] **MAINT-04** (low, S): One experimental model runs every LLM task with no per-task tuning, sampling controls or fallback, through the deprecated generateObject/system API
- [ ] **MAINT-05** (low, S): Dead code: unused exports, UI components, schema, starter assets and redundant declarations
- [ ] **DEP-01** (low, S): Dependency hygiene: unused clsx and tailwind-merge, the shadcn CLI in production deps, an unused preloaded font, and no engines field

## Findings in detail

### Security

<a id="sec-01"></a>
#### SEC-01: No authentication or rate limiting: every paid AI route and every storage or destructive route is publicly callable

**Severity:** 🔴 Critical · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/api.ts:8-26`, `src/lib/env.ts:17-23`, `src/app/api/render/route.ts:31`, `src/app/api/render/route.ts:71-97`, `src/app/api/refine/route.ts:36`, `src/app/api/refine/route.ts:71-97`, `src/app/api/analyze/route.ts:9-11`, `src/app/api/plan/route.ts:27-29`, `src/app/api/shopping-list/route.ts:9-13`, `src/app/api/styles/route.ts:6-38`, `src/app/api/styles/[id]/route.ts:15-52`, `src/app/api/styles/[id]/images/route.ts:33-48`, `src/app/api/blob/route.ts:7-18`, `src/lib/ai/styles.ts:53-58`, `src/lib/ai/styles.ts:84-90`, `src/lib/ai/styles.ts:191-196`, `src/app/layout.tsx:15-19`

**Problem**

The repo has no proxy or middleware file (`git ls-files` shows none), and no handler checks who is calling. The only guards are `checkAiConfig()` and `checkBlobConfig()`, which just test whether an env var is set (`Boolean(process.env.AI_GATEWAY_API_KEY)`).
- POST /api/render defaults `qualityGate = true` (render/route.ts:31). One call runs generateImage, then a critique generateObject, then possibly a second generateImage (71-97).
- Each of those calls gets the SDK default maxRetries of 2 (node_modules/ai/dist/index.js ~2813-2860). generateImage also retries when a result has no image (RetryableNoImageResultError).
- Passing `styleId` makes the server attach every image in that style. GET /api/styles lists every style id publicly.
- POST /api/styles/[id]/images accepts unlimited appends, and each append runs an LLM derivation over all images in the style.
- DELETE /api/styles/[id] removes all images and the manifest (styles.ts:53-58).
- GET /api/styles, GET /api/styles/[id] and /api/blob together serve the owner's private room and style photos to anyone.
- The metadata in layout.tsx has no robots directive.

**Impact**

Anyone who finds the URL can loop /api/render, /api/refine or /api/analyze and bill the owner's AI Gateway with no limit. At list price that is about $0.039 per Gemini 2.5 Flash Image output, and about $0.25 per gpt-image-1 1536x1024 'high' image if IMAGE_MODEL is changed. The same person can:
- use up function concurrency
- fill Blob storage
- delete every saved style (data loss)
- download photos of the owner's home

**Recommendation** (verifier-corrected)

1. Add `src/proxy.ts`, a Basic-auth gate that fails closed. It needs no client changes, because every fetch and <img> goes to a same-origin relative URL.

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
const h = (s: string) => createHash("sha256").update(s).digest();
export function proxy(req: NextRequest) {
  const pass = process.env.OWNER_PASSWORD;
  if (!pass) return process.env.NODE_ENV === "production" ? new NextResponse("Auth not configured", { status: 503 }) : NextResponse.next();
  if (!["GET","HEAD"].includes(req.method) && req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  const [scheme, enc] = (req.headers.get("authorization") ?? "").split(" ");
  const ok = scheme === "Basic" && !!enc && timingSafeEqual(h(Buffer.from(enc, "base64").toString()), h(`${process.env.OWNER_USER ?? "owner"}:${pass}`));
  return ok ? NextResponse.next() : new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Restage", charset="UTF-8"' } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- Do not export `runtime`; the proxy already runs on Node, which provides node:crypto.
- The Sec-Fetch-Site check blocks cross-site POSTs (text/plain JSON forms, multipart style uploads) that would otherwise carry cached Basic credentials.
- If you want a login page instead, use an HttpOnly, Secure, SameSite=Strict HMAC-signed cookie set by a passphrase route. That is more work (effort M).

2. Put the same check in a helper, `requireOwner(request)`, in src/lib/api.ts. Call it at the top of every handler next to checkAiConfig and checkBlobConfig. This is defense in depth, as the Next authentication guide recommends, and guards against a future matcher change leaving routes uncovered.

3. Platform settings, which are backstops rather than the primary fix:
   - Keep AI Gateway on prepaid credits with auto top-up disabled or capped, so the balance is a hard cost ceiling.
   - Turn on Deployment Protection for production if your Vercel plan offers it. It works through a cookie, so same-origin fetches and images keep working.
   - Optionally add a WAF rate-limit rule on /api/(render|refine|analyze|plan|shopping-list) and /api/styles/*/images.

4. Cheap hardening:
   - Validate `[id]` and `styleId` with `z.uuid()` in the styles/[id] routes and in plan, render and refine.
   - Cap `roomImages`, `styleReferences` and uploaded style files at a small N.
   - Add `robots: { index: false, follow: false }` to layout.tsx if you like. It is optional and nearly redundant once the gate is in place.
   - The auth gate also closes the unauthenticated route to the arbitrary `fetch(url)` in src/lib/ai/images.ts:55. Still restrict that function to Blob URLs, as a separate fix.

None of these changes touch prompts, models or render settings, so AI output quality is unchanged.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, critical**

The core finding holds: there is no auth or rate limiting anywhere, so anyone who has the public URL can run up the owner's AI bill without limit and can delete saved data. That meets the rubric's "critical" bar. A few details in the finding are overstated, and one part of the recommendation needs a plan-dependent caveat.

What I checked and found:
- **No gate exists.** `git ls-files` lists no `proxy.ts`, `middleware.ts` or `vercel.json`. A search of `src/` for auth, password, cookie or rate-limit code finds nothing.
- **The only guards test env vars.** `checkAiConfig` and `checkBlobConfig` (`src/lib/api.ts:8-26`) only check whether `process.env.AI_GATEWAY_API_KEY` and `BLOB_READ_WRITE_TOKEN` are set (`src/lib/env.ts:17-23`). Every cited handler starts with just these checks.
- **Render cost per call.** `/api/render` defaults `qualityGate = true` (`render/route.ts:31`). One POST runs `renderRoom` (generateImage), then `critiqueRender` (a vision generateObject call), then possibly a second `renderRoom` (lines 71-97). `/api/refine` does the same (lines 36, 71-97).
- **Retry defaults.** I confirmed these in `node_modules/ai/dist/index.js`: `prepareRetries` uses `defaultMaxRetries = 2` (lines 2830-2860), and `generateImage` also retries on `RetryableNoImageResultError` (lines 12649-12716). This is only a small multiplier. Retries fire on retryable errors (429/5xx) or when a call returns no image, and failed calls are mostly not billed. The main cost driver is simply that requests are unlimited.
- **Style data is publicly listed.** `GET /api/styles` returns every style's id, name and thumbnail (`styles.ts:156-178`). Sending a `styleId` to `/api/render` or `/api/refine` makes `resolveStyle` download every image in that style and send them all to the image model (`styles.ts:182-199`).
- **Unlimited appends, each with a full re-analysis.** `addImages` adds images with no cap. After every append, `regenerateIfStale` downloads all of the style's images and runs `analyzeStyleImages` over them (`styles.ts:94-143`, `64-92`). `GET /api/styles/[id]` can also trigger that LLM call (`[id]/route.ts:26-29`).
- **Deletion.** `DELETE /api/styles/[id]` calls `deleteStyle`, which deletes all the style's images and its manifest (`styles.ts:53-58`). Combined with the public id listing, anyone can wipe every saved style.
- **Robots.** `layout.tsx:15-19` metadata has no robots entry. That is true but only a minor point.
- **Framework advice checks out against the bundled Next docs** (`proxy.md` lines 23, 58, 75, 253-255 and `authentication.md` lines 1121, 1503):
  - `proxy.ts` goes in `src/`, at the same level as `app/`.
  - It exports `proxy` or a default function.
  - It runs on Node, and exporting `runtime` from it throws.
  - A matcher is needed to exclude static assets.
  - "Proxy ... should not be your only line of defense."
  - Route Handlers should be treated as public-facing API endpoints.

Overstatements to correct:
1. **"Download photos of the owner's home" / "private room ... photos" is wrong as written.**
   - Room photos are never saved. `uploadUpload` (`blob.ts:124`) has no callers, and room images only arrive as data URLs in request bodies.
   - Renders are saved at `renders/${Date.now()}-${randomUUID()}` (`blob.ts:120`), but no endpoint lists that prefix. `list()` is only called with `styles/` and `uploads/style/{id}/`, so renders cannot be enumerated.
   - What is actually exposed: every style's name and derived profile, plus every style inspiration image, via `/api/styles`, then `/api/styles/[id]`, then `/api/blob`. Those images may be of the owner's home if he uploaded such photos as inspiration.
2. **The retry amplification is minor**, as explained above.
3. **Deployment Protection depends on the Vercel plan.** From my knowledge of Vercel (I could not re-check it: `vercel.com` is blocked from this sandbox):
   - On Hobby, the default Standard Protection does not cover the production domain.
   - Protecting production needs a Pro plan or higher.
   - Password Protection needs Enterprise or the Advanced Deployment Protection add-on.
   
   So for a personal Hobby deployment, the in-app gate is the main control, not an optional extra.

Missing locations worth adding:
- `src/lib/ai/styles.ts:94-143` and `182-199`
- `src/app/api/styles/[id]/route.ts:15-29`
- `src/app/api/styles/route.ts:20-31`

Related but separate issue that makes this worse: `urlToImageInput` calls `fetch(url)` on any non-Blob URL (`src/lib/ai/images.ts:55`). Unauthenticated callers can reach it through `/api/refine` `currentRenderUrl` and `/api/shopping-list` `renderUrl`, which makes it a server-side request forgery (SSRF) hole.

**Severity/fix lens: partially-confirmed, critical**

I read every route handler, src/lib/api.ts, env.ts, blob.ts, the ai/* modules on the render, critique, styles and images paths, and client-api.ts. I also read the AI SDK retry code and the Next 16 proxy, authentication and proxyClientMaxBodySize docs.

What holds up:
- No handler has any caller check. `git ls-files` shows no proxy.ts or middleware.ts, and next.config.ts is empty. The only guards test whether an env var is set.
- /api/render and /api/refine default qualityGate to true. The worst case per request is two generateImage calls plus one vision generateObject.
- DELETE /api/styles/[id] wipes a style's images and its manifest.
- Style ids can be listed through GET /api/styles.
- POST /api/styles/[id]/images has no cap on file count. Each append re-derives the profile over every image in the style.
- The metadata in layout.tsx has no robots field.

Under the rubric (exploitable now on a public URL, unbounded cost, data loss), critical is the right severity.

What is overstated or wrong:
1. Privacy. Room photos are never saved: `uploadUpload` is defined but nothing calls it, and room images arrive as data URLs on each request. Renders are stored as `renders/${Date.now()}-${uuid}` and no endpoint lists them, so nobody can enumerate them. The only images an outsider can list and download are style inspiration images (GET /api/styles gives the ids, /api/styles/[id] gives the URLs, /api/blob serves them). "Download photos of the owner's home" only applies if the owner put home photos into a style.
2. Retries. The default maxRetries of 2 is real. But the SDK retries only on errors marked isRetryable, or when a call returns an empty image set. A successful call is not billed three times.
3. Proxy export. The docs say the file "must export a single function, either as a default export or named `proxy`", so a default export also works. The src/ location, the Node default runtime and the rule against exporting `runtime` are all correct.
4. The "don't rely on proxy alone" warning is in the authentication guide ("should not be your only line of defense"). The proxy.md note about it is specifically about Server Functions.
5. Protecting production with Vercel Deployment Protection may depend on the Vercel plan. I could not check this (vercel.com is blocked from this environment). An app-level gate works on any plan, so it should be the primary fix.
6. Once everything is gated, the robots meta has almost no value, because gated pages return 401 and crawlers can't index them.

The smallest effective fix is a Basic-auth proxy. It needs no client changes: every fetch in client-api.ts and styles-client.ts, and every <img src=/api/blob…>, is a same-origin relative URL, so the browser re-sends cached credentials automatically.

The CSRF concern the finding raises for Basic auth is valid. A text/plain form or a multipart form can POST cross-site without a preflight, and the handlers call request.json() without checking Content-Type.

One side effect to know about: adding a proxy makes Next buffer request bodies up to 10MB by default. On Vercel this doesn't matter, because the 4.5MB request limit is lower and the client already caps images at 2048px and 4MB.

None of this changes prompts, models or outputs, so AI quality is unaffected.

</details>

<sub>Merged from: api-cost:All AI endpoints are unauthenticated, so anyone can spend the owner's Gateway budget without limit · performance:AI routes are unauthenticated and unthrottled: anyone can run up image-generation spend · platform:No authentication anywhere: every paid AI route and every destructive or storage route is publicly callable, and there is no src/proxy.ts gate</sub>

<a id="sec-02"></a>
#### SEC-02: SSRF and unbounded download: urlToImageInput fetches any client-supplied URL on /api/refine and /api/shopping-list

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/ai/images.ts:46-63`, `src/lib/blob.ts:27-41`, `src/app/api/refine/route.ts:45-53`, `src/app/api/shopping-list/route.ts:17-30`, `src/lib/ai/render.ts:108`, `src/lib/blob.ts:115-122`, `src/components/restage-app.tsx:195`, `src/components/restage-app.tsx:239`, `src/components/restage-app.tsx:252`

**Problem**

`urlToImageInput` handles only /api/blob and *.blob.vercel-storage.com URLs specially. For any other URL, extractBlobPathname returns null and the code falls through to `const response = await fetch(url)` and then `await response.arrayBuffer()`. There is no host allowlist, protocol check, timeout or size cap. The error text leaks upstream status (`Failed to fetch image: ${response.statusText}`).

`currentRenderUrl` (refine/route.ts:53) and `renderUrl` (shopping-list/route.ts:28-30) come straight from the unauthenticated JSON body. Running extractBlobPathname in scratch on `http://169.254.169.254/latest/meta-data/` returns null, so that URL reaches `fetch`. The app itself only ever sends `/api/blob?pathname=renders/...` URLs (restage-app.tsx:195, 239, 252), so this branch has no legitimate caller.

**Impact**

An attacker can:
- make the function send GET requests from Vercel IPs to internal or arbitrary hosts (blind SSRF)
- stream multi-GB responses into function memory, causing OOM and billed duration
- feed arbitrary content into the owner's paid vision and image models; the shopping-list output can then describe the fetched content

**Recommendation** (verifier-corrected)

1. Remove the generic fetch branch in src/lib/ai/images.ts. Only accept a private-blob reference under renders/, since that is the only thing these two parameters ever legitimately carry:

```ts
const RENDER_PATHNAME = /^renders\/[A-Za-z0-9._-]+$/; // no slashes, no traversal
export async function renderUrlToImageInput(url: string): Promise<ImageInput> {
  const pathname = extractBlobPathname(url)?.replace(/^\//, "");
  if (!pathname || !isAllowedBlobPathname(pathname) || !RENDER_PATHNAME.test(pathname)) {
    throw new Error("Invalid render reference");
  }
  return downloadPrivateBlob(pathname);
}
```

2. Use it at refine/route.ts:53 and shopping-list/route.ts:30. Validate the inputs with zod, e.g. `z.string().max(512)`, before calling it, and return 400 on failure instead of 500.

3. Delete the unused `renderDataUrl` input in shopping-list/route.ts:17, 24 and 28-29. No client sends it, and it lets anyone run the vision model on arbitrary images.

4. Optionally drop the `*.blob.vercel-storage.com` branch in extractBlobPathname, which nothing produces. That leaves /api/blob?pathname=... as the only accepted form.

None of this changes behaviour for real users. Every legitimate value already takes the downloadPrivateBlob path, so AI output quality and UX are unaffected.

A cleaner longer-term contract is to have render and refine return the pathname and have the client send `renderPathname` back. That is optional; the change above is the minimal effective fix.

This does not replace adding an auth gate (e.g. a shared-secret or cookie check in middleware/proxy) for the no-auth issue, which is the real driver of cost exposure.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, high**

I traced both entry points end to end and ran the exact logic in a scratch script. The core defect is real. Some of the impact is overstated, and some is missing.

Execution path:
- refine/route.ts:28-53 destructures `currentRenderUrl` from the unauthenticated `request.json()`. The only checks are truthiness (line 45) and the brief schema. It then calls `urlToImageInput(currentRenderUrl)` before any streaming starts.
- shopping-list/route.ts:17-30 does the same with `renderUrl` whenever `renderDataUrl` is absent.
- `urlToImageInput` (images.ts:46-63) only special-cases what `extractBlobPathname` (blob.ts:27-41) recognises: a path of exactly `/api/blob` on any host, or a host ending in `.blob.vercel-storage.com`. Everything else goes to a bare `fetch(url)` followed by `response.arrayBuffer()`. There is no allowlist, protocol check, timeout, size cap or redirect policy.
- There is no middleware/proxy.ts and no auth, so both routes are publicly reachable.
- The legitimate client only ever sends `imageUrl` values produced by `uploadRender` → `blobDisplayUrl` (`/api/blob?pathname=renders/...`). The call sites are restage-app.tsx:195, 239 and 252, and there is no other source of `imageUrl`. So the generic fetch branch has no legitimate caller.

Scratch reproduction (the functions copied verbatim, run with Node's undici fetch):
- `extractBlobPathname` returns null for `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:9001/...` and `https://x.blob.vercel-storage.com.evil.com/a`, so all of them reach `fetch`.
- A 404 with reason phrase "Internal-Secret-Reason" surfaced as `Failed to fetch image: Internal-Secret-Reason`.
- A closed port surfaced as `fetch failed`. Together these give a reachability/status oracle, which is returned to the caller through `apiError(message)` at refine:110-113 and shopping-list:50-53.
- A 302 redirect was followed automatically to a 200 MB `text/plain` body, and all of it was buffered: `{size: 209715200}`.
- `data:` URLs are also fetched (harmless). `file:` fails.

Points that are wrong or overstated:
1. The 169.254.169.254 example is illustrative only. Vercel Functions run on AWS Lambda-style infrastructure where instance-metadata credential theft is not the realistic payoff. The practical impact is:
   - an open GET proxy from Vercel egress IPs, with a status/reason/timing oracle for port and host probing
   - automatic redirect following
   - unbounded buffering (see 2)
2. The memory/cost amplification is real and actually understated. Vercel caps the request body at about 4.5 MB (the README at line 98 relies on that limit), but this path downloads an unbounded body. On refine, those bytes then go through sharp with `{ unlimited: true }` (normalize-image.ts:17). A slow-drip server can hold the invocation until `maxDuration` 300.
3. The claim "feed arbitrary content into the owner's paid models" is not something this SSRF adds. With no auth, anyone can already send arbitrary images via `renderDataUrl` (shopping-list:28-29, which the client never sends) or the `roomImage` data URL on refine. What the SSRF adds is limited to server-side reads of non-public images. In shopping-list, non-image bytes are passed as a file part with the upstream Content-Type: in ai@7 `convertPartToLanguageModelPart`, `detectMediaType` returns null for non-images, so the header's mediaType is kept. On refine, non-image bytes fail in sharp before any paid call.

Severity: high rather than critical. It is exploitable now on the public URL, but each request is bounded by maxDuration and function memory, and the unbounded AI-cost issue is the separate no-auth finding.

**Severity/fix lens: partially-confirmed, medium**

The mechanism is real. I read images.ts, blob.ts, the refine and shopping-list routes, render.ts, shopping.ts and the client call sites, and ran extractBlobPathname plus Node 22 fetch in a scratch script.

What is confirmed:
- extractBlobPathname returns null for any URL that is neither /api/blob nor *.blob.vercel-storage.com. Examples: http://169.254.169.254/..., http://127.0.0.1:9001/x, https://x.blob.vercel-storage.com.evil.com/a.
- For those URLs, urlToImageInput calls a bare fetch(url) with no protocol or host check, no timeout and no size cap. Redirects are followed by default, and response.arrayBuffer() buffers the whole body in memory.
- Both routes take the URL straight from the unauthenticated JSON body, before any AI call.
- No legitimate caller needs this branch. renderRoom always stores the result through uploadRender, which returns blobDisplayUrl("renders/<ts>-<uuid>.<ext>"). The client only ever sends that value back (restage-app.tsx:195, 239, 252).
- The endpoints leak an oracle. A refused or unresolvable host gives the error "fetch failed" (checked in scratch). A non-2xx response gives "Failed to fetch image: <statusText>". A 2xx response moves on to AI or processing errors. All of these reach the client through apiError(message) or the SSE error event. Missing timeouts add a timing oracle on top.

What is overstated:
1. The 169.254.169.254 example is not a meaningful target on Vercel. Vercel functions run on AWS Lambda, which has no instance metadata service; credentials live in env vars, which this fetch cannot read. There is also no private network unless Secure Compute is enabled. So in practice this is a blind or semi-blind GET proxy from Vercel IPs with a reachability and status oracle, not a credential-theft path.
2. "Feed arbitrary content into paid models" does not depend on the SSRF. Anyone can already POST shopping-list with `renderDataUrl` (an arbitrary data URL, route.ts:28-29) or refine with an arbitrary `roomImage`. The missing auth is the root cause of that.
3. "Unbounded" cost is actually bounded. Each request is capped by maxDuration 300 (route.ts:7 and :19) and the function's memory limit; a huge body crashes the instance with OOM rather than billing forever. That cost is small next to what any anonymous caller can already spend by calling /api/render directly (gpt-image generation).

On severity: the SSRF is real, trivial to exploit on the public URL and has no legitimate use, so it should be fixed. But on Vercel its impact is limited to an outbound GET proxy with an oracle and a per-request memory/duration DoS. It does not add meaningful cost or data exposure beyond the separate no-auth finding. That makes it medium, not high or critical.

On the fix: the recommended change (drop the fetch fallback, allow only blob pathnames) is correct and minimal. It does not affect output quality or UX, because every legitimate value takes the downloadPrivateBlob branch unchanged. It can be tightened: the only legitimate prefix for these two parameters is renders/, and the unused `renderDataUrl` input can be removed at the same time.

</details>

<sub>Merged from: api-cost:Server fetches any URL passed in renderUrl or currentRenderUrl (SSRF, unbounded body) · performance:SSRF: urlToImageInput fetches any URL the client supplies · ux:SSRF: refine and shopping-list fetch any client-supplied URL on the server · maintainability:Unused generic-URL branch in urlToImageInput lets anyone make the server fetch arbitrary URLs (SSRF) via /api/refine and /api/shopping-list · platform:SSRF / unbounded download: urlToImageInput fetches any client-supplied URL</sub>

<a id="sec-03"></a>
#### SEC-03: sharp runs with `unlimited: true` and no resize on unauthenticated input, so a small crafted image can take GBs of memory

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/ai/normalize-image.ts:16-23`, `src/lib/ai/normalize-image.ts:45-73`, `src/lib/ai/render.ts:41-63`, `src/app/api/render/route.ts:57-59`, `src/app/api/refine/route.ts:53`, `src/app/api/refine/route.ts:59-62`, `src/lib/ai/images.ts:57-73`, `src/app/api/styles/[id]/images/route.ts:19-31`, `src/app/api/styles/[id]/images/route.ts:53-66`, `src/lib/ai/styles.ts:256-273`

**Problem**

`encodeJpeg` runs `sharp(toBuffer(data), { failOn: "none", unlimited: true }).rotate().removeAlpha().jpeg({ quality: 85 })` on every file part of every renderRoom call, with no resize. sharp's own docs (node_modules/sharp/dist/constructor.cjs:166) say `unlimited` removes 'safety features that help prevent memory exhaustion (JPEG, PNG, SVG, HEIF)'. Any decodable format is accepted, SVG included.

In a scratch test, a 0.78 MB PNG of 16000x16000 (1.03 MB as base64) took 4.5 s and raised RSS from 66 MB to about 1.56 GB in this pipeline.

Normal inputs (the client's 2048px q0.85 JPEGs) are decoded and re-encoded at q85, about 55 ms each, with generation loss. They are then turned into base64 data URLs, which the AI SDK decodes again (normalizePrompt) before the gateway re-encodes them. All of this repeats for the re-render.

**Impact**

An unauthenticated POST /api/render carrying 3 such images (about 3 MB of body) can reach roughly 4.5 GB and more than 13 s of CPU before any AI call. That can OOM the instance, and on Fluid compute take down concurrent requests sharing it. Normal renders waste CPU and lose JPEG quality twice.

**Recommendation** (verifier-corrected)

1. Harden `encodeJpeg` and reject unknown formats before sharp runs (normalize-image.ts):
```ts
const MAX_INPUT_PIXELS = 4096 * 4096; // browser sends ≤2048px; model renders are ≤~1536px
async function encodeJpeg(data: Uint8Array) {
  const out = await sharp(toBuffer(data), { failOn: "truncated", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .removeAlpha().jpeg({ quality: 85 }).toBuffer();
  return { data: new Uint8Array(out), mediaType: "image/jpeg" };
}
// in normalizeImageForGeneration, before any decode:
if (!kind || !PASSTHROUGH_KINDS.has(kind)) throw new Error("Upload a JPEG, PNG or WebP photo.");
```
   - Drop `unlimited`.
   - Drop the HEIC and heic-convert branch. The client never sends HEIC, and sharp's prebuilt binary cannot decode it anyway. Dropping it also removes the wasm decode path, which has no dimension check.
   - Keep the passthrough fallback only for errors other than the pixel limit.

2. Validate when style images are uploaded (styles/[id]/images/route.ts). Sniff the bytes and accept only jpeg/png/webp. Also run `sharp(data, { limitInputPixels }).metadata()`, a header-only read of about 0.5 ms, so poisoned blobs never get stored. Ideally store the normalized JPEG instead of the raw bytes.

3. Bound the work per request:
   - Cap `styleReferences` at about 4-6 entries in render/refine and cap the images `resolveStyle` returns. Also check the data URL length before decoding.
   - Put a size cap on the refine `currentRenderUrl` fetch, or better, allow only blob pathnames there (this overlaps the SSRF issue).

4. Cheap cleanups:
   - Normalize the room and style images once in the route and pass them into both `renderRoom` calls, for example by memoizing on a WeakMap keyed by the Uint8Array.
   - Pass `Uint8Array` to `generateImage({ prompt: { images } })` instead of data URLs. The AI SDK accepts bytes and detects the media type itself.

Drop or de-prioritize these parts of the original recommendation:
- Capping style references at 1024px: the cost saving is negligible and there is a quality risk.
- Skipping the re-encode: the quality gain is only about 58 dB PSNR, which is already invisible, and the re-encode normalizes colour space and bit depth.
- Applying sharp to the vision-LLM paths: they never touch sharp, and their inputs are already normalized in the browser.

Adding authentication to the API routes, tracked separately, removes almost all of the external attack paths.

<details><summary>Verification notes</summary>

**Combined lens: partially-confirmed, medium**

The memory DoS is real, and it is cheaper to trigger than the finding says. But the finding blames the wrong thing, and several of its recommendations are either unjustified or outside this issue.

1. Wrong root cause. `unlimited` and the pixel limit are separate options in sharp. The `unlimited` flag only turns on loader-specific guards for JPEG, PNG, SVG, TIFF and HEIF (node_modules/sharp/src/common.cc:408-426). The pixel limit is a different option and still applies when `unlimited: true` is set (dist/input.cjs:142-152, src/common.cc:613-616). Its default is 0x3FFF² = 268,402,689 pixels, and 16000×16000 = 256M is under that. I ran the pipeline from normalize-image.ts:17-21 with and without `unlimited` and got the same peak memory: about 1.63 GB for the 0.78 MB 16000² PNG and about 1.9 GB for a 16000² SVG. Removing `unlimited` alone fixes nothing here.

2. It is easier to exploit than described. `sniffImageKind` returns null for SVG, TIFF and other unknown formats, and line 63-64 still calls `encodeJpeg`. sharp then detects SVG on its own (librsvg is bundled in the prebuilt binary). A 123-byte SVG sent as a base64 data URL gives about 1.9 GB. Three of them in `styleReferences` (an array with no length cap, run in parallel with Promise.all at render.ts:41-52) peaked at 5.4 GB in about 9 s on a 4-core machine. That request body is under 1 KB, so the "about 3 MB of body" in the finding is irrelevant. No AI call happens before this point. A default 2 GB Vercel function would be killed by the OOM. With Fluid compute, requests sharing that instance die too, including an owner render that may already have paid for image generation.

3. Attack paths the finding missed:
   - /api/refine passes `currentRenderUrl` to `urlToImageInput` (images.ts:57-73). For a non-blob URL that does `fetch(url)` and reads the whole body with no size cap, then sends it to sharp. This skips any request-body limit.
   - Stored poison: POST /api/styles/[id]/images (route.ts:19-31, 53-64) accepts any bytes whose declared type starts with `image/` and stores them. `resolveStyle` (styles.ts:256-273) then runs every stored image through sharp on each render or refine that uses that `styleId`. Style IDs can be listed publicly via GET /api/styles.
   - The HEIC branch: sharp's prebuilt heif input only supports AVIF (`sharp.format.heif.input.fileSuffix` is ['.avif']). So line 49 always fails for real HEIC and falls back to heic-convert, and this code does no dimension check on that path.

4. Efficiency claims are accurate but small:
   - A re-encode takes about 45-50 ms per 2048×1536 JPEG. The generation loss measured PSNR ≈ 58 dB against the decoded input, which is visually lossless, so it is not a real quality problem.
   - The data URL round trip is real. `imageInputToDataUrl` encodes to base64, the AI SDK decodes it again (ai/dist/index.js:12863-12890, inside the retry loop), and the gateway base64-encodes it once more (@ai-sdk/gateway/dist/index.js:1808-1812). This is minor.
   - The re-render does normalize the room and style images a second time.

5. Recommendation review:
   - The fixes that matter are a pixel limit plus a resize. I measured resize alone bringing the 16000² PNG down to 189 MB and the SVG to 106 MB. With a 4096² limit plus resize, 6 max-size inputs in parallel peaked at 239 MB in 188 ms.
   - Accepting only jpeg/png/webp by sniffed kind is safe. The browser client always sends JPEGs of 2048px or less (prepare-image.ts:51-106, client-api.ts:141-143), and the styles route already rejects HEIC by name and MIME type.
   - Capping style references at 1024px should be dropped. The input-token savings are negligible next to the cost of generating the output image. For gpt-image the token count is often the same once the image is downscaled to 768px on its short side. It also risks losing material and texture cues.
   - Skipping the re-encode is optional. The quality gain is negligible, and the re-encode is what normalizes CMYK, 16-bit and ICC inputs.
   - Using the same helper on the vision-LLM paths is outside this issue. Those paths never call sharp, and real inputs are already normalized in the browser.

Severity: medium is right for this app. The DoS is trivial, remote, and can be made persistent through style images. But the impact is availability plus billed function time. It is not unbounded AI spend, and the same missing auth already allows direct AI cost abuse, which is the bigger risk. Adding auth also closes most of these paths.

</details>

<sub>Merged from: performance:sharp re-encodes every image on every render call with `unlimited: true`, so a small input can use GBs of memory · maintainability:Server image normalization disables sharp's memory guards and never downscales · platform:normalize-image: sharp runs with safety limits removed on unauthenticated input, and HEIC wasm is instantiated at import for a path the client never reaches</sub>

<a id="sec-04"></a>
#### SEC-04: Style uploads trust the client-declared MIME type and /api/blob echoes it back, enabling stored SVG XSS on the app origin

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** ✅ Confirmed · **Auditor confidence:** high

**Locations:** `src/app/api/styles/[id]/images/route.ts:19-31`, `src/app/api/styles/[id]/images/route.ts:53-64`, `src/lib/ai/styles.ts:106-120`, `src/lib/blob.ts:134-143`, `src/app/api/blob/route.ts:23-29`, `src/lib/media-type.ts:27`, `src/lib/prepare-image.ts:88-106`

**Problem**

The upload route only checks `type && !type.startsWith("image/")` against the multipart `file.type` the client declares. `image/svg+xml` passes and is stored with that contentType via fileToImageInput → uploadStyleImage (the extension becomes 'svg+xml'). The file is stored before the LLM derivation even runs.

/api/blob responds with `"Content-Type": result.blob.contentType`. Its only other header is X-Content-Type-Options: nosniff, which does not stop a declared SVG from rendering. There is no CSP, sandbox or Content-Disposition. Opening /api/blob?pathname=uploads/style/<id>/….svg+xml therefore runs the SVG's script on the app origin. The existing `sniffImageKind` helper is not used at this boundary.

**Impact**

This is persistent XSS on the app origin today, and the script can drive every same-origin API. Once auth (cookie or Basic) is added, it also becomes session-riding.

**Recommendation** (verifier-corrected)

Fix both ends. The serving-side fix is required, not optional, because it also neutralises any SVG that was stored before the fix.

**1. Upload: `src/app/api/styles/[id]/images/route.ts`**

Validate the actual bytes in the pre-check loop at lines 53-64. It already returns 400. By contrast, `fileToImageInput` throws inside the `try` block, and `apiError` defaults that to a 500. Keep the sniffed type and ignore `file.type`:
```ts
const images: ImageInput[] = [];
for (const file of files) {
  if (file.size > 5 * 1024 * 1024) return apiError(`"${file.name}" is too large.`, 413); // the client caps output at 4 MB
  const data = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImageKind(data);
  if (kind !== "jpeg" && kind !== "png" && kind !== "webp") {
    return apiError(`"${file.name}" must be a JPEG, PNG or WebP image.`, 400);
  }
  images.push({ data, mediaType: mediaTypeForImageKind(kind) });
}
```
Then delete the duplicated checks and `fileToImageInput`. This changes nothing for real users or output quality: the browser client always sends JPEG (`prepare-image.ts`). Do not re-encode with sharp by default. It adds a second lossy JPEG pass, and the existing `encodeJpeg` uses `unlimited: true`, which should not be applied to untrusted input.

**2. Serving: `src/app/api/blob/route.ts:23-29`**

Never echo an arbitrary stored type, and send the response in a sandbox:
```ts
const SAFE = new Set(["image/jpeg", "image/png", "image/webp"]);
const type = (result.blob.contentType ?? "").split(";")[0].trim().toLowerCase();
const safe = SAFE.has(type);
return new Response(result.stream, { headers: {
  "Content-Type": safe ? type : "application/octet-stream",
  ...(safe ? {} : { "Content-Disposition": "attachment" }),
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cache-Control": "private, no-cache",
}});
```
This does not affect the `<img>` embeds in `my-styles-manager.tsx` or `style-picker.tsx`. Renders are stored with the model's `image/*` type (`render.ts:101-108`) and will still be served normally. Leave out the suggested `Content-Disposition: inline`, because it is the default and does nothing.

**3. Optional hardening in `src/lib/blob.ts`**

Have `uploadStyleImage` accept only the sniffed kinds, and derive the extension from a fixed map (jpeg→jpg, png, webp) instead of `contentType.split("/")[1]`.

<details><summary>Verification notes</summary>

**Combined lens: confirmed, medium**

I followed the path from start to finish and ran the risky steps in scratch scripts.

1. The upload trusts the type the client declares. In a scratch script I parsed a crafted multipart body with Node's `Request.formData()`, the same undici path a Next route handler uses. A part sent with `Content-Type: image/svg+xml` and filename `a.jpg` comes back as `File.type === "image/svg+xml"`. It passes both checks, `type && !type.startsWith("image/")` at `src/app/api/styles/[id]/images/route.ts:26` and `:61`. `fileToImageInput` then keeps that type as `mediaType` (`:30`), and the file extension becomes `svg+xml` (`blob.ts:139`).

2. The file is stored before any AI step runs. `addImages` (`styles.ts:106-120`) calls `uploadStyleImage`, then `putRaw`, which passes `contentType` to `put()`. The SDK sends it as `x-content-type`. The manifest is saved next. `regenerateIfStale` runs only after that, and its errors are caught and turned into a warning (`styles.ts:130-141`), so the SVG stays.

3. `/api/blob` echoes the stored type. In `@vercel/blob` 2.8.0, `get()` sets `blob.contentType` from the storage response's own `content-type` header (`node_modules/@vercel/blob/dist/index.js:201`). The route copies it into its response (`src/app/api/blob/route.ts:25`) and sends only `nosniff` and `Cache-Control` with it. Any `Content-Disposition` the store might add is dropped. `nosniff` does not stop a declared SVG document from running its script.

4. Nothing else adds protection. There is no `middleware`/`proxy` file, no `vercel.json`, and `next.config.ts` is empty, so there is no CSP. `isAllowedBlobPathname` accepts `uploads/style/...`.

5. Anyone can reach it without auth. They can create a style (POST `/api/styles`) or list existing ones (GET `/api/styles`), then upload with curl.

6. `sniffImageKind` / `mediaTypeForImageKind` exist in `media-type.ts:27` but are only used in `normalize-image.ts`. They are never used at the upload boundary.

Where the severity sits, and small corrections:
- **Impact today is limited.** The app has no cookies, no `localStorage`/`sessionStorage`, and every API is already open to anyone. So "the script can drive every same-origin API" gives an attacker nothing they don't already have. The real harms are:
  - attacker-controlled script and phishing content served from the owner's trusted origin;
  - a latent auth bypass (session-riding) as soon as auth is added, which is the obvious fix for the open-API problem;
  - persistence: any SVG uploaded before a fix stays exploitable unless the serving side is also fixed.
- **The owner has to open the link.** The app only shows these URLs in `<img>` tags (`my-styles-manager.tsx:400,468`, `style-picker.tsx:119`), where SVG scripts don't run. There is no in-app link that opens them as a document. The owner has to follow a crafted link or use "open image in new tab". That fits medium, not high.
- **Legitimate uploads are always JPEG.** `prepare-image.ts:88-106` re-encodes every file with `canvas.toBlob('image/jpeg')` and uploads it as `image/jpeg`. A server-side sniff allowlist therefore costs no UX and no quality.
- **Recommendation corrections.** `Content-Disposition: inline` is the default and does nothing, so drop it. On the sharp alternative: sharp does rasterize an SVG containing `<script>` into a clean JPEG (verified: the output starts `ff d8 ff`). But it would add a second lossy JPEG pass on top of the browser's, and the existing `encodeJpeg` uses `unlimited: true`, which is wrong for untrusted input. Sniffing is the better fix.
- **One thing I could not check:** I had no network access to see whether Vercel Blob storage ever rewrites an SVG's `content-type`. The SDK passes the declared type through on write and trusts the store's header on read. Even if the store sent `Content-Disposition: attachment`, the proxy drops it.

</details>

<sub>Merged from: platform:/api/blob echoes attacker-chosen content types (stored SVG XSS on the app origin), and its prefix allowlist can be bypassed with %2e%2e · maintainability:Request validation is inconsistent: zod in 2 routes, raw destructuring and casts elsewhere; upload MIME type is trusted and manifests are never validated</sub>

<a id="sec-05"></a>
#### SEC-05: The /api/blob prefix allowlist can be bypassed with URL-encoded dot segments

**Severity:** ⚪ Low (auditor said medium; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/blob.ts:15-21`, `src/lib/blob.ts:7-13`, `src/lib/blob.ts:87`, `src/lib/blob.ts:155`, `src/app/api/blob/route.ts:11-18`, `src/lib/ai/images.ts:46-53`, `src/app/api/styles/[id]/route.ts:58-59`, `node_modules/@vercel/blob/dist/chunk-YYMLUMXS.js:338-340`, `node_modules/@vercel/blob/dist/index.js:136-151`

**Problem**

`isAllowedBlobPathname` rejects only a literal '..' and then checks for a 'renders/' or 'uploads/' prefix. @vercel/blob's get() builds the URL by string interpolation (`https://${storeId}.${access}.blob.vercel-storage.com/${pathname}`), and WHATWG URL parsing treats `%2e%2e` and `.%2E` as dot segments.

A scratch test showed that `?pathname=renders%2F%252e%252e%2Fstyles%2Fabc%2Fstyle.json` decodes to 'renders/%2e%2e/styles/abc/style.json', passes the allowlist, and fetches `/styles/abc/style.json`. urlToImageInput relies on the same check.

**Impact**

Anyone can read any private blob in the store through the proxy, not just renders/ and uploads/. Today that mostly means style manifests, which the unauthenticated /api/styles/[id] exposes anyway. It also covers any other data if the token's store is shared. The allowlist that the proxy and urlToImageInput rely on is therefore ineffective, and stays exploitable for anyone who gets past future auth.

**Recommendation** (verifier-corrected)

Put one strict pathname guard in src/lib/blob.ts. Enforce it inside every get wrapper (getJsonBlob, downloadPrivateBlob), in the /api/blob route and in urlToImageInput. Do not rely on a single prefix regex. Sketch:

```ts
const SEGMENT = /^[A-Za-z0-9._+-]+$/; // '+' keeps existing ".svg+xml" blobs working
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function isSafeBlobPath(p: string): boolean {
  if (!p || p.length > 256 || /[%\\?#\s]/.test(p)) return false;      // no encoding, backslash, query, fragment
  const segs = p.split("/");
  return segs.every((s) => s !== "" && s !== "." && s !== ".." && SEGMENT.test(s));
}
export function isAllowedBlobPathname(pathname: string): boolean {
  const n = pathname.replace(/^\//, "");
  return isSafeBlobPath(n) && ALLOWED_PREFIXES.some((prefix) => n.startsWith(prefix));
}
export function assertStyleId(id: string) { if (!UUID.test(id)) throw new Error("Invalid style id"); }
```

- Call `assertStyleId` in styleManifestPath and styleImagePrefix, or in the three styles/[id] routes, and return a 400 for bad ids.
- Call `isSafeBlobPath` at the top of getJsonBlob and downloadPrivateBlob, so every server-side get() is covered.
- If you want an extra check that needs no storeId, add `new URL(n, "https://x.invalid/").pathname === "/" + n`.
- Don't use the proposed filename regex. It hides existing svg+xml style images and still accepts `renders/..`.
- This change doesn't affect AI quality or normal UX, because every pathname the app itself generates passes.
- Priority is low. The real exposure comes from other issues: no auth at all, the arbitrary `fetch(url)` SSRF fallback in urlToImageInput (images.ts:55), and /api/blob returning stored image/svg+xml as-is. Fix those first. Normalizing style uploads to jpeg/png/webp would also remove the '+' case.

<details><summary>Verification notes</summary>

**Combined lens: partially-confirmed, low**

The bypass is real. I checked it against the installed @vercel/blob 2.8.0 code, not only against URL parsing in general.

What I checked:
- `isAllowedBlobPathname` (src/lib/blob.ts:15-21) only rejects a literal ".." and then checks the prefix.
- The route (src/app/api/blob/route.ts:11-18) decodes the query once with `searchParams.get`, so `%252e%252e` arrives as `%2e%2e`.
- @vercel/blob get() (node_modules/@vercel/blob/dist/index.js:136-151) builds the URL with `constructBlobUrl` (chunk-YYMLUMXS.js:338-340), which is plain string interpolation. It then passes the string to undici fetch, or through `new URL()` when `useCache: false`. Both apply WHATWG dot-segment normalization.
- Scratch test with the real get(), a fake token and a spy dispatcher. The input 'renders/%2e%2e/styles/abc/style.json' was sent as `https://teststore.private.blob.vercel-storage.com/styles/abc/style.json`, both with and without `useCache: false`. The same happens for `.%2E` and `uploads/%2E%2E/x`. Backslash inputs are already stopped because they contain "..".

The impact and severity are overstated:
- The only private data this app keeps outside renders/ and uploads/ is `styles/{id}/style.json` (src/lib/ai/styles.ts:21,29,49).
- The unauthenticated GET /api/styles (listStyles) and GET /api/styles/[id] (toClient) already return all of it. The only change is that image pathnames come back as /api/blob URLs.
- The bypass therefore reveals nothing new today. Reading any other data in a shared store would need its exact pathname, and no route lets an attacker list by arbitrary prefix.
- Through urlToImageInput (refine/shopping-list) the bypass only makes the server send a JSON blob, relabeled image/jpeg by toFilePart, to the model. That is not a way to extract data. That function's arbitrary `fetch(url)` fallback (images.ts:55) is the more serious issue there, and it is a separate finding.
- So this is a broken defense-in-depth control, not an exploitable one. That is "low" under the rubric. It would only matter later if /api/blob were left less protected than /api/styles.

Problems with the recommended fix:
- The proposed regex `[A-Za-z0-9._-]+` rejects legitimate stored style images. The upload route accepts any `image/*` file.type (styles/[id]/images/route.ts:25-30), and uploadStyleImage takes the extension from `contentType.split("/")[1]` (blob.ts:139), so an SVG is stored as `...svg+xml`. My test confirmed the regex returns false for such a pathname.
- On its own the regex also accepts `renders/..` and `uploads/style/..`, so it is not a complete check without the existing `..` test.
- "Check new URL(constructedUrl).pathname" needs the storeId, which the app never has. A check against a fixed base URL does the same job without it.
- It still lets `%2f` and similar through, and I can't tell whether the Blob server decodes those. Rejecting '%' outright is safer.
- Minor: uploadUpload is never called, so uploads/room and uploads/floorplan never exist.

Same root cause elsewhere: the style `id` from the route is interpolated unvalidated into `styles/${id}/style.json` and `uploads/style/${id}/` (blob.ts:7-13), and read through the same get(). Next decodes dynamic params with decodeURIComponent (next/dist/shared/lib/router/utils/route-matcher.js:19). I did not verify a full exploit on this path.

</details>

<sub>Merged from: correctness:The /api/blob path allowlist can be bypassed with URL-encoded dot segments · platform:/api/blob echoes attacker-chosen content types (stored SVG XSS on the app origin), and its prefix allowlist can be bypassed with %2e%2e</sub>

<a id="sec-06"></a>
#### SEC-06: Request validation is inconsistent across routes: raw destructuring and casts, unbounded strings, 500s for bad input, and manifests never validated

**Severity:** ⚪ Low (auditor said medium; verifiers corrected it) · **Effort:** M · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/app/api/analyze/route.ts:15-28`, `src/app/api/render/route.ts:26-33`, `src/app/api/render/route.ts:57`, `src/app/api/refine/route.ts:29-50`, `src/app/api/refine/route.ts:53`, `src/app/api/refine/route.ts:59`, `src/app/api/shopping-list/route.ts:17-30`, `src/app/api/plan/route.ts:12-17`, `src/app/api/styles/route.ts:26`, `src/app/api/styles/[id]/route.ts:20`, `src/app/api/styles/[id]/images/route.ts:38`, `src/lib/api.ts:4`, `src/lib/ai/images.ts:20-22`, `src/lib/ai/images.ts:55`, `src/lib/blob.ts:95`, `src/lib/ai/styles.ts:29`, `src/lib/ai/schemas.ts:45-85`, `src/lib/ai/schemas.ts:126`, `src/lib/ai/analyze.ts:63`, `src/lib/ai/plan.ts:113`, `src/lib/ai/critique.ts:44`, `src/lib/ai/shopping.ts:34`, `src/components/refine-bar.tsx:61`

**Problem**

Only plan (planRequestSchema) and part of analyze use zod. Elsewhere:
- **analyze:** calls `roomImages.map` on an unchecked value, so a non-array gives a 500 'roomImages.map is not a function'.
- **render and refine:** cast `(styleReferences as string[])`, accept any truthy qualityGate, and don't check instruction's type or length.
- **shopping-list:** renderUrl and renderDataUrl are unchecked.
- **styles POST:** name length is unbounded.
- **[id] params:** never checked to be UUIDs.
- **Errors:** malformed JSON returns 500, not 400, and zod issues are discarded ('Invalid design brief').
- **Brief schemas:** no max lengths, although the client round-trips the brief and critique.ts:44 and shopping.ts:34 paste it into paid prompts with `JSON.stringify(brief, null, 2)`.
- **Manifests:** styleManifestSchema is defined but never used; getJsonBlob does `JSON.parse(text) as T`.

**Impact**

Bad input produces confusing 500s instead of actionable 400s. Unbounded, client-controlled strings inflate paid prompt tokens. Each route's ad-hoc checks drift further apart over time. The MIME-type part is covered by the stored-XSS finding.

**Recommendation** (verifier-corrected)

**1. Add a request-parsing helper in `src/lib/api.ts`** that returns 400 for bad JSON and for schema failures:
```ts
export async function parseBody<S extends z.ZodType>(req: Request, schema: S) {
  let raw: unknown;
  try { raw = await req.json(); } catch { return { error: apiError("Request body must be valid JSON", 400) } as const; }
  const r = schema.safeParse(raw);
  return r.success ? ({ data: r.data } as const) : ({ error: apiError(z.prettifyError(r.error), 400) } as const);
}
```

**2. Put request schemas in a new file (e.g. `src/lib/api-schemas.ts`).** Do not add `.max()` to `roomInventorySchema`, `designStrategySchema` or the other schemas that `generateObject` uses. Those limits would be sent to the model and enforced after the paid call, so a slightly long answer would fail with `NoObjectGeneratedError`.
- **Images:** `imageDataUrl = z.string().max(6_000_000).refine(s => /^data:image\/(jpeg|png|webp);base64,/.test(s))`.
  - `roomImages: z.array(imageDataUrl).min(1).max(4)`
  - `styleReferences: z.array(imageDataUrl).max(N).default([])`, with the same N enforced in `UploadZone` or `restage-app` so users see the limit before submitting.
- **Floor plan:** make a deliberate choice.
  - Either allow `application/pdf` and fix `toFilePart` (images.ts:20-22) so it stops relabelling PDFs as `image/jpeg`.
  - Or drop `.pdf` from the `UploadZone` `accept` and reject PDFs with a clear 400.
- **Simple fields:**
  - `styleId: z.uuid().optional()`
  - `qualityGate: z.boolean().default(true)`
  - `stream: z.boolean().optional()`
  - `instruction: z.string().trim().min(1).max(500)`, plus `maxLength={500}` on the RefineBar `Input`
  - `name: z.string().trim().min(1).max(80)`
- **Render URLs:** `renderUrl` and `currentRenderUrl` must be the app's own Blob proxy URL: `z.string().refine(u => extractBlobPathname(u)?.startsWith("renders/") ?? false)`. Also delete the `fetch(url)` fallback in images.ts:55-62. This closes the SSRF, which the finding missed. Remove `renderDataUrl` entirely, since the client never sends it.
- **Brief size:** cap the whole serialized brief instead of each field, so the generation schemas stay untouched: `designBriefSchema.refine(b => JSON.stringify(b).length <= 50_000, "Design brief too large")`. Legitimate briefs are a few KB. Do the same for the plan `inventory` and cap `keepItems` at around 30.

**3. Map "not found" to 404.**
- Validate `[id]` params with `z.uuid()` and return 404 on failure.
- Have `addImages` and `resolveStyle` throw a typed NotFound error (or check before calling) so the routes return 404 rather than 500.

**4. Optionally, as defense-in-depth,** parse manifests in `loadManifest` with `styleManifestSchema.safeParse` and treat an invalid manifest as null.

Treat all of this as robustness and hygiene work. It does not replace auth or rate limiting on the paid routes, which is where the real cost exposure is. None of these changes affect AI output quality, provided the generation schemas are left as they are.

<details><summary>Verification notes</summary>

**Combined lens: partially-confirmed, low**

I read every cited route and helper, checked the AI SDK's validation in node_modules/ai, and tested zod 4.6.4 in a scratch script.

**What holds up**
- **analyze:** `roomImages?.length` passes for any string. `roomImages.map` then throws a TypeError, which the catch turns into a 500.
- **render / refine:** `(styleReferences as string[]).map` gives a 500 for `null` or a string, because the `= []` default only applies to `undefined`. `qualityGate` is only checked for truthiness. `instruction` is only checked with `!instruction`, so an object or array gets interpolated as "[object Object]".
- **shopping-list:** `renderUrl` and `renderDataUrl` are not checked.
- **styles POST:** the name has no length limit.
- **Malformed JSON:** `request.json()` throws inside the try block, and `apiError` defaults to status 500.
- **Zod errors:** the issue details are dropped.
- **Manifests:** `styleManifestSchema` is never used, and `getJsonBlob` just does `JSON.parse(...) as T`.
- **Brief size:** the brief JSON is pasted into paid prompts at critique.ts:44 and shopping.ts:34, and the inventory JSON at plan.ts:130.

**What is wrong or overstated**
1. **Zod coverage is misstated.** The finding says only plan and part of analyze use zod. In fact render (route.ts:35), refine (:40) and shopping-list (:19) all validate the brief with `designBriefSchema.safeParse`. The gap is partial validation, not no validation.
2. **Security and cost impact is overstated.**
   - The real client never sends malformed shapes. It always sends booleans, string arrays and JPEG data URLs (prepare-image.ts:106), so none of these 500s show up in normal use.
   - Vercel's roughly 4.5MB request body limit already caps how large a string can be.
   - With no auth, anyone can already trigger full-price render, critique and re-render runs with valid input. Capping string length does not control abuse; auth and rate limiting do (that is the separate no-auth finding).
   - Style IDs are listable through GET /api/styles, and Blob keys are literal, so UUID-checking `[id]` is tidiness, not security.
   - Manifests are only ever written by the app (styles.ts:34, 49), so validating them on read is defense-in-depth only.
3. **The finding misses the one part that matters for security.** An unchecked `renderUrl` or `currentRenderUrl` reaches `urlToImageInput`. For any URL that is not a Blob URL, that calls `fetch(url)` at images.ts:55, which is a blind SSRF. Also, the client never sends `renderDataUrl` (restage-app.tsx:195, 252 send only `renderUrl`), so that field is unused surface that lets a caller supply any image.
4. **Following the recommendation literally would hurt output.**
   - (a) Adding max lengths to the brief schemas in schemas.ts changes the schemas passed to `generateObject`: `roomInventorySchema` at analyze.ts:63, and `designStrategySchema` at plan.ts:113 (which `designBriefSchema` extends). Zod 4 writes those limits into the JSON Schema sent to the model (`maxLength`/`maxItems`, confirmed by the scratch script). `generateObject` then enforces them after the call and throws `NoObjectGeneratedError` (ai dist/index.js:14283-14313). That call has already been paid for. A cluttered room or a long `reasoning` field would then fail analyze or plan.
   - (b) Restricting every data URL to `data:image/(jpeg|png|webp)` would reject PDF floor plans with a 400. The UI offers PDFs (restage-app.tsx:331), and client-api.ts:143 passes them through unchanged. Note that PDFs are already broken, because `toFilePart` (images.ts:20-22) relabels `application/pdf` as `image/jpeg`. The fix should settle that on purpose rather than as a side effect.
   - (c) A `.max(4)` on `styleReferences` without a matching limit in `UploadZone` turns an upload that works today into a confusing 400.

**Severity:** Taken alone this is robustness and maintainability work with no exploit beyond what the lack of auth already allows, so **low**. The SSRF piece would be medium or higher, but it belongs to the SSRF/URL-fetch finding.

</details>

<sub>Merged from: maintainability:Request validation is inconsistent: zod in 2 routes, raw destructuring and casts elsewhere; upload MIME type is trusted and manifests are never validated · platform:No authentication anywhere: every paid AI route and every destructive or storage route is publicly callable, and there is no src/proxy.ts gate</sub>

<a id="sec-07"></a>
#### SEC-07: next.config.ts is empty: no security headers, the x-powered-by header is sent, and there is no framing, referrer or robots policy

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `next.config.ts:3-5`

**Problem**

`const nextConfig: NextConfig = { /* config options here */ }`. With no `headers()`, pages get no CSP frame-ancestors, X-Frame-Options, Referrer-Policy, Permissions-Policy or X-Content-Type-Options. `poweredByHeader` defaults to true (docs 05-config/01-next-config-js/poweredByHeader.md).

**Impact**

The page can be framed to clickjack its paid or destructive buttons, which matters once auth exists. The header also fingerprints the framework, and the public URL can be indexed.

**Recommendation**

Set `poweredByHeader: false` and add `async headers()` returning, for `/:path*`:
- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Robots-Tag: noindex`

A full script CSP with nonces requires dynamic rendering, so frame-ancestors is the cheap, high-value part.

### AI API usage & cost

<a id="cost-01"></a>
#### COST-01: Saved styles attach every image in the folder, full size and re-downloaded, to every render, auto re-render and refine

**Severity:** 🟠 High · **Effort:** M · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/ai/styles.ts:181-199`, `src/lib/ai/styles.ts:117-120`, `src/app/api/render/route.ts:50-55`, `src/app/api/render/route.ts:87-95`, `src/app/api/refine/route.ts:56-58`, `src/app/api/refine/route.ts:71-76`, `src/lib/ai/render.ts:41-52`, `src/lib/ai/render.ts:74-98`, `src/lib/ai/prompt.ts:105-121`, `src/lib/ai/prompt.ts:120`, `src/lib/ai/normalize-image.ts:16-23`, `src/lib/blob.ts:155-158`, `src/lib/env.ts:28`, `src/lib/styles-client.ts:90-105`, `src/components/my-styles-manager.tsx:410-413`

**Problem**

- `resolveStyle` runs `Promise.all(manifest.images.map(async (image) => downloadPrivateBlob(image.pathname)))` with no cap.
- addImages appends with no limit, and the UI invites 'Upload more inspiration to enrich this style'.
- renderRoom pushes every reference as a file part (render.ts:95-97). generateRoomImage re-encodes each one with sharp (no resize) into a base64 data URL; the SDK decodes it again and the gateway re-encodes it.
- Stored references are the client's 2048px q0.85 JPEGs, about 0.75 MB each (about 1 MB as base64).
- The auto re-render calls generateRoomImage again, so every reference is re-encoded twice.
- downloadPrivateBlob passes `useCache: false`, which makes @vercel/blob read from origin (cache=0) even though these pathnames never change.
- The derived text profile is sent as well.
- Refine resolves the same N images, but assembleRefineInstruction never mentions them.

**Impact**

A 12-image style means 13 input images and roughly 13 MB of JSON per render. That doubles on a re-render and repeats on every refine. Blob GETs, sharp passes and image-input tokens (billed on gpt-image) all grow linearly with folder size.

gpt-image edits accept at most 16 images, and Google's docs say Gemini 2.5 Flash Image works best with up to 3. Large folders therefore risk failed renders, a diluted room photo, and layouts leaking in from inspiration images.

**Recommendation** (verifier-corrected)

1. **Cap render references, sized for the default model** (at most 3 inputs recommended).
   - In `resolveStyle`, return a curated subset instead of every image: `renderRefs` = up to 2 images, plus `profile`.
   - Pick them with no extra API calls. When `analyzeStyleImages` already runs, add `representativeIndices: z.array(z.number().int()).max(2)` to `styleProfileSchema`. Persist the chosen pathnames as `manifest.refPathnames`, falling back to the newest 2.
   - The profile text still carries the whole folder's style via `styleProfileToText`. This keeps quality: the references only supply mood and materials, and the model guidance favours few inputs.
   - Optionally, add a star toggle in the manager so the owner can pin hero images. Replace the "enrich" line with "The 2 starred images guide renders; all images shape the style profile".
   - Sketch:
     ```ts
     const refs = (manifest.refPathnames?.length ? manifest.refPathnames : manifest.images.slice(-2).map(i => i.pathname)).slice(0, 2);
     const images = await Promise.all(refs.map(downloadPrivateBlob));
     ```

2. **Fix edits: refine and the auto-fix re-render.**
   - Pass 0 references on the corrective re-render (render/route.ts:87-95), and 0-1 on user refine (refine/route.ts:71-76, 88-95). The current render already embodies the style.
   - Keep the style guidance by passing `styleProfileToText(profile)` into `assembleRefineInstruction` as an optional argument appended like in `assembleImageInstruction`. In refine/route.ts:57, keep `resolved.profile` instead of dropping it.
   - Replace prompt.ts:120 with a fixed-position statement, e.g. "The SECOND input image is the original room photo (architecture reference only); any further images are style references for mood and materials only — never copy their room or layout."
   - Trade-off: a user refine like "warmer" loses the pixel-level mood anchor. The profile text and the current render cover it, and fewer inputs also reduce layout leakage. If references are kept on refine, cap them at 1 so the total stays at 3 or fewer.

3. **Store a render-ready copy at upload.** In `addImages` (styles.ts:106-115), resize with sharp on the server: `.rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 })`. Store that copy (or a `-1024.jpg` sibling) and use it for renders and profiling.
   - This cuts about 6x in bytes and in Gemini image tiles, with negligible quality impact for mood/material references.
   - It also validates that uploads really are images, since the unauthenticated images route accepts client bytes as-is.
   - Keep the room photo at full size.

4. **Allow CDN caching of immutable images.** Remove `useCache: false` from `downloadPrivateBlob` (blob.ts:155-158). Keep it in `getJsonBlob` for the overwritable `style.json`.

5. **Related, lower priority: profile derivation.**
   - `analyzeStyleImages` also receives every full-size image.
   - Each upload batch triggers a fresh derivation: `uploadStyleImages` posts batches one after another, and each POST runs `regenerateIfStale` over the whole folder.
   - Fix: cap profile inputs (e.g. 8-12 downscaled images) and send `derive=false` on non-final batches, so the profile is derived once per upload.

Drop the original advice to "normalize once per request and reuse". Sharp cost is negligible (about 330 ms for 12 full-size images), and it adds plumbing for no measurable gain.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced the flow from the client to the gateway. restage-app.tsx:148-184 and 231-242 send `styleId` to /api/plan, /api/render and /api/refine. Plan uses only the profile text (plan/route.ts:19-25). Render and refine call `resolveStyle`, which downloads every image in the manifest with no cap (styles.ts:191-196). Nothing limits the image count anywhere: `addImages` appends without a limit (styles.ts:117-120), the images route accepts any number of files, and the manager invites more uploads (my-styles-manager.tsx:412).

`renderRoom` pushes every reference as a file part (render.ts:90-98). `generateRoomImage` sharp-re-encodes each part at q85 without resizing (render.ts:41-52, normalize-image.ts:17-20) and turns it into a data URL. I checked the SDK code. ai@7.0.99 `toImageModelV4File` (ai/dist/index.js ~12873) base64-decodes the data URL back to a Uint8Array. Gateway `maybeEncodeImageFile` (@ai-sdk/gateway dist ~1808) then base64-encodes it again into the JSON body. `maxImagesPerCall` is MAX_SAFE_INTEGER, so the SDK never splits the request. With `qualityGate` on (the default), a failed critique re-runs `renderRoom` with the same references (render/route.ts:87-95, refine/route.ts:88-96), so every reference is normalized again. `downloadPrivateBlob` sets `useCache: false`, which @vercel/blob turns into `?cache=0`, an origin read (index.js ~146). The stored images come from `prepareImageForUpload`, capped at 2048px and q0.85 (prepare-image.ts:3-4). The finding's mechanism is therefore accurate at every cited line.

The finding needs three corrections.

1. **Cost is overstated for the default model.** IMAGE_MODEL defaults to google/gemini-2.5-flash-image (env.ts, .env.example:9). There, extra input images are cheap image tokens next to the per-image output price. The real costs are payload size, latency, repeated CPU work and prompt dilution. Google's own guidance is that this model works best with up to 3 input images. The dollar cost becomes material, and the 16-image edit limit a hard failure, only if IMAGE_MODEL is switched to a gpt-image model. "About 13 MB" is an upper estimate: the images are at most 2048px and are never upscaled, and web inspiration images are often smaller.

2. **The refine problem is worse than described.** The finding says the refine prompt never mentions the references. In fact `assembleRefineInstruction` says "The last input image is the original room photo for architectural reference only" (prompt.ts:120). The images are assembled in the order [currentRender, roomPhoto, ...refs] (render.ts:74-98). Whenever a style has at least one image, the last image is a style reference, not the room photo. I reproduced this with a scratch simulation. On top of that, `generateRoomImage` joins all text parts separately from the images (render.ts:53-56). The per-image labels ("Original room photo…", "Style reference images…") lose their position and end up as a dangling list after the instruction. This affects both refine calls and the auto re-render in /api/render. The refine route also drops the style profile text entirely.

3. **Scope.** The one-off (unsaved) reference path is limited by Vercel's roughly 4.5 MB request body limit, which the code itself notes (styles-client.ts:5). Only the saved-style path, which downloads on the server, is unbounded. `useCache: false` affects latency, not cost, and is minor.

Severity: medium. The reference count grows without limit on the headline "My Styles" feature, and the refine and auto-fix prompt contradicts itself whenever references exist. But on the default Gemini model the dollar cost is modest, and the quality loss is a documented risk rather than something I observed. It rises to high if IMAGE_MODEL is a gpt-image model or folders grow past about 14 images.

**Severity/fix lens: partially-confirmed, high**

The mechanism is real, and I traced every step. It is over-weighted on dollar cost and CPU, and it misses the worst consequence.

What I confirmed:
1. `resolveStyle` (styles.ts:191-196) downloads every image in `manifest.images` with no cap. Nothing caps folder size: `addImages` appends at styles.ts:117-120, and the client splits large uploads into 3.5 MB batches (styles-client.ts:22-42, 90-105), so a folder can grow without limit.
2. `renderRoom` adds each reference as a file part (render.ts:90-98).
3. `generateRoomImage` runs sharp on every part without resizing (render.ts:41-52; normalize-image.ts:16-23) and builds a base64 data URL. AI SDK 7.0.99 `toImageModelV4File` (node_modules/ai/dist/index.js:12873-12889) decodes it back to a Uint8Array. The gateway's `maybeEncodeImageFile` (node_modules/@ai-sdk/gateway/dist/index.js:1808-1815) re-encodes it as base64 into the JSON body.
4. `normalizePrompt` runs inside `retry` (index.js:12692). `maxRetries` is unset and defaults to 2, so a retryable failure re-sends the whole payload.
5. The auto re-render (render/route.ts:87-95) and both refine renders (refine/route.ts:56-58, 71-76, 88-95) send all references again.
6. In @vercel/blob 2.8.0, `get` with `useCache:false` sets `?cache=0` (dist/index.js:146-150), which the SDK documents as a CDN bypass. `downloadPrivateBlob` (blob.ts:155-158) is only used for image pathnames built from a timestamp and a UUID. `style.json` is read separately by `getJsonBlob`, so dropping the flag in `downloadPrivateBlob` is safe.
7. The UI line about uploading more images exists (my-styles-manager.tsx:410-413).

Where the finding is off:
- **Sharp cost.** I measured 12 parallel full-size re-encodes of a 2048x1536 JPEG at about 330 ms in a scratch script. The sharp cost is negligible; the real costs are payload size and model inputs.
- **Dollar cost.** With the default model (`google/gemini-2.5-flash-image`, env.ts:28, .env.example:9), input image tokens are priced about 100x lower than output tokens. The money overhead is real and linear, but modest (roughly 10-15% per call at 12 references by my rough estimate). It is larger if IMAGE_MODEL is switched to gpt-image.
- **The main harm is quality.** Google documents that Gemini 2.5 Flash Image works best with at most 3 input images (I confirmed this via web search; the official page was blocked by the network proxy). So a style with 3 or more images already goes over that on the first render (room + 3). A refine or corrective re-render goes over it with just 2 (current render + room + 2). I could not verify whether more inputs cause a hard error, so I treat that as a quality risk, not a proven failure.

What the finding missed:
- Refine does not just "never mention" the references; its prompt gets them wrong. `assembleRefineInstruction` ends with "The last input image is the original room photo for architectural reference only." (prompt.ts:120). But `renderRoom` orders images as [currentRender, roomImage, ...styleReferences] (render.ts:74-98). So when any reference is attached, the "last image" is an inspiration photo of a different room.
- This hits every user refine with a saved style that has at least one image, and every auto-fix re-render in /api/render. It invites architecture from the inspiration room to leak in, which is exactly what the pipeline works hardest to prevent.
- The refine instruction also never includes the saved style profile text; the route drops `resolved.profile` (refine/route.ts:57).

Severity: I keep high. The reason is correctness and quality in the core saved-style flow: the default model's 3-input guidance is exceeded at small folder sizes, and the refine prompt mislabels a reference as the room photo. Payload size is unbounded (about 1 MB of base64 JSON per reference, per render call). The dollar cost alone would only justify medium.

Corrections to the recommendation:
- Size the cap for the default model: at most 2 references on the first render, and 0-1 on edits.
- Fix the refine prompt as part of this change.
- Drop "normalize once and reuse", since sharp time is negligible.
- Downscale at upload on the server, since clients can POST raw files directly to the images route.

</details>

<sub>Merged from: api-cost:Every render and refine attaches all images of a saved style, full-size, re-downloaded each time · performance:Saved styles send every image at full resolution to the image model on every render, re-render and refine · ux:All of a saved style's images go to the image model on every render, re-render and refine, with no cap · correctness:Every image in a saved style goes to the image model on every render and refine, and to the LLM on every profile derivation, with no cap · ai-quality:Every image in a saved style is sent to the image model at full resolution on every render, auto-fix and refine · platform:A saved style sends every image in the folder to the image model on every render and refine</sub>

<a id="cost-02"></a>
#### COST-02: Multi-batch style uploads re-derive the style profile once per batch, each time over every image at full resolution

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/styles-client.ts:6`, `src/lib/styles-client.ts:86-105`, `src/app/api/styles/[id]/images/route.ts:66-76`, `src/lib/ai/styles.ts:83-91`, `src/lib/ai/styles.ts:94-143`, `src/lib/ai/style-profile.ts:37-46`, `src/lib/client-api.ts:164-165`, `src/lib/client-api.ts:218`, `src/components/my-styles-manager.tsx:140-144`, `src/app/api/styles/[id]/route.ts:27-29`

**Problem**

uploadStyleImages splits files into batches of at most 3.5 MB (`MAX_BATCH_BYTES = 3.5 * 1024 * 1024`) and POSTs them one after another. Each POST runs addImages → saveManifest → `regenerateIfStale(saved, send)`. The signature has changed, so it re-downloads every image in the manifest and calls analyzeStyleImages with all of them. Each image is up to 2048px, and there is no count cap and no downscale.

Only the last batch's profile is kept, and each batch waits for the previous derivation to finish. Server statuses ('Uploading 5 images…', 'Deriving style profile…') overwrite the client's 'Uploading images (2 of 3)…' counter.

**Impact**

Image inputs grow quadratically with the number of batches:
- 12 photos in 3 batches send 4 + 8 + 12 = 24 image inputs, where 12 would do.
- 20 photos at about 5 per batch send 50, where 20 would do.

Upload wall time becomes K × (upload + derivation). The unbounded payload eventually hits provider image-count or size limits, and that failure feeds the retry-on-every-open problem in GET /api/styles/[id].

**Recommendation** (verifier-corrected)

**1. Primary fix (effort S): derive once per upload session, on the final batch only.**

In `styles-client.ts`, inside the loop:

```ts
const isLast = index === batches.length - 1;
if (!isLast) form.append("deriveProfile", "false");
const prefix = batches.length > 1 ? `(${index + 1}/${batches.length}) ` : "";
last = await callApi(`/api/styles/${id}/images`, form, onStatus && ((s) => onStatus(prefix + s)));
```

In `route.ts`:

```ts
const deriveProfile = form.get("deriveProfile") !== "false";
// ...
addImages(id, images, send, { deriveProfile })
```

In `addImages` (`styles.ts`), right after `saveManifest`:

```ts
if (options?.deriveProfile === false) return { manifest: saved };
```

This keeps the streamed "Deriving style profile…" status and the `profileError` warning on the final response. If the final batch is aborted, the existing lazy `regenerateIfStale` in `GET /api/styles/[id]` still heals the profile with a single derivation. The status prefix fixes the lost batch counter.

Output quality is unchanged: the final derivation sees exactly the same full image set as today. Only the throwaway intermediate profiles go away.

**2. Optional, secondary: shrink the analysis inputs inside `regenerateIfStale`.**

Downscale each downloaded image with sharp, which the repo already depends on (`src/lib/ai/normalize-image.ts`), before calling `analyzeStyleImages`:

```ts
sharp(buf).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 })
```

A long edge of 768–1024px is plenty to read palette, materials and mood. It cuts the base64 payload several-fold and lowers latency. Token savings depend on the model's image tokenizer.

A count cap, for example 12 images evenly sampled across the folder, is a real trade-off. It bounds the payload and the provider-limit failures, but it can underweight parts of a very large, mixed folder. Apply it only above a threshold, and say so in the UI or code comments.

**3. What not to adopt:**
- **`after()`**: the profile would drop out of the response, and it would race the GET lazy derive.
- **Incremental "previous profile + new images" updates**: the profile drifts over time, and once fix 1 is in place they buy little.

Client-direct Blob uploads are a separate, larger redesign. They would still need one register-and-derive call, and without auth their token route adds another unauthenticated endpoint.

The retry-on-every-open failure mode belongs in a separate finding on `GET /api/styles/[id]` deriving on read. It is not fixed by this change.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced the path from the UI through the client and route to the library code, and the mechanism is real.

**What happens on a multi-batch upload**
- `MyStylesManager.handleAddImages` (src/components/my-styles-manager.tsx:136-160) passes every dropped file to `uploadStyleImages`.
- That function re-encodes each file to at most 2048px, JPEG 0.85 (prepare-image.ts:147-148), then `batchFiles` cuts batches at 3.5 MB (styles-client.ts:6, 22-42).
- The loop POSTs the batches one after another with `await callApi(...)` (styles-client.ts:90-105).
- `callApi` sets `stream=true` because `onStatus` is passed (client-api.ts:57-59). Each request therefore runs the route's `run` → `addImages` (images/route.ts:69-76) → upload → `saveManifest` with the new image list (styles.ts:117-120) → `regenerateIfStale(saved, send)` (styles.ts:131).
- The pathname signature changes on every batch, so the early return at styles.ts:79 never fires. The function then downloads every image in the manifest from Blob and passes all of them, unresized, to `analyzeStyleImages` (styles.ts:83-90).
- `analyzeStyleImages` attaches one file part per image, with no cap (style-profile.ts:37-39).
- The gateway base64-inlines each Uint8Array into the JSON request (node_modules/@ai-sdk/gateway/dist/index.js:1521-1555), so the payload is about 1.33x the stored bytes.
- The result is K LLM calls for K batches, with image inputs summing to K·M + b·K(K+1)/2, where M is the folder's existing images and b the batch size. Each profile overwrites the last, so only the final one survives.
- Each batch also waits for its derivation before the next upload starts, because the stream only finishes after `run` resolves. Wall time is K × (upload + Blob re-download + derivation).

**Status-text claim: confirmed.** The client's "Uploading images (i of N)…" (styles-client.ts:92-94) is replaced almost at once by the server's "Uploading N images…", "Deriving style profile…" and "Style saved" (styles.ts:104, 83; route.ts:71), because `callApi` forwards `payload.status` to the same `onStatus` (client-api.ts:111).

**Failure-feeds-GET claim: confirmed.** `addImages` catches a derivation error and keeps the stale signature (styles.ts:133-141). `GET /api/styles/[id]` then calls `regenerateIfStale` with no fallback (route.ts:27-29), so each open retries the LLM, and a failure returns a 500 that closes the folder (my-styles-manager.tsx:124-126). The AI SDK default `maxRetries=2` (ai/dist/index.js:2813) multiplies each failed attempt.

**Corrections**
1. **Severity is high → medium.** Cost is bounded and O(K²) only in the batch count. Batching only kicks in above about 3.5 MB of re-encoded JPEG, which is roughly 3–6 high-res camera photos (a 3.1 MP q85 photo is about 0.6–1.2 MB). Small Pinterest-size inspiration images usually fit in one batch. The default designer model is a "flash" vision model (env.ts:25-26), and this is a single-owner app, so the extra spend is cents per session. The real cost is time: K sequential derivations plus the misleading status text. That is a noticeable defect, not breakage of a common flow.
2. **"Full resolution" means the stored ≤2048px client-prepared JPEG, not the camera original.** The server never downscales, and it also does not enforce the 2048px cap for direct API callers.
3. **"Eventually hits provider limits" is about total folder size, not batching.** Even a single derivation sends every image. Batching only multiplies how often that happens.
4. **The quadratic count also includes images already in the folder.** Every batch re-sends them.

**Recommendation fixes**
- `after()` is a poor fit here. It is valid in Route Handlers (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md), but while it runs in the background the manifest signature is still stale. A `GET /api/styles/[id]` in that window would start a second, concurrent derivation, and the upload response could not return the new profile.
- The 8–12 image cap and the 768px downscale are quality trade-offs, and they are separate from the per-batch bug. They should be stated as such.

**Severity/fix lens: partially-confirmed, medium**

The core mechanism is real, but the finding overstates the severity and a few of its recommendations need correcting.

How it works:
- `uploadStyleImages` (`src/lib/styles-client.ts:86-105`) prepares every file (`prepareImageForUpload`: JPEG q0.85, longest edge at most 2048px), splits them into batches of at most 3.5 MB (`batchFiles`, `MAX_BATCH_BYTES` at line 6), then awaits one POST per batch in sequence.
- Each POST calls `addImages` (`src/app/api/styles/[id]/images/route.ts:69-76`).
- `addImages` saves the manifest with the new image paths appended (`styles.ts:117-120`), then calls `regenerateIfStale(saved, send)` (`styles.ts:130-131`).
- Adding paths always changes `computeStyleSignature`, so every batch re-downloads every image in the manifest (`styles.ts:84-89`) and makes one `generateObject` call with all of them (`style-profile.ts:37-46`).
- Only the last batch's profile survives, because each `saveManifest` overwrites the one before it.
- For a folder that already holds N images, K batches send about K·N plus a triangular sum of image inputs, instead of N plus the new images. 12 photos in 3 batches send 4+8+12 = 24 inputs; 20 photos in 4 batches send 50. The finding's figures are correct.
- I checked `@ai-sdk/gateway` (`dist/index.js:1521-1555`, `maybeEncodeFileParts`): it inlines `Uint8Array` file parts as base64 in the JSON body, so each call's payload is about 1.33 × the total image bytes, with no cap on count and no server-side downscale.

The UX part is also real:
- `callApi` passes the SSE status to `onStatus` (`client-api.ts:164-165,218`), which is `setUploadStatus` (`my-styles-manager.tsx:140-144`).
- The server's `Uploading N images…`, `Deriving style profile…` and `Style saved` messages (`styles.ts:104,83`; `route.ts:71`) replace the client's `Uploading images (i of K)…` text as soon as the stream starts.
- So the batch counter vanishes during the longest phase, which is derivation.

Where the finding is inaccurate:
1. "Full resolution" really means the stored JPEG, already capped at 2048px on the client, not the camera original.
2. The "hits provider limits, which feeds retry-on-every-open" chain comes from having no image-count cap. That is a separate issue (`GET /api/styles/[id]` running `regenerateIfStale` on read, `route.ts:27-29`), and it happens even with a single derivation over a large folder. A failed intermediate batch here is swallowed as a warning, and a later batch overwrites it.
3. The waste is real, but there is no breakage. This is an optional, secondary flow in a single-owner app, and the default designer model is a "flash" vision model. The cost is a bounded multiplier of about K/2 on style-folder uploads, plus K sequential derivations of latency. On this rubric that is medium, not high.

Recommendation review:
- The primary fix (derive only on the final batch) is correct and minimal.
- `after()` (docs at `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`) is a poor fit. It runs after the response is sent, so the client would lose the profile and the warning in the response. It would also race the lazy derivation in `GET /api/styles/[id]`, which can cause double derivation. On its own it does not reduce the call count at all.
- An incremental update (old profile plus new images) risks the profile drifting and adds complexity once last-batch-only derivation exists. It is not needed.
- Capping the count is a real quality trade-off and should be described as one. Downscaling reliably shrinks the payload and latency, but any token saving depends on the model's tokenizer.
- Client-direct Blob upload is a larger redesign. It would still need one register-and-derive call, and without auth its token route would be another open endpoint. It is not the minimal fix.

</details>

<sub>Merged from: api-cost:Style profile is re-derived after every upload batch, re-sending all images at full resolution each time · performance:The style profile is re-derived from all images on every upload batch, every added image and when a stale style is opened · ux:Style uploads re-derive the profile per batch, concurrent drops lose images, and one bad file fails the whole selection · correctness:A multi-batch style upload derives the style profile once per batch, each time over all images · correctness:Every image in a saved style goes to the image model on every render and refine, and to the LLM on every profile derivation, with no cap · ai-quality:Style profile is re-derived after every upload batch, each time with every image; failed derivations retry on every folder open · maintainability:Batched style uploads re-derive the style profile once per batch, each time over all images · platform:The style profile is re-derived for every upload batch with all images so far, and GET /api/styles/[id] runs the LLM on read and fails the open when derivation fails</sub>

<a id="cost-03"></a>
#### COST-03: Quality-gate design: no definition of 'critical', a heavy prompt, and any fail triggers an unchecked re-render that edits the failed image and always replaces the first

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** M · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/ai/critique.ts:11-15`, `src/lib/ai/critique.ts:22-71`, `src/lib/ai/schemas.ts:152-156`, `src/lib/ai/constants.ts:24-34`, `src/app/api/render/route.ts:77-100`, `src/app/api/refine/route.ts:78-98`, `src/app/api/refine/route.ts:194-210`, `src/lib/ai/prompt.ts:105-121`, `src/lib/ai/render.ts:25-27`, `src/lib/ai/render.ts:90-98`, `src/lib/ai/render.ts:108`, `src/components/restage-app.tsx:54`, `src/components/restage-app.tsx:496`

**Problem**

The schema is only `{ passed: boolean, issues: string[], correctiveInstruction?: string }`. The prompt says 'If the render fails any critical rule, set passed to false' but never says which of the 7 checks or 10 rules are critical. It mixes in subjective checks ('AI-staging clichés or material honesty issues'). It also asks 'Style-ref mood present without copying layout?', yet critiqueRender receives only the room image and the render, with no references and no profile. No temperature is set.

Each call sends:
- DESIGNER_SYSTEM_PROMPT (about 340 tokens)
- `JSON.stringify(brief, null, 2)` (4.9k chars, about 1.2k tokens, for a 12-item room)
- NON_NEGOTIABLE_RULES (about 660 tokens, largely repeating the checklist)
- the room photo at up to 2048px, plus the render

`if (!critique.passed && critique.correctiveInstruction)` triggers a second generateImage with `currentRender: result.image`, which edits the failed output. That new result is never critiqued and unconditionally replaces the first. The issues are thrown away: toClientRenderResult returns only imageUrl and mediaType. The gate is on by default (`useState(true)`).

**Impact**

Image generation is the most expensive call. An under-specified, non-deterministic judge sets the re-render rate, and so sets the image cost of each Generate and Refine. Architecture or camera failures are hard to fix by editing the broken output. A worse second render can silently replace a better first one, and the user never learns what was wrong.

**Recommendation** (verifier-corrected)

Minimal effective change, in order of value:

1. **Structured, calibrated verdict** (src/lib/ai/schemas.ts):
```ts
export const critiqueResultSchema = z.object({
  issues: z.array(z.object({
    rule: z.number().int().min(1).max(10),
    severity: z.enum(["blocker", "minor"]),
    kind: z.enum(["architecture", "camera", "keep", "local"]),
    description: z.string(),
  })),
  correctiveInstruction: z.string().optional(),
});
```
   - Work out `passed` on the server as `!issues.some(i => i.severity === "blocker")`, so the flag can never disagree with the issue list.
   - In critique.ts, list the blockers explicitly: a window, door or wall added, removed or moved; the camera, framing or aspect ratio changed; a keep item replaced, moved or restyled; a blocked door, radiator or outlet; a gross scale error; text, logos or duplicated objects.
   - State that rules 6, 7 and 10 and any taste judgements are always minor.

2. **Remove the style-reference check** (critique.ts:40), or reword it to "palette and materials match designStrategy (minor only)". The judge cannot see the references, and sending them would add image input tokens to every critique.

3. **Split the retry by blocker type.**
   - In /api/render, an architecture or camera blocker should regenerate from the original photo with no currentRender: `instruction + "\n\nCORRECTION (previous attempt failed): " + fix`. Keep the edit path (`currentRender: first.image`) for keep or local fixes only.
   - In /api/refine, a structural blocker should redo the edit from the pre-refine `currentRender` with `${userInstruction}. Also: ${fix}`, not from the original photo, so the user's changes survive.
   - Pass the user's refine instruction into critiqueRender as "an intentional change; do not flag it".
   - In prompt.ts:119-120, allow restoring architecture to match the original photo, and stop claiming the last image is the room photo when style references follow it.

4. **Stop silently replacing the first render.** Both images are already in Blob (render.ts:108), so return `{ ...toClientRenderResult(result), previousImageUrl: retried ? first.imageUrl : undefined, issues }`. In the client, show the minor issues as suggestions and add a "Compare with first attempt" toggle. The shopping list should follow the image the user keeps. This needs no extra API calls. If you want the choice made automatically, one extra critique of the second render is cheap next to an image call.

5. **Cheap prompt hygiene without losing quality.**
   - Move the static checklist and rules into `instructions`, ahead of the dynamic brief, so provider prefix caching can apply. `system` is deprecated in AI SDK 7.
   - Send compact `JSON.stringify` of the brief minus non-kept existingFurniture and designStrategy.reasoning.
   - Keep dimensions, function, camera, architecture, fixedElements, lighting, keep items, palette, materials and layoutConcept.
   - Do not downscale the images without an A/B check.
   - `temperature: 0` is optional.

6. **Measure first.** Log `issues`, the blocker count and which retry branch ran (console output in Vercel logs is enough) to get the pass and re-render rates before and after the change.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced both paths from the client toggle (restage-app.tsx:54, sent at :185 and :243) to the server routes (qualityGate also defaults to true on the server, render/route.ts:31 and refine/route.ts:36), then through critiqueRender and renderRoom, and on into the gateway image model in node_modules.

What holds up:
- The schema is only passed, issues and an optional correctiveInstruction.
- The prompt never defines which rules count as critical.
- No temperature is set. In ai 7.0.99 generateObject just forwards callSettings.temperature (index.js:14535), so the provider default applies.
- A failed check with a correctiveInstruction starts a second generateImage. That call passes the failed render as currentRender, so it becomes the FIRST image in the files array: files are built in the order currentRender, room, then style refs (render.ts:74-98 -> ai normalizePrompt -> gateway doGenerate `files`).
- The second render is never critiqued and always replaces the first. toClientRenderResult throws away the issues.
- The first render has already been uploaded to Blob (render.ts:108 -> blob.ts:115-121) and its URL is then dropped, so every retry also leaves an orphaned renders/* blob.
- The critique gets no style images and no style profile text (CritiqueInput, critique.ts:11-15).
- On refine, the critique gets only the original brief, never the user's instruction. Its check 'Lighting consistent with the original?' can flag a requested 'warmer' change, and the auto re-render could then undo it.
- Measured text sizes: DESIGNER_SYSTEM_PROMPT is 1357 chars (about 340 tokens) and NON_NEGOTIABLE_RULES is 2645 chars (about 660 tokens). A synthetic 12-item brief pretty-prints to 4.2k chars (about 1.05k tokens). These match the claim.

Where the finding is wrong or overstated:
1. 'Never says which ... are critical' is too strong. Line 39 names one critical failure explicitly: a replaced keep-list sofa, couch or sectional.
2. The style check is not entirely blind. brief.designStrategy.palette and materials come from the saved profile (plan.ts:54-58), so the judge has some indirect style signal. It still has no images.
3. The finding misses a sharper cause of fail-on-anything: the prompt says 'If it passes, set passed to true with an empty issues array', so any issue at all (a subjective cliché, missing region-available furniture) pushes toward passed=false.
4. It also misses why editing the failed image is self-defeating. assembleRefineInstruction's keep block says 'copy these objects from the FIRST input photo' (prompt.ts:25). In edit mode the FIRST image is the failed render, so the corrective pass is told to copy keep items from the output that broke them. The line 'The last input image is the original room photo' (prompt.ts:120) is also false whenever style references are present, because those are appended after the room photo (render.ts:90-98).
5. Downscaling to about 1024px risks weakening the checks that need fine detail: outlets, extra legs, gibberish text.

Why medium, not high: the cost is bounded at one extra image call plus one cheap vision call per Generate or Refine. The real re-render rate depends on the model and has not been measured. Nothing breaks. Still, this is the biggest image-cost lever in the default flow, and silently swapping in an unchecked, possibly worse image is a real quality and UX defect.

**Severity/fix lens: partially-confirmed, medium**

I read critique.ts, schemas.ts, render.ts, prompt.ts, constants.ts, keep.ts, plan.ts, both routes, env.ts, prepare-image.ts, client-api.ts and restage-app.tsx, and checked the AI SDK 7.0.99 types. I also measured the prompt parts with a scratch script.

What holds up:
- The schema is only passed, issues as plain strings, and an optional correctiveInstruction.
- The critique asks about style-reference mood, but CritiqueInput only carries the brief, the render and the room photo. It never gets the reference images or the style profile.
- No temperature is set.
- A fail that includes a correctiveInstruction triggers exactly one more generateImage, with currentRender set to the failed image. That second image is never checked, it always overwrites `result`, and the issues are dropped by toClientRenderResult.
- The gate is on by default, both in the client state and in the route defaults.
- The token estimates are accurate. The system prompt is 1,357 chars (about 340 tokens), the rules are 2,645 chars (about 660 tokens), and the checklist is about 820 chars (about 200 tokens). A realistic 12-item brief pretty-printed is 4,421 chars (about 1.1k tokens); compact it is 3,439 chars.

The same mechanism is worse than the finding says in two places:
1. The corrective re-render reuses assembleRefineInstruction, which says "Edit the FIRST input image … in place" and "Do not change windows, doors, walls, or camera". A fix that restores a window or the camera therefore contradicts the prompt it is sent in. The same prompt also says "The last input image is the original room photo", but render.ts adds the style references after the room photo, so that is false whenever references are present.
2. On /api/refine, the critique is never told what the user asked for. The corrective prompt then swaps the user's instruction for the critic's fix.

What is overstated or wrong:
- "Never says which rules are critical" is not quite right. critique.ts:39 names one critical fail (a replaced keep-list sofa). All 10 rules are also framed as "Non-Negotiable", including subjective ones (6 no clichés, 7 region furniture, 10 coherent scheme). So the problem is a judge that is too strict and uncalibrated, not one with no definition at all.
- Severity: the cost is capped by the code at one extra image per Generate or Refine, and the user can turn the gate off. The default models are a DeepSeek flash vision model for the critique and gemini-2.5-flash-image for rendering, so the critique's roughly 2.3k text tokens cost almost nothing next to an image. That makes this medium (a noticeable quality/UX defect plus avoidable image spend at an unmeasured rate), not high.

Where the recommendation needs changing:
(a) The proposed "300–400 token projection" leaves out dimensions and constraintsFromUser.function. The judge needs those for the scale and circulation checks, and the saving is a fraction of a cent. Keep them, and trim only what carries no information.
(b) Downscaling both images to about 1024px risks missing small defects (outlets, gibberish text, extra legs). The render is already 1536x1024, and whether it saves tokens depends on the provider. Test this before doing it.
(c) "Re-render from the original photo with assembleImageInstruction" is right for /api/render. On /api/refine it would throw away the user's change and all earlier refinements.
(d) temperature 0 is fine but minor. It does not make output deterministic and may be ignored by reasoning models (the SDK only warns).

</details>

<sub>Merged from: api-cost:The critique call is heavy, re-renders on any fail, and on refine it doesn't know what the user asked for · ai-quality:Quality gate: vague pass/fail rule triggers a full re-render that edits the failed image, is never re-checked, and always replaces the first result</sub>

<a id="cost-04"></a>
#### COST-04: Runs can't be cancelled, client disconnects never reach the AI calls, the SSE stream sends no heartbeats, and timeouts give a message with no next step

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/client-api.ts:51-67`, `src/lib/client-api.ts:119-121`, `src/lib/api.ts:28-64`, `src/lib/ai/render.ts:58-63`, `src/lib/ai/critique.ts:22-25`, `src/app/api/render/route.ts:71-97`, `src/app/api/render/route.ts:103-105`, `src/components/restage-app.tsx:318-324`, `src/components/restage-app.tsx:414-422`, `src/components/restage-app.tsx:607-620`

**Problem**

- **Server.** No generateObject or generateImage call passes `abortSignal`, although AI SDK 7 supports it and GatewayImageModel.doGenerate forwards it (`...abortSignal && { abortSignal }`). Next does abort request.signal when the client disconnects (next/dist/build/templates/app-route.js:211, signalFromNodeResponse; next-request.js:56-63), but nothing reads it.
- **Stream.** streamStatus's ReadableStream implements only start(), with no cancel(). A scratch test on Node 22 showed that after the reader is cancelled, the in-flight AI step still runs to completion. Only the next send() fails, with 'Invalid state: Controller is already closed', and the catch-block enqueue and finally-block close() then throw again. Nothing is written during a 20–90 s generateImage call.
- **Client.** callApi's fetch has no AbortSignal, `grep` finds no AbortController anywhere in src, and there is no Cancel control. 'Change keep list' and the room-photo UploadZone stay enabled during runs.
- **Messages.** 'Stream ended without result' is shown as-is, with no elapsed time or duration estimate.

**Impact**

Closing the tab or walking away from a run still pays for the step in flight, which can be a full image generation plus retries. Non-streamed work, like the style derivation in GET, never stops. Proxies or mobile networks with idle timeouts can drop the silent stream; the user then sees 'Stream ended without result' while the server finishes and bills. A user who notices a wrong keep list has to wait up to 5 minutes or reload and lose state.

**Recommendation**

- Pass `abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(...)])` to every AI call, and check `signal.aborted` between steps.
- Add cancel() to the stream with a closed flag so send() becomes a no-op after disconnect.
- Write an SSE comment line (': ping') every ~15 s.
- Add one AbortController per run in RestageApp and callApi, with a Cancel button next to ProgressStages. Abort when 'Change keep list' is clicked or the photo changes.
- Show elapsed seconds and a 'typically ~1–2 min' hint. Map 'Stream ended without result' and network errors to 'The server took too long. Try again, or turn off the quality check.'

Note: aborting stops further gateway work and all chained calls, but the provider may still bill for work already done upstream.

<sub>Merged from: api-cost:Nothing can cancel a run: request.signal is never forwarded and the client has no abort · performance:The SSE helper does not pass client disconnects to AI calls and sends no heartbeats · ux:Long runs can't be cancelled, abort never reaches the AI calls, and timeouts give a non-actionable message · platform:The render/refine chain puts up to ~6 AI attempts into one 300 s function with no timeout, no abort, and no partial results</sub>

<a id="cost-05"></a>
#### COST-05: Every refine regenerates the shopping list with a vision LLM call and keeps the refine bar locked until it returns

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:247-255`, `src/components/refine-bar.tsx:26-35`, `src/lib/ai/shopping.ts:31-47`

**Problem**

After /api/refine, handleRefine always calls /api/shopping-list with `{ designBrief, renderUrl: refined.imageUrl }`. That is one vision LLM call carrying the ~1 MP render plus about 1.9k text tokens (system prompt, pretty-printed brief, rules). RefineBar's `loading` covers both calls, so the bar stays locked until the list returns.

**Impact**

Every refine pays for an extra LLM call and several seconds of locked UI, even for tweaks like 'warmer' or 'less clutter' that don't change what you'd buy. Iterating multiplies the cost.

**Recommendation**

- After a refine, mark the list 'possibly outdated' and offer an 'Update shopping list' button.
- Alternatively, regenerate automatically only for furniture or budget intents (swap, replace, add, remove, cheaper, budget), or only after the last refine in a burst.
- Unlock RefineBar as soon as the image arrives and fetch the list in the background.
- Optionally produce the list inside the render/refine SSE stream from the in-memory image (see the downscaling finding).

<sub>Merged from: api-cost:Every refine regenerates the shopping list, using the original brief · performance:Every refine runs a critique, a possible re-render and a full shopping-list regeneration · ai-quality:Refinements never update the brief: shopping list goes stale, and the "Cheaper" and "Keep the sofa" chips can't do what they say · maintainability:Refinements never update the design brief, so the shopping list and later refines work from stale constraints</sub>

<a id="cost-06"></a>
#### COST-06: Vision-LLM calls get full-resolution inputs, and renders are stored, served and re-sent as multi-MB PNGs

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/prepare-image.ts:3`, `src/lib/ai/analyze.ts:49-59`, `src/lib/ai/plan.ts:62`, `src/lib/ai/critique.ts:54-67`, `src/lib/ai/shopping.ts:44-48`, `src/lib/ai/style-profile.ts:37-39`, `src/lib/ai/render.ts:100-110`, `src/lib/blob.ts:115-122`, `src/app/api/shopping-list/route.ts:28-30`, `src/components/restage-app.tsx:193-197`

**Problem**

The client prepares a single JPEG of up to 2048px (`MAX_EDGE_PX = 2048`, about 3 MP). The server passes it unchanged to analyze, plan, critique and style-profile.

renderRoom uploads `imageFile.uint8Array` without re-encoding, so the render is stored as the model's output format, typically PNG. In a scratch sharp benchmark, a 1536x1024 photo-like PNG was about 3.1 MB, versus about 0.4 MB as JPEG q88 or WebP q85.

Those PNG bytes go to the critique. After another client round trip, /api/shopping-list downloads the PNG from Blob again (urlToImageInput → downloadPrivateBlob with useCache: false) and sends it once more. sharp is already a dependency but is only used on image-model inputs.

**Impact**

The 'after' image costs about 3 MB of download per Generate and per refine. Every LLM call that carries the render includes about 4 MB of base64. The shopping list adds an extra round trip, a possible cold start and a Blob read.

The token saving from downscaling depends on the provider's tokenizer:
- OpenAI-style tokenizers already shrink images to a 768px short side, so there is no saving.
- Pixel-proportional tokenizers (Anthropic about w·h/750, Gemini 768px tiles, Qwen/DeepSeek-VL patches) bill about 2–4× more at 2048px than at 1024px.

**Recommendation**

- Add a `toAnalysisImage()` helper: sharp `resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).jpeg({quality:82})`.
- Use it for plan, critique, shopping and style-profile. Run analyze at 1024–1280, or keep 2048 if fixedElements recall drops (outlets, thermostats).
- Keep the at-most-2048px originals for generateImage.
- Re-encode renders to WebP or JPEG at about q88–90 before uploadRender. normalizeImageForGeneration already re-encodes refine inputs to JPEG q85, so this adds no new generation loss.
- Optionally generate the shopping list inside the render SSE stream from the in-memory image, sending the render event first.
- Confirm the saving with `result.usage.inputTokens`.

<sub>Merged from: api-cost:Analysis-only vision calls get full-resolution photos, and renders are stored as-is (typically PNG) · performance:Renders are stored and served as multi-MB PNGs, sent full size to the critique and shopping LLM calls, and re-downloaded for the shopping list</sub>

<a id="cost-07"></a>
#### COST-07: Prompts waste tokens: pretty-printed JSON, duplicated inventory and constraints, static rules after dynamic content, output fields the code overwrites, and no output caps

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/ai/plan.ts:47-53`, `src/lib/ai/critique.ts:43-46`, `src/lib/ai/shopping.ts:33-34`, `src/lib/ai/analyze.ts:41-44`, `src/lib/ai/analyze.ts:68-81`, `src/lib/ai/schemas.ts:16-19`, `src/lib/ai/schemas.ts:77-78`

**Problem**

- **Pretty-printed JSON.** plan, critique and shopping use `JSON.stringify(x, null, 2)`. On representative briefs that is 4,884–4,953 chars pretty vs 3,909–3,917 compact, about 21% smaller.
- **Duplicated plan input.** The plan prompt includes the whole inventory, including constraintsFromUser, and then repeats Style, Budget, Region, Use and the keep list.
- **Rule order.** The critique puts the static NON_NEGOTIABLE_RULES (about 660–700 tokens) after the per-request brief, so they can't be part of a cached prompt prefix.
- **Unneeded fields.** Shopping sends the whole brief (lighting, windows, architecture) though it only needs style, budget, region, keep list and strategy.
- **Overwritten output.** Analyze asks the model to output constraintsFromUser, `keepItems: []` and `keep=false` on every furniture item, window and door; the code overwrites all of it (analyze.ts:68-81).
- **No caps.** No call sets maxOutputTokens, and the shopping list has no item cap.

**Impact**

Indentation alone wastes about 20% of these tokens, and task-specific projections would cut critique and shopping text by 50–60%. Analyze wastes 100+ output tokens per call, and output tokens are priced higher. Providers with implicit prefix caching can't give a discount. The amounts are small next to image costs, but the fixes are nearly free.

**Recommendation**

- Serialize compact JSON and send each task only the fields it uses.
- Put static text (system prompt plus rules) first, as `instructions`. The current ~340-token system prompt is below most caching minimums unless the rules move in with it.
- Remove fields the code overwrites from the LLM output schemas and set them in code.
- Cap the shopping list at about 8–12 new items, and set maxOutputTokens per task.

<sub>Merged from: api-cost:Prompts waste tokens: pretty-printed JSON, duplicated inventory and constraints, and output fields the code overwrites · performance:Prompts pretty-print JSON and put static rules after per-request content</sub>

<a id="cost-08"></a>
#### COST-08: Room analysis depends only on the photo, yet it waits for the brief, is never cached, and Re-analyze pays for the full call again

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/ai/analyze.ts:26-36`, `src/lib/ai/analyze.ts:68-81`, `src/components/restage-app.tsx:74`, `src/components/restage-app.tsx:156-166`, `src/components/restage-app.tsx:519-526`

**Problem**

The analyze prompt includes style, budget, region and function 'for room type and constraints only', but those outputs are overwritten: `constraintsFromUser` at analyze.ts:74-80, and roomType plus constraints at restage-app.tsx:156-166. The inventory is effectively a function of the photo and floor plan alone. Still, `canAnalyze` requires `brief.function` to be filled in, and 'Re-analyze' re-runs the vision call on an unchanged photo.

**Impact**

Repeat analysis calls are wasted, and analysis can't start until the form is filled, which adds perceived latency.

**Recommendation**

- Remove the brief from the analyze prompt, keeping at most a roomType hint.
- Cache the inventory by SHA-256 of the prepared image bytes plus the floor plan, in client memory or Blob.
- Start analysis in the background as soon as the photo is uploaded, while the user fills in the brief.

<sub>Merged from: ai-quality:Room analysis depends only on the photo, but it waits for the brief, isn't cached, and Re-analyze pays for the full call again · api-cost:No step-level retry or reuse: a failed step forces paid upstream steps to run again</sub>

### Correctness & bugs

<a id="bug-01"></a>
#### BUG-01: Fuzzy keep-item matching links unrelated furniture, so the user cannot keep one piece and replace a similar or nearby one

**Severity:** 🟠 High · **Effort:** M · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/ai/keep.ts:6-12`, `src/lib/ai/keep.ts:14-16`, `src/lib/ai/keep.ts:18-30`, `src/lib/ai/keep.ts:43-75`, `src/components/keep-picker.tsx:69-79`, `src/components/keep-picker.tsx:81-93`, `src/components/restage-app.tsx:155-171`, `src/components/restage-app.tsx:534-545`, `src/app/api/plan/route.ts:12-17`, `src/lib/ai/plan.ts:21-28`, `src/lib/ai/prompt.ts:4-28`, `src/lib/ai/shopping.ts:41`, `src/lib/ai/analyze.ts:43-45`

**Problem**

`itemsMatch` returns true in two cases:
- either normalized name is a substring of the other (`left.includes(right) || right.includes(left)`)
- both names contain any alias from the same group (`group.some((alias) => left.includes(alias)) && group.some(...)`)

The alias groups include [sofa, couch, sectional, settee, loveseat, bank], [rug, carpet, ...], [armchair, accent chair, lounge chair, ...] and [tv, television, media console, tv unit, tv cabinet, sideboard]. The analyze prompt asks for names that include position ('grey L-shaped sectional along the right wall'), so names often mention neighbouring objects.

Four dimensions ran keep.ts unchanged in scratch tests:
- Keeping 'grey L-shaped sectional along the right wall' also keeps 'green velvet loveseat under the window', 'black floor lamp beside the sofa', 'abstract canvas art above the sofa', 'beige throw pillows on the sofa' and 'banker's desk lamp' (via the alias 'bank').
- 'black TV on the wall' keeps 'oak sideboard'.
- 'round oak coffee table' keeps 'jute rug under the coffee table'.
- 'rattan accent chair' keeps 'leather lounge chair' and 'bouclé armchair'.
- 'side table' keeps 'white bedside table'.
- 'frugal shelf' matches 'rug'.
- A typed extra 'lamp' keeps every lamp.

`uniqueKeepItems(['grey sectional','green loveseat'])` returns ['grey sectional']. The loveseat is dropped from constraintsFromUser.keepItems, but its keep flag stays true.

`normalizeItemName` uses `/[^a-z0-9]+/g`, so non-Latin names such as 'ソファ' normalize to '' and `itemsMatch(x, x)` is false. Such an item is never shown as checked and can't be unchecked.

KeepPicker uses the same predicate for isKept and for unticking (`keepItems.filter((keep) => !itemsMatch(item, keep))`). applyKeepItems applies it again on the server (plan.ts:21). The inflated list therefore becomes the HARD KEEP LIST in the plan, the render prompt, the critique and the shopping-list exclusions.

**Impact**

In most rooms (two seating pieces, several rugs or chairs, a TV on a sideboard):
- pieces the user wanted replaced stay in the render and drop off the shopping list
- unticking one row unticks others
- the critique can fail a correct render for 'replacing' a wrongly kept item, which triggers an extra paid re-render

This breaks the core 'What should stay?' step.

**Recommendation** (verifier-corrected)

**Select rows by identity and stop deriving `keep` from names.**

1. **KeepPicker** (keep-picker.tsx): take `keptIndices: number[]`, `extras: string[]` and `onChange({ keptIndices, extras })`.
   - `kept = keptIndices.includes(index)`, and toggling flips only that index.
   - `addManualItem` ignores a typed name that equals an existing row or extra under exact normalized comparison.
   - Optionally, if the typed name matches exactly one row by whole-word alias tokens, tick that row instead of adding an extra.
   - Removing an extra filters by exact string.
   - Keep the aliases, including the Dutch "bank", for this typed-extra path only, and match them on word tokens (`tokens.includes('bank')`), not substrings.

2. **restage-app.tsx**: hold the selection in state and reset it on analyze and on photo change. In `handleGenerate`, send:
   ```ts
   inventory: { ...inventory, existingFurniture: inventory.existingFurniture.map((p, i) => ({ ...p, keep: keptIdx.has(i) })), ... },
   keepItems: extras
   ```

3. **keep.ts** `applyKeepItems(inventory, extras)`: trust the incoming `piece.keep` flags, which `roomInventorySchema` already validates, and do no name matching.
   ```ts
   const norm = (v: string) => v.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
   const rows = new Set(inventory.existingFurniture.map(p => norm(p.item)));
   const seen = new Set<string>();
   const cleanExtras = extras.map(s => s.trim()).filter(s => { const k = norm(s) || s; if (!s || rows.has(k) || seen.has(k)) return false; seen.add(k); return true; });
   const keptNames = inventory.existingFurniture.filter(p => p.keep).map(p => p.item);
   return { ...inventory,
     existingFurniture: [...inventory.existingFurniture, ...cleanExtras.map(item => ({ item, keep: true, note: 'Added by user' }))],
     constraintsFromUser: { ...inventory.constraintsFromUser, keepItems: [...keptNames, ...cleanExtras] } };
   ```
   Deriving `constraintsFromUser.keepItems` from the kept rows plus extras makes the "Kept:" chips (restage-app.tsx:534-545) and the shopping exclusion (shopping.ts:41) match the HARD KEEP LIST. Optionally cap extras with `z.array(z.string().max(200)).max(30)` in the plan route.

4. **Do not change the analyze schema.** Skip both the `id` field and the name/location split. Positional names help the render and critique pick the right object, so keeping them costs no quality.

5. **Tests (optional):** add vitest with cases covering sectional vs loveseat/lamp, coffee table vs rug, and extra dedup. The repo has no test runner yet.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, high**

I read keep.ts, keep-picker.tsx, restage-app.tsx, the plan route, plan.ts, prompt.ts, analyze.ts, shopping.ts, critique.ts and the render route. I then ran the unmodified keep.ts logic in scratch scripts, including a copy of KeepPicker's toggle logic.

The core defect reproduces exactly as reported. The only change I made to the copy was stubbing the two type imports.
- itemsMatch returns true for every pair the finding lists.
- Other pairs also match: 'black TV' matches 'low white media console' and 'wooden tv stand'. 'grey sofa' matches 'walnut sofa table behind the couch'. 'jute rug' matches 'sheepskin carpet by the bed'.

Picker simulation on a realistic inventory:
- Ticking the sectional also shows the loveseat, 'floor lamp beside the sofa' and 'art above the sofa' as checked.
- Unticking the loveseat empties keepItems, so the sectional is unticked too.
- Ticking only the loveseat re-checks the whole group.
- Ticking 'black TV on the wall' checks 'oak sideboard below the TV'. The server's applyKeepItems (plan.ts:21) then sets keep=true on both, while constraintsFromUser.keepItems is only ['black TV on the wall'].
- uniqueKeepItems(['grey sectional','green loveseat']) returns ['grey sectional'], but the loveseat's keep flag stays true.

The inflated keep flags reach several places:
- the plan's HARD KEEP LIST (plan.ts:22-28, 42-43)
- the render and refine prompts through keptFurniture (prompt.ts:5-28)
- the critique, via the brief JSON (critique.ts:39,44)
- the shopping list, via the brief JSON with keep:true (shopping.ts:34). Its rule line at shopping.ts:41 lists only the de-duplicated keepItems.

Keeping the TV while replacing the stand, or keeping the sofa while replacing the loveseat or lamp, are ordinary living-room choices. Because they can't be made, this is a common-flow breakage of the core 'What should stay?' step, so high severity holds. The analyze prompt (analyze.ts:43-45) invites names that mention position, which makes neighbour-referencing names likely.

Where the finding is overstated or imprecise:
1. The critique effect is secondary. Render and critique get the same inflated keep list, so the critique only fails a render when the image model disobeys the prompt and replaces a wrongly kept piece. That case is plausible and triggers the second render at render/route.ts:85-96, but it is not a routine extra cost.
2. The non-Latin claim needs precision. normalizeItemName('ソファ') is '', so itemsMatch(x, x) is false and that furniture row can never show as checked. Clicking it appends the string, which then shows as an 'extra' row that can't be unticked, because the filter at keep-picker.tsx:78 removes nothing. Repeated clicks add duplicates with duplicate React keys (`extra-ソファ`). On the server the piece stays keep=false and a duplicate 'Added by user' entry is appended. Because the analyze prompt is in English this is an edge case (low).
3. Missed UI effect: the 'Kept:' chips (restage-app.tsx:534-545) show only the de-duplicated keepItems, so the linked items that are actually kept are not listed.

Where the recommendation needs correcting:
- The aliases exist on purpose. They map typed text like 'couch' or the Dutch 'bank' onto a detected 'grey L-shaped sectional' (the default region comes from navigator.language and supports NL). If alias matching is dropped entirely, a typed 'couch' becomes an 'Added by user' line while the actual sectional stays keep:false, which gives the plan and render models contradictory instructions. Keep alias matching, but run it once when an extra is typed, not on every render, toggle and server call.
- Splitting name and location in the analyze schema isn't needed once selection works by identity. It would also remove disambiguating context ('armchair by the window') that the render prompt uses, so I don't recommend it.

**Severity/fix lens: partially-confirmed, high**

I read keep.ts, keep-picker.tsx, restage-app.tsx, plan.ts, prompt.ts, analyze.ts, shopping.ts, critique.ts and the plan route. I copied keep.ts unchanged into the scratchpad and ran it, along with a simulation of the KeepPicker toggle logic.

**The mechanism is real, and the reported cases reproduce exactly:**
- The sectional matches the loveseat, the floor lamp beside the sofa, the art above the sofa, the pillows on the sofa, and "banker's desk lamp".
- The TV matches the sideboard.
- The coffee table matches the rug under the coffee table (through the "coffee table" alias group, not the substring rule).
- The accent chair matches the lounge chair and the armchair.
- The side table matches the bedside table.
- "frugal shelf" matches "rug", and "rug" matches "drugstore".
- `uniqueKeepItems(['grey sectional','green loveseat'])` returns `['grey sectional']`.
- "ソファ" normalizes to `''`.

**The UI simulation confirms the cascade:**
- Ticking the sectional checks sectional, loveseat and lamp together (`XXX___`).
- Clicking the lamp then empties `keepItems`, so the sectional is unticked too.
- A non-Latin typed extra shows as kept in the extras list but cannot be removed, because `itemsMatch` returns false.

The server uses the same predicate at keep.ts:52, so the linked rows get `keep: true`. They then become the HARD KEEP LIST in plan.ts:22-28 and prompt.ts:5-23, which is used for both render and refine. The default room type is "living room", the sofa is the most likely item to keep, and the analyze prompt (analyze.ts:43-45) asks for names that include position. So this hits the core flow often, and **high is justified**, though at the lower edge of the rubric.

**Where the finding is mis-described or overstated:**
- **The `uniqueKeepItems` "loveseat dropped" state cannot happen through the UI.** `isKept` (keep-picker.tsx:74, 83) blocks adding a second linked item, so it only happens with a hand-crafted API call.
- **It misses the real inconsistency that does happen in the UI.** `constraintsFromUser.keepItems` holds only the names the user explicitly ticked (keep.ts:72). That list feeds the "Kept:" chips (restage-app.tsx:534-545) and the shopping-list exclusion text (shopping.ts:41). Meanwhile the render gets the larger set of rows flagged `keep: true`, so the results page understates what was kept.
- **The critique-driven extra re-render is plausible but unverified.** The render is told to keep the linked items, so a failure is less likely than implied.
- **The non-Latin case matters only for typed extras.** The analyze prompt is English, so the LLM's names are Latin script. This part is low severity.

**Where the recommendation needs correction:**
1. **No schema `id` is needed.** Adding one costs output tokens and risks duplicate ids. The inventory, including a per-row `keep` boolean, already round-trips to /api/plan (plan route line 13, `roomInventorySchema`). Selecting by row index and sending the flags is enough.
2. **Don't split name and location.** Positional names help the image model and the critique find the exact object to preserve. Once selection is by identity, the split has no correctness benefit and puts output quality at risk.
3. **Don't drop the "bank" alias.** It is the Dutch word for sofa, deliberately grouped with vloerkleed, salontafel and fauteuil. The owner and default region detection are Dutch (restage-app.tsx:31). The fix is whole-word matching, used only when mapping a typed extra onto a row.
4. **Removing alias matching from `applyKeepItems` is right.** The server should trust the row flags and not re-derive them from names.

</details>

<sub>Merged from: ux:Keep-list fuzzy matching links unrelated furniture: ticking one item also keeps (or unticks) others · correctness:Keep-item name matching ties unrelated pieces together, so the user cannot keep one item and replace a similar one · ai-quality:Fuzzy keep-item matching over-matches: keeping the sofa also keeps the lamp, art and pillows beside it, and they can't be unchecked separately · maintainability:keep.ts fuzzy matching marks the wrong furniture as kept, and the UI can't keep one sofa without the other</sub>

<a id="bug-02"></a>
#### BUG-02: The optional quality gate can throw away an already-paid render: no fallback, no partial result, no time budget

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/app/api/render/route.ts:67-101`, `src/app/api/refine/route.ts:68-102`, `src/lib/ai/render.ts:58-63`, `src/lib/ai/render.ts:100-110`, `src/lib/ai/critique.ts:17-74`, `src/lib/api.ts:41-51`, `src/lib/client-api.ts:112-121`, `src/components/restage-app.tsx:54`, `src/components/restage-app.tsx:128-205`, `src/lib/ai/styles.ts:57`

**Problem**

runRender and runRefine first await renderRoom. By then the image is already generated and uploaded (render.ts:108, `uploadRender`). They then await `critiqueRender(...)` and possibly `result = await renderRoom({... currentRender: result.image})`, with no try/catch around either.

streamStatus sends `{done: true, result}` only at the very end, and any throw sends only `{error}`. handleGenerate then calls setError and never calls setRenderResult.

generateImage passes neither maxRetries nor abortSignal. With the SDK default of 2 retries plus retries on empty results, render + critique + re-render can reach about 9 model attempts inside one `maxDuration = 300` invocation. If the platform kills the function, the client only sees 'Stream ended without result'.

When a re-render replaces the first image, the first blob is orphaned: it is never returned or deleted. The same happens on failure. qualityGate defaults to true (restage-app.tsx:54) for both generate and refine.

**Impact**

Any of these discards a successful paid render:
- NoObjectGeneratedError from the experimental designer model
- a gateway 5xx after retries
- NoImageGeneratedError on the corrective render
- a 300 s timeout

The user sees an error. Clicking Generate again re-runs plan + render (+ critique), roughly doubling spend. Orphaned renders accumulate in Blob.

**Recommendation** (verifier-corrected)

**1. Core fix (S).** Treat the quality gate as best-effort in both routes. Add an optional `abortSignal` parameter to `renderRoom` and `critiqueRender` and pass it through to generateImage and generateObject.

```ts
// render/route.ts (mirror in refine/route.ts)
const deadline = Date.now() + (maxDuration - 20) * 1000; // margin for upload + stream close
const left = () => deadline - Date.now();
...
const first = await renderRoom({ instruction, roomImage: roomImageInput, styleReferences: styleRefInputs });
if (!qualityGate) return { ...toClientRenderResult(first), qualityCheck: "off" };
try {
  send?.("Running quality check…");
  const critique = await critiqueRender({ ..., abortSignal: AbortSignal.timeout(Math.max(1000, left() - 5000)) });
  if (critique.passed || !critique.correctiveInstruction)
    return { ...toClientRenderResult(first), qualityCheck: "passed" };
  if (left() < RENDER_BUDGET_MS) // e.g. 90_000; skip the fix rather than get killed
    return { ...toClientRenderResult(first), qualityCheck: "skipped" };
  send?.("Auto-refining based on quality check…");
  const fixed = await renderRoom({ ..., currentRender: first.image, abortSignal: AbortSignal.timeout(left()), maxRetries: 1 });
  after(() => deleteBlobs([extractBlobPathname(first.imageUrl)!]).catch(() => {})); // optional; the first render was never shown
  return { ...toClientRenderResult(fixed), qualityCheck: "corrected" };
} catch (err) {
  console.warn("quality gate failed, returning first render", err);
  return { ...toClientRenderResult(first), qualityCheck: "skipped" };
}
```

- Keep the default retries on the primary render so the must-have step stays resilient. Lower retries only on the optional corrective render.
- The deadline abort does not save money the provider has already spent. What it buys is a chance to return the first render before Vercel's 300 s kill.
- On the client, when `qualityCheck === "skipped"`, show a small note: "Quality check unavailable, showing first render".
- Output quality is unchanged whenever the gate succeeds. It only improves what the user gets when the gate fails.

**2. Client, stop re-planning (S).** In handleGenerate, skip /api/plan when `designBrief` is non-null and its `constraintsFromUser.keepItems` and the selected style still match the current `brief.keepItems` and `selectedStyleId`. Alternatively, show a "Retry render" button that reuses the saved `planned` brief. Re-plan only when the inputs changed.

**3. Optional (M).** Either change is optional:
- Extend streamStatus/callApi with a `partial` event that shows the first render while the check runs.
- Move the critique and correction into a separate client-initiated request that reads the render from Blob, so it gets its own 300 s budget.

Pick either "return both images and let the user choose" or "delete the superseded blob", not both.

**4. Low priority.** Uploading concurrently with the critique saves only about 1 s. Orphaned-blob cleanup is minor, because the app never deletes any render.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced the whole path, checked the AI SDK code in node_modules/ai 7.0.99, and ran a scratch simulation. The main mechanism is real.

1. Both routes call renderRoom first, and it uploads the image (render.ts:108). They then await critiqueRender and possibly a second renderRoom with no try/catch (render/route.ts:77-96, refine/route.ts:77-96).
2. streamStatus only sends `{done, result}` after the whole handler returns (api.ts:42-45); any throw sends only `{error}` (api.ts:46-51).
3. callApi throws on `payload.error` (client-api.ts:112). handleGenerate already cleared renderResult (restage-app.tsx:134) and never sets it, so the good first render is lost.
4. The simulation, which copies streamStatus and callApi, prints "client error: No object generated…" while the first render URL is uploaded but never returned.
5. After the failure, hasResults is false and showKeepStep is true (restage-app.tsx:76-77). The only retry is "Generate redesign", which clears designBrief (line 133) and always calls /api/plan again (lines 153-173) before rendering. So a retry repeats the plan, the render and the critique.
6. qualityGate defaults to true on the client (restage-app.tsx:54) and on the server (render/route.ts:31, refine/route.ts:31).

Library claims I verified:
- generateImage accepts maxRetries and abortSignal. Both are unset here, so the default is 2 retries (index.js:2832-2863). It also retries empty results through RetryableNoImageResultError, then throws NoImageGeneratedError (index.js:12650-12776).
- generateObject also defaults to 2 retries on retryable API errors. NoObjectGeneratedError comes from parsing and is not retried.
- So "about 9 attempts" is correct as a worst case: 3 + 3 + 3.

What is overstated or mis-described:
- **Timeout:** The 300 s timeout is a tail risk, not a common one. The default IMAGE_MODEL is google/gemini-2.5-flash-image, which normally finishes render, critique and re-render well under 300 s. Only retry backoff, a hung request, or switching to gpt-image at high quality comes close.
- **Timeout symptom:** A mid-stream kill surfaces as either "Stream ended without result" or a fetch network error, not always the former.
- **Orphaned blobs:** Nothing in the codebase ever deletes anything under renders/. deleteBlobs is only called for styles (styles.ts:57). The superseded render is one more file in a store with no render lifecycle at all, not a new leak.
- **Refine:** handleRefine does not clear renderResult, so the previous render stays on screen. Only the paid refinement is lost, which makes refine less harmful than generate.
- **Recommendation errors:**
  - `maxRetries: 1` on the primary render would reduce resilience. Gemini sometimes returns no image, and the SDK's empty-result retry exists for exactly that.
  - "Return both images and let the user choose" contradicts "delete superseded blobs".
  - A cached-plan retry must be invalidated if the user changes keep items, style or brief on the keep step that reappears after the failure.
- **Effort:** The try/catch fallback is S. Streaming the partial result and returning both images is closer to M.

Severity: the happy path works, and a failure needs an intermittent upstream error: a critique parse failure on the experimental designer model, a gateway error after retries, an empty result on the corrective render, or a rare timeout. So this is not breakage in a common flow. But every generation carries the exposure by default, and each occurrence wastes a paid render and forces a full re-plan and re-render. That makes it medium, not high: a meaningful, cheap-to-fix defect.

**Severity/fix lens: partially-confirmed, medium**

I read both routes, render.ts, critique.ts, api.ts streamStatus, client-api.ts callApi, restage-app.tsx, blob.ts and env.ts. I also read generateImage, prepareRetries and retryWithExponentialBackoff in the installed ai@7.0.99 bundle, and after.md in the bundled Next 16 docs.

**What is real:**
- `renderRoom` generates the image and then uploads it (render.ts:100, 108) before the gate runs.
- The critique and the corrective re-render run inside `runRender`/`runRefine` with no try/catch (render/route.ts:77-97, refine/route.ts:77-97, which is 78-98 in refine). Any throw there reaches streamStatus's catch (api.ts:46-51). That catch sends only `{error}`, so the first image's URL never reaches the client.
- handleGenerate sets designBrief (restage-app.tsx:174) and then fails at the render call (178). The catch at 202-203 sets only the error. `hasResults` stays false, so the keep step and the Generate button come back.
- Clicking Generate again clears designBrief (133) and calls /api/plan again (153). That is a real re-spend.
- On refine, the old render stays on screen, but the new render the owner paid for is lost.
- Neither generateImage (render.ts:58-63) nor generateObject (critique.ts:22) gets maxRetries, abortSignal or a timeout. The SDK default is maxRetries=2, with 2 s then 4 s backoff (index.js:2837, 2812-2816). The worst case is 3 calls x 3 attempts = 9.

**What is overstated or mis-described:**
1. Empty-image retries are not extra attempts on top of the 2. RetryableNoImageResultError is an `additionalRetryableError` inside the same maxRetries budget (index.js:12677-12711). So 9 is the ceiling, not the typical case.
2. Hitting the 300 s timeout is realistic only with a gpt-image-class IMAGE_MODEL at quality "high". env.ts:32-35 hints at that setup. With the default google/gemini-2.5-flash-image, two renders plus a critique normally finish well under 300 s.
3. The orphaned-blob impact is minor. The app never deletes any render: the only delete is in styles.ts:57. Every render piles up anyway, and the gate adds at most one extra blob per corrected render.
4. The whole problem only appears when the optional second stage fails after the SDK's own retries, or on a timeout. The loss is one render plus one plan call, which is bounded. That makes it a failure-path resilience defect ("noticeable defect / meaningful improvement"), so medium, not high. It would move toward high only if the owner runs gpt-image high quality, where timeouts become likely.

**Problems in the recommendation:**
- `maxRetries: 1` on the primary render gives up resilience and does not bound time well. A deadline-based abortSignal is the better tool.
- Aborting does not refund cost the provider has already incurred. It only lets the route return the first render before Vercel kills the function.
- "Return both images and let the user choose" contradicts "delete the superseded blob". Pick one.
- "Retry only /api/render" must check that keepItems and the style are unchanged. The keep step is re-shown and editable after a failure, so a changed keep list still needs a new plan.
- `after()` is valid in Next 16 route handlers (after.md; it runs until maxDuration via the platform). But deleting blobs is optional polish, not the core fix.

</details>

<sub>Merged from: api-cost:A failed or timed-out quality gate throws away the already-paid render · ux:Optional quality check can throw away a successful, paid render · correctness:If the optional quality gate fails, the successful paid render is thrown away, and retrying re-runs the plan · platform:The render/refine chain puts up to ~6 AI attempts into one 300 s function with no timeout, no abort, and no partial results</sub>

<a id="bug-03"></a>
#### BUG-03: PDF floor plans, which the UI advertises, reach the vision model labelled image/jpeg and uncompressed

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:325-332`, `src/components/restage-app.tsx:104-106`, `src/lib/client-api.ts:135-144`, `src/components/upload-zone.tsx:36-58`, `src/lib/ai/images.ts:12-24`, `src/lib/ai/images.ts:26-44`, `src/app/api/analyze/route.ts:29-31`, `src/lib/ai/analyze.ts:35`, `src/lib/ai/analyze.ts:53-59`, `src/lib/media-type.ts:27-78`, `src/lib/client-api.ts:11-12`, `node_modules/ai/dist/index.js:1777-1785`

**Problem**

The floor-plan UploadZone shows 'Image or PDF for dimensions' with `accept="image/*,.pdf"`. `fileToPreparedDataUrl` uses `isPdf(file) ? file : await prepareImageForUpload(file)`, so a PDF goes out as `data:application/pdf;base64,…` with no size check.

dataUrlToImageInput keeps `application/pdf`, but toFilePart rewrites it: `mediaType: image.mediaType.startsWith("image/") ? image.mediaType : "image/jpeg"`. The AI SDK's convertPartToLanguageModelPart only overrides a declared type when the bytes look like an image (detectMediaType with topLevelType 'image'). `%PDF-` bytes don't, so the provider receives PDF bytes declared as JPEG.

The prompt meanwhile says 'A floor plan image is also provided — prefer its dimensions…' (analyze.ts:35). The floor plan is only read in handleAnalyze, so adding or changing it after analysis is silently ignored until the user clicks Re-analyze.

**Impact**

A user who follows the UI and uploads a PDF gets one of two outcomes, and pays for the analyze call either way:
- The analysis fails with a cryptic provider error.
- The plan is silently ignored while the model is told to trust it, so dimensions are made up.

Large PDFs also hit the body limit, which shows up as 'That photo is too large'.

**Recommendation** (verifier-corrected)

Make PDFs fail clearly before any AI call, and only then decide whether to support them properly.

**1. Server guard (S)**
- In src/app/api/analyze/route.ts, after `dataUrlToImageInput(floorPlan)`, sniff the bytes with the existing `sniffImageKind` from src/lib/media-type.ts.
- If it returns `null`, respond with `apiError("Floor plan must be an image (JPEG, PNG or WebP). For a PDF, export or screenshot the page with the plan.", 400)`.
- Harden `toFilePart` (src/lib/ai/images.ts:12-24) as defence in depth. Derive `mediaType` from `sniffImageKind(data)` when it matches, and throw when neither the bytes nor the declared type is an image, instead of relabelling as `image/jpeg`. This also covers the fetch fallback in `urlToImageInput`, which can return non-image content types.

**2. Client, minimal version (S)**
- In src/lib/client-api.ts, drop the PDF passthrough.
- Throw a clear message for PDFs: `if (isPdf(file)) throw new Error("PDF floor plans aren't supported yet — upload an image or screenshot of the plan.")`. Without the passthrough, a PDF would already fail in `prepareImageForUpload` with "Couldn't read that image. Try JPEG or PNG."
- Change restage-app.tsx:327/331 to `description="Image for dimensions"` and `accept="image/*"`.
- Both the client and server checks are needed, because dragging a file onto UploadZone ignores `accept`.

**3. Client, full version (M, optional; improves quality)**
- Keep PDF support by rasterising page 1 in the browser. Use `const pdfjs = await import("pdfjs-dist")`, with the worker served from `public/` so it doesn't depend on the bundler. Render with a scale that gives a long edge of about 2048 px.
- Export PNG rather than JPEG so thin lines and dimension text stay legible. This needs a mime or quality parameter on `prepareImageForUpload`, which currently hard-codes `image/jpeg`.
- This keeps the advertised feature and gives the model a real plan.
- Do not rely on sharp server-side: the installed prebuilt has no PDF input.
- Forwarding `mediaType: "application/pdf"` unchanged is only valid if the configured DESIGNER_MODEL accepts PDFs through the Gateway. That is unverified for the default `deepseek/deepseek-v4-flash-vision-exp`, so it should not be the primary fix.

**4. UX polish (low)**
- When `floorPlanFile` changes while `inventory` is set, show "Floor plan changed — Re-analyze to use it".
- Make the 413 message in `parseApiError` generic ("That file is too large…"), since it can fire for floor plans too.

None of this reduces AI output quality. Option 3 improves it by giving the model a readable plan.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced the path from start to finish and ran it through the real AI SDK and gateway provider code in node_modules. The core bug is real. I corrected the severity and part of the impact.

1. **The UI accepts PDFs.** restage-app.tsx:325-332 renders the floor-plan UploadZone with description "Image or PDF for dimensions" and `accept="image/*,.pdf"`.
2. **The client sends PDFs raw.** client-api.ts:135-144: `fileToPreparedDataUrl` returns `fileToDataUrl(isPdf(file) ? file : await prepareImageForUpload(file))`. A PDF goes out as `data:application/pdf;base64,...` with no resizing and no size check. The 4 MB cap in prepare-image.ts:99 only applies to images.
3. **The route decodes it.** route.ts:29-31 calls `dataUrlToImageInput`. The regex at images.ts:27 matches and `canonicalizeImageMediaType` keeps `application/pdf`.
4. **toFilePart relabels it.** analyze.ts:53-59 calls `toFilePart(floorPlan)`, and images.ts:20-22 rewrites any non-`image/` type to `"image/jpeg"`.
5. **The AI SDK does not undo this.** node_modules/ai/dist/index.js:1777-1785 (ai 7.0.99) only overrides the declared type when `detectMediaType({data, topLevelType:"image"})` finds a match. In @ai-sdk/provider-utils dist/index.js:895-921, `topLevelType:"image"` checks image signatures only. The `%PDF` signature is in `documentMediaTypeSignatures`, which is used only for `application`/undefined. So the type stays image/jpeg.
6. **The gateway sends it as JPEG.** @ai-sdk/gateway 4.0.80 `maybeEncodeFileParts` (dist/index.js:1521-1558) just base64-encodes the data.

**Reproduction.** A scratch script (scratchpad/pdf-probe.mjs) replicates images.ts and calls `generateObject` with `createGateway` and a capturing fetch. The body posted to the gateway contained `{"mediaType":"image/jpeg","data":{"type":"data","data":"JVBERi0x..."}}`, which decodes to `%PDF-1.4`.

Meanwhile the prompt says "A floor plan image is also provided — prefer its dimensions..." (analyze.ts:35).

**Secondary claims, both confirmed:**
- The floor plan is read only in handleAnalyze (restage-app.tsx:104-106). The upload zones stay visible during the keep step (`!hasResults`), and `onChange={setFloorPlanFile}` (line 330) does not clear `inventory`, unlike `resetFromPhotoChange`. A floor plan added or changed after analysis is ignored until Re-analyze (line 519-526).
- A 413 from the platform body limit is turned into "That photo is too large to upload..." by client-api.ts:11-12, which blames the photo rather than the PDF.

**Corrections:**
- **Outcome.** The most likely result is a hard failure of the whole analyze step, not a silently ignored plan. Providers usually reject bytes that don't decode as the declared image type with a 4xx. The route then surfaces that error through the SSE error payload (api.ts:46-51). I could not check what the gateway or DeepSeek does with it offline, so "silently ignored" is possible but not shown.
- **"Pays for the analyze call either way" is not substantiated.** A request rejected at input validation is normally not billed, and a 4xx is not retried by the SDK.
- **Severity.** This is an optional input with an easy workaround (upload a screenshot or PNG of the plan), in a single-owner app. It is a broken advertised feature on a side path, not a common-flow breakage, so medium rather than high.
- **Recommendation.** sharp 0.35.4 in node_modules has `format.pdf.input` = false and no magick, so rasterizing on the server with sharp is not possible. It has to happen in the browser, or PDFs must be rejected.
- **Existing helper.** `sniffImageKind` in src/lib/media-type.ts:27 can already be used for server-side validation.

**Severity/fix lens: partially-confirmed, medium**

The mechanism is real. I checked it end to end and reproduced it with a scratch script.

**Client side**
- The floor-plan UploadZone advertises PDFs: `description="Image or PDF for dimensions"` and `accept="image/*,.pdf"` (restage-app.tsx:325-332).
- handleAnalyze (restage-app.tsx:104-106) calls `fileToPreparedDataUrl`.
- For PDFs that function returns `fileToDataUrl(isPdf(file) ? file : await prepareImageForUpload(file))` (client-api.ts:141-144). The PDF is sent raw as `data:application/pdf;base64,...`, with no resize and no size check.

**Server side**
- The analyze route calls `dataUrlToImageInput(floorPlan)` (route.ts:29-31) without validating the media type.
- canonicalizeImageMediaType keeps `application/pdf`.
- analyze.ts:58 calls `toFilePart`, which rewrites any non-`image/` type to `image/jpeg` (images.ts:21-23).

**Library behaviour (ai@7.0.99)**
- `convertPartToLanguageModelPart` (node_modules/ai/dist/index.js:1777-1785) overrides the declared type only if `detectMediaType({topLevelType:'image'})` matches.
- The image signature table has no `%PDF` entry. `%PDF` exists only under `application`, in provider-utils `documentMediaTypeSignatures`. So `image/jpeg` survives.
- `@ai-sdk/gateway@4.0.80` `maybeEncodeFileParts` (dist/index.js:1521-1559) only base64-encodes the data and forwards the part unchanged.
- The scratch run (MockLanguageModelV4 + generateObject + a copy of toFilePart) printed `[{"mediaType":"image/jpeg","head":"%PDF-"}]`.
- analyze.ts:35 then tells the model a floor plan image is provided and that it should prefer its dimensions.

**What is overstated or needs correcting**
1. **Severity.** High is too strong. The floor plan is an optional input, and the common flow (room photo, analyze, render) is unaffected. The failure is bounded and recoverable: remove the PDF and retry. It wastes at most one analyze call per attempt, so there is no unbounded cost. This is an advertised feature that is fully broken in an optional sub-flow, which is medium under the rubric.
2. **"Pays for the analyze call either way."** I could not verify this. The likeliest outcome for major vision providers is a 400 invalid-image rejection, and such rejections usually aren't billed. The silent-ignore outcome is possible but I could not show it.
3. **Effort.** The pdfjs route is not S. It needs a new dependency, pdfjs worker setup under Next 16/Turbopack, and a PNG variant of prepareImageForUpload (which hard-codes JPEG, prepare-image.ts:88-97). The reject route is S.
4. **Missing: server-side rasterisation is not an option.** The installed sharp 0.35.4 prebuilt reports `sharp.format.pdf.input = {file:false, buffer:false, stream:false}`, so it cannot decode PDFs.
5. **Missing: dragging bypasses the `accept` filter.** `handleDrop` → `addFiles` (upload-zone.tsx:36-58) never filters by `accept`. Removing `.pdf` from `accept` alone does not stop PDFs, so the client and server checks are both needed.

**What holds**
- The 413 wording is real: `parseApiError` returns "That photo is too large..." for any 413 (client-api.ts:11-12). A PDF over about 3.3 MB (about 4.5 MB as base64) would show that message, which is misleading for a floor plan.
- The stale-floor-plan point is also real but minor. `setFloorPlanFile` (restage-app.tsx:330) doesn't reset `inventory`, unlike `resetFromPhotoChange`, and the floor plan is only read in handleAnalyze. A Re-analyze button exists, so a hint is enough.

</details>

<sub>Merged from: api-cost:PDF floor plans are sent to the vision model labelled image/jpeg · performance:PDF floor plans are sent to the model labelled image/jpeg, uncompressed · ux:Floor-plan PDFs are accepted but reach the model mislabelled as JPEG · correctness:PDF floor plans are sent to the vision model labelled image/jpeg · ai-quality:PDF floor plans (offered in the UI) are sent to the model labelled as image/jpeg · maintainability:PDF floor plans are sent to the vision model labelled as image/jpeg · platform:PDF floor plans are sent to the vision model labelled image/jpeg, so the advertised 'Image or PDF' floor plan cannot work</sub>

<a id="bug-04"></a>
#### BUG-04: GET /api/styles/[id] re-derives a stale profile synchronously; if derivation keeps failing, the style can't be opened and every open is billed again

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/app/api/styles/[id]/route.ts:15-37`, `src/lib/ai/styles.ts:64-92`, `src/lib/ai/styles.ts:117-142`, `src/components/my-styles-manager.tsx:117-132`, `src/components/my-styles-manager.tsx:149-156`, `src/components/my-styles-manager.tsx:326-330`, `src/components/my-styles-manager.tsx:494-508`, `src/lib/blob.ts:84-99`, `src/app/api/plan/route.ts:19-25`, `src/lib/ai/styles.ts:168-179`

**Problem**

GET runs `manifest = await regenerateIfStale(manifest)` inside its single try. That downloads every image and makes a paid generateObject call, with no streamed progress (the UI shows only 'Loading style…').

addImages treats derivation as best-effort: on failure it returns profileError and keeps the old signature. So after such an upload, or when AI wasn't configured at upload time, every later open repeats the full derivation.

Any error there returns a 500. handleOpen then runs `setError(...); setOpenId(null)`, so the detail view (images, add images, delete) can't be reached. The upload error path also calls `fetchStyle(openId)` (152), which triggers the same thing again. Nothing records that derivation already failed for this signature.

Separately, getJsonBlob catches every error and returns null. Transient Blob or network errors therefore look like 'Style not found' (404), make styles disappear from listStyles, and make /api/plan run silently without the style profile.

**Impact**

A style whose derivation keeps failing (too many or too large images, a schema mismatch, a gateway problem) is permanently locked. Each open costs up to 3 paid LLM calls over all images (counting retries) and can block for up to maxDuration 300 s. Even successful opens wait 10–60 s.

**Recommendation** (verifier-corrected)

Minimal fix. It unlocks the view and stops repeated billing without changing profile quality.

1. src/app/api/styles/[id]/route.ts: never let derivation fail the read.
```ts
let warning: string | undefined;
if (hasAiGateway()) {
  try { manifest = await regenerateIfStale(manifest); }
  catch (e) { warning = `Style profile could not be updated. ${e instanceof Error ? e.message : ""}`; }
}
return Response.json({ style: toClient(manifest), ...(warning ? { warning } : {}) });
```
Then make fetchStyle return `{ style, warning }` and call setWarning in handleOpen.

2. Record failed attempts.
- Add an optional `profileAttempt?: { signature: string; error: string; at: string }` to StyleManifest. Old manifests are unaffected, because getJsonBlob casts rather than parses.
- On derivation failure, write it from both the addImages catch and the GET catch.
- In regenerateIfStale, return early when `manifest.profileAttempt?.signature === signature && !opts.force`.
- Clear the field on success.
- Show "Profile update failed — Retry" in the detail view, calling it with force.

Better fix (M effort).

3. Make GET read-only. Return `profileStatus: 'none' | 'fresh' | 'stale' | 'failed'`, computed from computeStyleSignature compared with manifest.signature and profileAttempt.

4. Add `POST /api/styles/[id]/profile`, built on the existing streamStatus and regenerateIfStale(manifest, send, { force }).
- The client calls it automatically once when the status is 'stale'. This keeps today's self-healing behavior, so no quality is lost.
- Show a Retry button when the status is 'failed'.
- Abort it with an AbortController on "All styles", and pass request.signal as abortSignal to generateObject.
- Prefer this over after(). after() gives the client no progress or completion signal, so it would need polling, and it does not de-duplicate concurrent opens.

5. Prevent the lost update. Save the profile with @vercel/blob `put(..., { ifMatch: etag })`, which is supported in 2.8.0 (index.d.ts:405). Alternatively, reload the manifest just before saving and write profile and signature only if its image list still matches the signature that was derived.

6. getJsonBlob (really a separate issue).
- Call get() outside the blanket catch and return null only when the result is null, which means 404.
- Let BlobError and network errors propagate.
- Throw a "corrupt manifest" error when JSON.parse fails.
- In listStyles, use Promise.allSettled so one transient error does not hide styles or fail the whole list.
- In /api/plan, return an error instead of silently planning without the chosen style.

Related cost fix (separate finding): derive the profile only on the last upload batch. Send a `deriveProfile=false` form flag for the non-final batches at styles-client.ts:90-105.

<details><summary>Verification notes</summary>

**Combined lens: partially-confirmed, medium**

I traced GET /api/styles/[id], regenerateIfStale, addImages, the client open and upload handlers, and the library code in node_modules/ai 7.0.99 and @vercel/blob 2.8.0.

What holds up:
- GET awaits regenerateIfStale inside its only try block (route.ts:19-37). Any failure in downloading the images or in the generateObject call returns a 500 through apiError.
- handleOpen reacts to that with setError plus setOpenId(null) (my-styles-manager.tsx:126-128), so the detail view never renders. There is no per-image management anywhere in the UI.
- addImages swallows derivation errors (styles.ts:130-142). By then it has already saved the new images with the OLD profile and signature (styles.ts:117-120).
- Nothing records a failed attempt. The next open sees signature !== manifest.signature and runs the whole thing again: N blob downloads plus one vision call over every image.
- getJsonBlob's blanket catch (blob.ts:96-98) is real. @vercel/blob get() returns null only on 404 (index.js:177). Other statuses throw BlobError (index.js:181-183), and network errors throw from undici. All of these become null, which means "Style not found" (404), a style silently missing from listStyles (styles.ts:174-176), and /api/plan dropping the profile without a word (plan/route.ts:23-24).

Where the finding is wrong or overstated:
1. Delete still works. The grid has its own hover delete button (my-styles-manager.tsx:494-508). What is blocked is viewing the profile and images and adding images.
2. "Even successful opens wait 10-60 s" is wrong. A style whose profile is current returns at once (styles.ts:79-81). The wait happens only on a stale open.
3. A style becomes stale in only two ways: derivation failed at upload, or AI was not configured at upload. In the second case GET skips derivation entirely (route.ts:27). Once AI is configured, one open derives the profile. Re-derivation repeats on every open only while it keeps failing.
4. "Up to 3 paid LLM calls" is overstated. retry() wraps only model.doGenerate (ai index.js:14577). It retries only 408, 409, 429 and 5xx responses (index.js:434-436, 2823), and those failures are generally not billed. Schema validation runs outside the retry (index.js:14639). So a schema mismatch is one billed call per open, not three.
5. "Permanently locked" is true only for failures that repeat every time, such as a request that is too large for the model or exhausted credits. Schema mismatches from a non-deterministic LLM are intermittent. Images are prepared at up to 2048 px and JPEG quality 0.85 (prepare-image.ts:3-4), so a large folder sends a very large vision request. That makes a size-limit failure plausible, though I could not verify the model's actual limit.
6. The re-trigger at line 152 fires only when the upload itself throws, for example when a 300 s timeout cuts the stream and the client reports "Stream ended without result". It does not fire on a derivation failure, because addImages swallows those. Also, a failure there is swallowed, so it does not close the view.

Something the finding missed: because GET writes, it can lose data.
- A slow stale GET keeps running on the server after the user clicks "All styles". There is no AbortController, and request.signal is not passed to generateObject.
- Reopening starts a second derivation, so it is billed twice.
- The first response then sets openStyle and openLoading(false) (lines 125, 130), which shows the upload zone while the second GET is still running.
- An upload at that point saves the new images. When the second GET finishes, it writes {...oldManifest, profile, signature} (styles.ts:91). That drops the just-uploaded images from the manifest; their blobs are orphaned under uploads/style/{id}/.

Severity stays medium. This is a real UX break with repeated billing, but it happens only once derivation has failed, and it is bounded by the owner's own clicks. The getJsonBlob problem is a separate, lower-severity issue bundled into this finding.

</details>

<sub>Merged from: api-cost:Opening a style re-derives a stale profile synchronously; if derivation keeps failing, the style can't be opened and every open is billed again · performance:The style profile is re-derived from all images on every upload batch, every added image and when a stale style is opened · ux:Opening a style blocks on profile re-derivation, and a failed derivation locks the style's detail view · correctness:Opening a style regenerates its profile inside GET; if that fails, the style cannot be opened, and it is retried on every open · ai-quality:Style profile is re-derived after every upload batch, each time with every image; failed derivations retry on every folder open · maintainability:A style whose profile derivation fails can no longer be opened, and each attempt re-bills the LLM · platform:The style profile is re-derived for every upload batch with all images so far, and GET /api/styles/[id] runs the LLM on read and fails the open when derivation fails</sub>

<a id="bug-05"></a>
#### BUG-05: Concurrent uploads to a style overwrite each other's manifest and silently drop images; a late response can show the wrong style

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/my-styles-manager.tsx:134-162`, `src/components/my-styles-manager.tsx:410-424`, `src/components/upload-zone.tsx:7-15`, `src/lib/ai/styles.ts:32-36`, `src/lib/ai/styles.ts:64-92`, `src/lib/ai/styles.ts:94-143`, `src/lib/blob.ts:51-66`, `src/app/api/styles/[id]/route.ts:27-29`

**Problem**

The 'Add images' UploadZone has no disabled prop while uploadStatus is set, so a second drop starts a parallel uploadStyleImages.

addImages is a read-modify-write: loadManifest → upload → `saveManifest({...manifest, images: [...manifest.images, ...uploaded]})`. After its LLM call, regenerateIfStale saves `{...saved, profile, signature}` from its own snapshot. putRaw uses `allowOverwrite: true` with no `ifMatch`, although @vercel/blob 2.8 supports `ifMatch` and BlobPreconditionFailedError. GET /api/styles/[id], for example from a second tab, also writes through regenerateIfStale.

On the client, handleAddImages captures openId and calls `setOpenStyle(style)` after the await without checking that the user is still on that style.

**Impact**

The last write wins. One batch's images silently disappear from style.json and their blobs are orphaned under uploads/style/{id}/. Both requests pay for a full derivation. If the user opens style B in the meantime, the detail view shows A's data and its Delete button targets A.

**Recommendation**

- Disable the UploadZone and Delete while an upload runs, or queue new drops.
- Have loadManifest return the blob etag and save with `put(..., { ifMatch: etag })`. On BlobPreconditionFailedError, reload, re-apply the change and retry.
- In regenerateIfStale, reload the manifest before saving and store the profile only if the signature still matches.
- Ignore responses whose style id no longer equals the current openId (use a ref or request token).

<sub>Merged from: api-cost:Two uploads to the same style at once can silently drop images and run the derivation twice · ux:Style uploads re-derive the profile per batch, concurrent drops lose images, and one bad file fails the whole selection · correctness:Style manifest updates can overwrite each other and lose images; a late upload response can show the wrong style</sub>

<a id="bug-06"></a>
#### BUG-06: The refine quality gate is on by default but never sees the refine instruction, so it can revert the change the user asked for

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/app/api/refine/route.ts:36`, `src/app/api/refine/route.ts:78-98`, `src/lib/ai/critique.ts:11-15`, `src/lib/ai/critique.ts:32-48`, `src/lib/ai/prompt.ts:105-121`, `src/components/restage-app.tsx:54`, `src/components/restage-app.tsx:243`, `src/components/refine-bar.tsx:8-15`, `src/components/refine-bar.tsx:64`

**Problem**

The refine route defaults `qualityGate = true`, and the client toggle it receives also defaults to true. Every refine therefore runs generateImage, then a critique over 2 images, the full brief and the rules, then possibly a second generateImage.

The route calls `critiqueRender({ brief: parsedBrief.data, renderImage: result.image, roomImage: roomImageInput })` with no refine instruction. The critique judges the result 'against the Non-Negotiable Design Rules and the Design Brief', including rule 10 ('a limited, intentional palette') and 'If a keep-list sofa… was replaced, this is a critical fail'.

assembleRefineInstruction contains both the keep block ('Do not replace, restyle, reupholster, or move them') and 'Apply only this change: ${userInstruction}'. Meanwhile the RefineBar placeholder suggests 'swap the sofa for something in cognac leather'.

**Impact**

Requests like 'more color', 'cheaper' or swapping a kept sofa get flagged as deviations. The corrective re-render then pushes the image back toward the original. The user pays for 2 renders plus a critique and sees the request reversed. Each refine takes 2–4 model calls in sequence, often 1–3 minutes.

**Recommendation**

- For refine, default the gate off (the user already reviews each result), or limit it to blockers: architecture, camera and keep items.
- Pass the refinement history to the critique (`userRefinements: string[]`) with 'The user explicitly requested: …; do not flag changes that implement it.'
- When an instruction names a kept item, drop that item from the keep list for that call, or confirm with the user.
- Keep the gate on for the first Generate.

<sub>Merged from: correctness:The refine critique never sees the user's instruction, so the auto-fix can undo the requested change, and kept items cannot be refined at all · ai-quality:After a refine, the quality check compares against the original brief and can undo what the user asked for · performance:Every refine runs a critique, a possible re-render and a full shopping-list regeneration · api-cost:The critique call is heavy, re-renders on any fail, and on refine it doesn't know what the user asked for</sub>

<a id="bug-07"></a>
#### BUG-07: Transparent images turn black, and truncated images are silently grey-filled

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/prepare-image.ts:77-97`, `src/lib/ai/normalize-image.ts:16-23`

**Problem**

The client draws onto a transparent canvas and exports `image/jpeg`. Per the HTML canvas spec, transparent pixels are composited onto opaque black for formats without alpha, so a line-art floor plan PNG with a transparent background becomes black lines on black.

On the server, `sharp(...).removeAlpha()` drops the alpha channel; a scratch test gave RGB 0,0,0 for transparent pixels. With `failOn: "none"`, a 30%-truncated JPEG is accepted and grey-filled (bottom-right pixel 128,128,128), where sharp's default would reject it with 'premature end of JPEG image'.

**Impact**

Floor plans or style references with transparency become unreadable, and corrupt uploads are passed to paid model calls instead of failing with a clear error.

**Recommendation**

- Client: set `ctx.fillStyle = '#fff'` and call `fillRect(...)` before `drawImage`.
- Server: replace `.removeAlpha()` with `.flatten({ background: '#ffffff' })`.
- Use `failOn: 'warning'` (the default) and show a friendly error message.

<a id="bug-08"></a>
#### BUG-08: The only ESLint error is a redundant setState-in-effect: the region default is computed at module scope with the server's locale, and locale matching is by substring

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:28-45`, `src/components/restage-app.tsx:53`, `src/components/restage-app.tsx:69-71`

**Problem**

`defaultBrief.region = getDefaultRegion()` runs when the module loads, on both server and client. The `typeof navigator === "undefined"` guard never fires on the server, because Node ≥21 has a global navigator (here `node -e` prints `object en-US`). SSR therefore renders the server's locale, 'United States', while the client module uses the browser locale.

I checked react-dom 19: React does not report this mismatch. diffHydratedProperties skips the `value` attribute (react-dom-client.development.js:21370-21372). initInput, while hydrating, skips `element.value` but still sets `element.defaultValue = value` from the client prop (~1720-1721), which updates an untouched input's displayed value. The effect at lines 69-71 therefore re-sets the same value: it causes an extra render and the one ESLint error (react-hooks/set-state-in-effect).

The SSR HTML still ships the server-locale region until hydration. Locale matching is by substring: `locale.includes("fr")` maps fr-CA to France, and `includes("de")` / `includes("nl")` can match unrelated locales.

**Impact**

`npm run lint` fails for no functional reason, which blocks adding a lint gate to CI. There is a brief flash of the wrong region before hydration, and some locales get the wrong region, which drives the retailers and currency in the shopping list.

**Recommendation**

- Delete the effect.
- For a deterministic first paint, default region to '' and read the detected region with `useSyncExternalStore(noopSubscribe, () => regionFromLocale(navigator.language), () => null)`, using it as the placeholder and as the fallback on submit.
- Alternatively, read Accept-Language via `await headers()` in page.tsx and pass `defaultRegion` as a prop. This makes the page dynamic.
- Parse the locale with `new Intl.Locale(navigator.language).maximize().region` and map it to a country name.

<sub>Merged from: correctness:The only ESLint error (setState in effect) is a redundant effect and can be deleted; the suspected hydration mismatch does not occur · maintainability:Region default is computed at module scope using the server's locale; the flagged setState-in-effect is a workaround for it · platform:set-state-in-effect lint error comes from a module-level locale read that differs between SSR and the client</sub>

### AI output quality

<a id="aiq-01"></a>
#### AIQ-01: Render size and aspect ignore both the photo and the model: fixed 1536x1024, no aspectRatio, OpenAI-only options on a Gemini default, and a 3:2 object-cover slider

**Severity:** 🟠 High · **Effort:** M · **Verification:** ✅ Partially confirmed · **Auditor confidence:** medium

**Locations:** `src/lib/ai/render.ts:58-63`, `src/lib/env.ts:28-35`, `src/lib/ai/prompt.ts:69-70`, `src/lib/ai/prompt.ts:112`, `src/lib/ai/schemas.ts:48`, `src/lib/ai/analyze.ts:38`, `src/components/before-after-slider.tsx:45-70`, `src/components/restage-app.tsx:550-553`, `src/app/api/render/route.ts:71-96`, `src/app/api/refine/route.ts:71-96`, `.env.example:9-14`, `README.md:105`, `node_modules/@ai-sdk/gateway/dist/index.js:1743-1752`, `node_modules/@ai-sdk/gateway/dist/index.d.ts:7`, `node_modules/ai/dist/index.js:12801`

**Problem**

generateImage always receives `size: DEFAULT_IMAGE_SIZE` ('1536x1024') and `providerOptions: { openai: { quality: DEFAULT_IMAGE_QUALITY } }` ('high'). It never receives `aspectRatio`. The default IMAGE_MODEL is `google/gemini-2.5-flash-image`.

Provider options are keyed by the actual provider (node_modules/@ai-sdk/gateway/docs/00-ai-gateway.mdx:1574), so `openai.quality` cannot affect a Google model. The AI SDK image docs (node_modules/ai/docs/03-ai-sdk-core/35-image-generation.mdx:340) list gemini-2.5-flash-image as supporting aspect ratios only. The gateway client forwards `size` and `providerOptions` unchanged (dist/index.js:1741-1753). The code comments are written for OpenAI (env.ts:31 'gpt-image accepts...', normalize-image.ts:35).

The prompt demands 'same aspect ratio (${aspectRatio})' (prompt.ts:69, 112), and rule 1 says 'Same camera position, lens, and aspect ratio as the input' (constants.ts:26). That aspectRatio is an LLM guess (analyze.ts:38), even though prepare-image.ts already knows the real width and height (66-75).

The installed `GatewayImageModelId` union (index.d.ts:7) contains no google/* ids; I verified that gemini-2.5-flash-image appears only in the language-model union. README:105 says the model runs via generateText → result.files, but the code calls `imageModel()` + `generateImage`. The type cast hides an unvalidated IMAGE_SIZE ('auto' is listed in .env.example). generateImage warnings are discarded, since only `{ image }` is destructured.

BeforeAfterSlider hard-codes `aspect-[3/2]` with object-cover on both images (48, 58, 68). In the harness, a 900×1200 photo at 375px wide produced a 335×223 slider, cutting off the top and bottom quarters.

**Impact**

Portrait phone photos are common.
- On gpt-image models they get reframed into landscape. That breaks 'same camera', likely fails the critique, and triggers a paid re-render at the same forced size, which cannot fix it.
- On Gemini, IMAGE_SIZE and IMAGE_QUALITY do nothing, and the output aspect is uncontrolled.
- The slider center-crops before and after independently, hiding floor and ceiling and misaligning the halves.
- If IMAGE_MODEL is switched to gpt-image-1, the defaults are the most expensive tier (about $0.25 at high vs $0.063 at medium for 1536x1024), doubled by the gate.
- If the gateway image endpoint does not serve this Gemini id, every render fails. This depends on the production IMAGE_MODEL, which is not visible here.

**Recommendation** (verifier-corrected)

Fix this on the server with the bytes it already has, plus one client-side change to the slider. None of this changes cost or quality: gpt-image portrait and landscape presets cost the same, and IMAGE_QUALITY stays 'high'.

**1. render.ts: work out the output shape from the ORIGINAL room photo, for both render and refine.**
```ts
import sharp from 'sharp';
const provider = DEFAULT_IMAGE_MODEL.split('/')[0];
const RATIOS = ['1:1','3:2','2:3','4:3','3:4','4:5','5:4','16:9','9:16'] as const;
async function outputShape(room: ImageInput) {
  const { autoOrient: { width, height } } = await sharp(room.data).metadata();
  const r = width / height;
  const aspectRatio = RATIOS.reduce((a, b) => {
    const v = (s: string) => { const [w, h] = s.split(':').map(Number); return Math.abs(Math.log((w / h) / r)); };
    return v(b) < v(a) ? b : a;
  });
  const size = r > 1.15 ? '1536x1024' : r < 0.87 ? '1024x1536' : '1024x1024';
  return { aspectRatio, size };
}
// in generateRoomImage(content, shape):
...(process.env.IMAGE_SIZE ? { size: DEFAULT_IMAGE_SIZE } : provider === 'openai' ? { size: shape.size } : { aspectRatio: shape.aspectRatio }),
...(provider === 'openai' && { providerOptions: { openai: { quality: DEFAULT_IMAGE_QUALITY } } }),
```
- If the deployed model is gpt-image-2.5-*, whose docs list custom sizes, you could instead send the photo's exact proportions, scaled and rounded to multiples of 16. Check the model's size limits first.
- Always base the shape on the room photo, never on `currentRender`, so a refine cannot drift the framing.

**2. prompt.ts:69-70 and 112.** Pass the computed ratio (for example "3:4 portrait") into both instruction builders instead of `brief.aspectRatio`, so the text agrees with the API parameter. The LLM field can stay in the schema.

**3. before-after-slider.tsx.** Replace `aspect-[3/2]` with the before photo's real ratio:
```tsx
const [ratio, setRatio] = useState(3/2);
<img onLoad={e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} …/>
<div style={{ aspectRatio: ratio, maxWidth: `calc(75svh * ${ratio})` }} className="relative mx-auto w-full …">
```
- Keep the same fit on both images. A plain `max-h` fights `aspect-ratio` when the width is w-full, which is why the cap is set through `maxWidth`.
- No change to RenderResult or to the client payload is needed.

**4. Config hygiene (low).**
- Set the code default for IMAGE_MODEL, the value in .env.example and the README's Models section to whatever is actually deployed. Commit 30cffeb points to openai/gpt-image-2.5-sunburst. Otherwise, confirm that the gateway's /image-model serves the google id before keeping it as the default.
- Optionally validate IMAGE_SIZE and IMAGE_QUALITY with a zod enum.

**5. Drop two of the finding's suggestions.**
- Adding code to log `result.warnings` is unnecessary. The AI SDK already emits them through process.emitWarning, so search the Vercel runtime logs for "AI SDK Warning" to confirm what size or aspect handling the provider applied.
- Do not lower the default quality to 'medium' to save money. That trades away output quality, which the owner wants to keep, and should only happen after an A/B test on real rooms.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, high**

I traced the whole path: upload, then prepareImageForUpload, then roomDataUrl, then /api/render (plus critique and re-render) and /api/refine, then renderRoom, then generateImage, then GatewayImageModel.doGenerate, then BeforeAfterSlider. I also read the installed library code for ai@7.0.99 and @ai-sdk/gateway@4.0.80.

What holds up:
- Every render and refine call sends the fixed `size: DEFAULT_IMAGE_SIZE` ('1536x1024'), which comes from process.env with no validation and is hidden behind a type cast.
- It always sends `providerOptions: { openai: { quality } }` and never sends `aspectRatio`.
- The gateway client passes size, aspectRatio and providerOptions through to /image-model unchanged.
- The photo's real width and height are known on the client in prepare-image.ts:66-75 but are thrown away. The prompts instead ask for "same aspect ratio (${aspectRatio})", and that value is a free-text guess from the LLM (schemas.ts:48 `aspectRatio: z.string()`, analyze.ts:38).
- On gpt-image, which per the AI SDK table supports only 1024x1024, 1536x1024 and 1024x1536, a portrait photo is forced into a landscape frame. The "same camera, same aspect ratio" rule (constants.ts:26) cannot be met.
- The critique asks whether the camera angle matches (critique.ts:35). A reframed image can fail that check and trigger a second paid render and critique at the same forced size, which cannot fix the problem.
- The slider hard-codes `aspect-[3/2]` with `object-cover` on both images. The before image (roomDataUrl, restage-app.tsx:550-553) keeps the photo's own aspect ratio. My crop math: at 335px wide the frame is 223px tall; a 3:4 photo shows only its middle 50% and a 9:16 photo only its middle 37.5%. When the render is 3:2 and the photo is not, the two halves also show different framing, so they misalign.
- The installed GatewayImageModelId union (index.d.ts:7) has no google/* ids; google/gemini-2.5-flash-image appears only in the language-model union.
- README:105 still describes the generateText → result.files path, which commit 30cffeb removed.

What is wrong or overstated:
1. "Warnings are discarded" is false. generateImage calls `logWarnings(...)` (ai/dist/index.js:12801), and by default that sends every warning through process.emitWarning, formatted as `The feature "size" is not supported.` (lines 613-686). Unsupported-size warnings therefore already reach the Vercel logs.
2. The Gemini default is only the code fallback, and probably not what production runs:
   - Commit 30cffeb ("Use image-generation API for room renders") says the move to generateImage was made "so dedicated image models like openai/gpt-image-2.5-sunburst work".
   - The normalize-image.ts:35 comment is also written for OpenAI.
   - So in production IMAGE_SIZE and IMAGE_QUALITY most likely do apply. The main harm is the forced landscape frame on gpt-image. The OpenAI-only options sent to a Gemini default are a stale-config risk, not the main defect.
3. "On Gemini the output aspect is uncontrolled" is overstated. Google's Gemini image editing matches the input image's aspect ratio by default when no aspectRatio is given. I could not confirm this locally because @ai-sdk/google is not installed, so treat it as likely.
4. The recommendation to default IMAGE_QUALITY to 'medium' lowers output quality, which the owner said not to do. The quoted prices are for gpt-image-1, which is not the configured model.

Severity stays high: portrait phone photos are common, and the product's core promise of the same room from the same camera breaks for them on the likely production model. The slider cropping affects portrait photos on any model.

**Severity/fix lens: partially-confirmed, high**

I read every cited location plus the callers: the render and refine routes, restage-app.tsx, client-api.ts, images.ts and schemas.ts. I also read the library code: generateImage in ai@7.0.99, GatewayImageModel.doGenerate in @ai-sdk/gateway@4.0.80, the logWarnings path, and sharp 0.35.4 metadata. I checked orientation handling with a scratch script. The gateway model catalog could not be reached (the proxy blocks ai-gateway.vercel.sh).

**What is real:**
- Every render and refine call sends a fixed `size: '1536x1024'`. No `aspectRatio` is ever sent, and nothing reads the photo's dimensions.
- The gateway forwards `size`, `aspectRatio` and `providerOptions` unchanged to /image-model.
- Provider options are keyed by the real provider name, so `openai.quality` only affects OpenAI models.
- The prompt's "same aspect ratio (X)" uses a string the LLM guessed, while the API call forces landscape.
- The slider hard-codes a 3:2 frame with object-cover on both images. My scratch math: a 3:4 portrait photo shows only 50% of its height (the top and bottom quarters are cut). A 4:3 landscape photo, the usual phone landscape, shows 88.9% of its height. The before image is therefore cropped differently from a 3:2 render, even for ordinary landscape shots, and the before/after halves do not line up.
- The README still says the image model runs through generateText, which is stale.

**Which model production uses:** commit 30cffeb switched to generateImage "so dedicated image models like openai/gpt-image-2.5-sunburst work". The deployed IMAGE_MODEL is therefore most likely an OpenAI gpt-image model, where `size` is honoured. The main live defect is that portrait photos get reframed into landscape. That breaks the product's core promise (same camera, same architecture) and the before/after view, which is the main result screen. This justifies high for a common flow. The Gemini half of the finding is really a stale default in env.ts, .env.example and the README. It matters for a fresh deploy. Whether the gateway's /image-model serves `google/gemini-2.5-flash-image` cannot be verified here. The installed GatewayImageModelId has no google/* ids, so that part stays contingent.

**Errors in the finding:**
1. "generateImage warnings are discarded" is false. generateImage calls `logWarnings(...)` itself (ai/dist/index.js:12801), which uses `process.emitWarning` by default (646-690). Unsupported-size warnings already appear in the Vercel runtime logs, so no logging code is needed. The owner only has to check the logs.
2. "Doubled by the gate" is overstated. The second render happens only when the critique fails (render/route.ts:85, refine/route.ts:86).
3. Defaulting IMAGE_QUALITY to medium conflicts with the owner's goal of keeping output quality. There is also no separate "final render" in the app, because every render is shown to the user. The orientation fix costs nothing extra, because the 1536x1024 and 1024x1536 presets cost the same. That recommendation should be dropped, or offered only as an A/B-tested trade-off.
4. There is no need to send dimensions from the client, or to add width and height to RenderResult. The server already has the room photo bytes, and `sharp(buf).metadata().autoOrient` returns oriented dimensions (verified). The client can read the before image's `naturalWidth` and `naturalHeight`.

</details>

<sub>Merged from: api-cost:IMAGE_SIZE and IMAGE_QUALITY are OpenAI settings; with the default Gemini model the output aspect ratio is left uncontrolled · performance:Output is fixed at 1536x1024 and the slider at 3:2 object-cover, whatever the photo's orientation · ux:Before/after slider forces a 3:2 crop, render size ignores the photo's orientation, and dragging is weak on touch and keyboard · accessibility:The before/after view crops portrait phone photos to the middle half, and renders are forced to landscape · correctness:Every render is forced to 1536x1024 landscape; the size and quality settings don't reach the default Gemini model, no aspect ratio is ever passed, and the slider crops the before and after images differently · ai-quality:Output aspect ratio is never taken from the photo; size and quality settings are OpenAI-only while the default model is Gemini · maintainability:Renders are always 1536x1024 landscape, contradicting the prompt's 'same aspect ratio' rule, and the before/after slider crops portrait photos · maintainability:Image-generation settings are written for OpenAI gpt-image while the default model is Gemini</sub>

<a id="aiq-02"></a>
#### AIQ-02: Refine and auto re-render prompts mislabel the input images: labels are detached, 'the last image' is a style reference, and kept items are copied from the failed render

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/lib/ai/render.ts:41-56`, `src/lib/ai/render.ts:72-98`, `src/lib/ai/prompt.ts:25`, `src/lib/ai/prompt.ts:105-121`, `src/app/api/render/route.ts:85-95`, `src/app/api/refine/route.ts:55-65`, `src/app/api/refine/route.ts:86-96`, `src/lib/ai/critique.ts:39`, `src/lib/ai/schemas.ts:152-156`, `node_modules/ai/dist/index.js:12863-12871`

**Problem**

renderRoom builds interleaved label and file parts, but generateRoomImage splits them apart (render.ts:41-56): `images` gets every file part and `text` gets every text part joined with blank lines. The AI SDK's normalizePrompt maps `{images, text}` to prompt.text plus files, so no label stays next to its image. A simulated refine with a saved style sends images [CURRENT_RENDER, ORIGINAL_ROOM_PHOTO, STYLE_1..3], and the prompt ends with three dangling labels.

assembleRefineInstruction says 'Edit the FIRST input image (the current redesign)' and 'The last input image is the original room photo for architectural reference only' (prompt.ts:111, 120). The second claim is false whenever a saved style is used (refine/route.ts:56-57; the client sends styleId on every refine) or one-off references are attached.

keepConstraintBlock says 'HARD KEEP LIST — copy these objects from the FIRST input photo' (prompt.ts:25). In refine and in the corrective re-render, the first image is the current render, not the original photo. The critique's headline failure is 'If a keep-list sofa/couch/sectional was replaced, this is a critical fail' (critique.ts:39). The fix for exactly that failure (render/route.ts:87-95, `currentRender: result.image`) therefore tells the model to copy the sofa from the render that replaced it.

The refine and corrective instructions also carry no style profile text: render/route.ts:88-91 builds the instruction without it, and refine/route.ts:57 discards `resolveStyle(...).profile`. The reference images are still attached.

**Impact**

Every refine and every auto-fix with style references tells the image model that an inspiration photo of another room is the architectural reference. The single automatic correction cannot repair a replaced keep item. Drift compounds across refines. The result is wasted paid generations and lower fidelity on common paths.

**Recommendation** (verifier-corrected)

Minimal fix (effort S, no quality trade-off):

1. In render.ts, stop pushing per-image label parts. Build the image array, then put an ordinal legend at the top of the text:
```ts
const images = currentRender ? [currentRender, roomImage, ...styleReferences] : [roomImage, ...styleReferences];
const n = images.length, s = currentRender ? 3 : 2;
const legend = [
  currentRender ? "Image 1 = the current redesign — edit this image in place." : "Image 1 = the ORIGINAL room photo — redecorate this image.",
  currentRender ? "Image 2 = the ORIGINAL room photo — source of truth for walls, windows, doors, camera and every keep-list item." : null,
  styleReferences.length ? `Image${s===n?"":"s"} ${s}${s===n?"":`–${n}`} = style references: mood, colour, materials only; never copy their room or layout.` : null,
].filter(Boolean).join("\n");
const text = `INPUT IMAGES:\n${legend}\n\n${instruction}`;
```
2. In prompt.ts, parameterize `keepConstraintBlock(brief, source = "the FIRST input image")`. assembleRefineInstruction should pass "Image 2 (the original room photo)". Delete line 120 ("The last input image…"), because the legend now states each image's role.
3. Add an optional `styleProfile?: string` argument to assembleRefineInstruction, reusing the same "Saved style profile (authoritative…)" line as assembleImageInstruction. Pass `styleProfileText` at render/route.ts:88. In refine/route.ts:56-57, keep `resolved.profile` and pass `styleProfileToText(profile)`.

Optional follow-ups, with their trade-offs:
- Saved styles that have a profile: on refine and auto-fix, send the profile text and either skip the style images or cap them at 1–2. Load only the manifest instead of resolveStyle's full image download. This cuts Blob egress, latency and input tokens, and the current render already carries the look. Keep the images for one-off references, because they have no profile to stand in for them.
- Add `failureKind: z.enum(["keep","architecture","camera","scale","lighting","style","other"])` to critiqueResultSchema. For keep, architecture or camera failures, re-render from the original photo with `assembleImageInstruction(brief, profile) + "\n\nCORRECTION: " + correctiveInstruction`, which costs the same one generation. Otherwise edit the failed render as now. This is effort M and should be validated on a few real rooms before adopting.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced the path end to end and every code-level claim holds.

1. In ai@7.0.99, generateImage takes only `string | {images, text, mask}`. normalizePrompt (node_modules/ai/dist/index.js:12863-12871) turns this into a single `prompt: prompt.text` string plus a `files` array. GatewayImageModel.doGenerate (node_modules/@ai-sdk/gateway/dist/index.js:1722-1757) then posts `{prompt, files}`. So labels cannot stay next to their images through this API. generateRoomImage (render.ts:41-56) keeps image order, because Promise.all over filter/map preserves order. It moves every text part to the end.

2. A scratch simulation of renderRoom/generateRoomImage for a refine with 3 style images gave images `["CURRENT_RENDER","ORIGINAL_ROOM","STYLE_1","STYLE_2","STYLE_3"]`. The text is the refine instruction followed by three trailing labels: "Current render to edit…", "Original room photo for architectural reference:", "Style reference images…".

3. assembleRefineInstruction (prompt.ts:111, 120; absolute lines 222 and 231 of the file) says "Edit the FIRST input image" (true) and "The last input image is the original room photo" (false whenever styleReferences is non-empty).
   - On refine, the client sends `styleId: selectedStyleId ?? undefined` (restage-app.tsx:242) when a saved style is selected. Otherwise it re-sends the one-off styleFiles (restage-app.tsx:231-233). So the mislabel happens on every refine where any style input exists. The auditor's "sends styleId on every refine" is only true when a saved style is selected.
   - There is no cap on images per saved style, so all of them are appended after the room photo.

4. keepConstraintBlock (prompt.ts:25) says "copy these objects from the FIRST input photo". In both corrective paths (render/route.ts:87-95, refine/route.ts:88-95 as cited 86-97), `currentRender: result.image` puts the critiqued (possibly failed) render first. critique.ts:39 makes a replaced keep-list sofa a critical fail. So the auto-fix for that failure literally tells the model to copy keep items from the image that replaced them.

5. Profile text is dropped as claimed.
   - render/route.ts:88-91 calls assembleRefineInstruction without styleProfileText. That function has no profile parameter.
   - refine/route.ts:57 keeps only `(await resolveStyle(styleId)).images`.

Where the finding overstates things:
- "Cannot repair a replaced keep item" is too strong. The critique model sees the original photo and writes the correctiveInstruction, e.g. "restore the original grey sofa". Without style refs the prompt correctly says the last image is the original. So the fix is contradicted and weakened, not impossible.
- The trailing labels still list the images in order, which partly offsets the detachment.
- The actual effect on output can't be measured without running the paid model.

This is a real, deterministic prompt defect on common paths (refine, auto-fix, style use) that plausibly wastes generations. It is a quality degradation rather than a breakage, so medium fits the rubric better than high.

**Severity/fix lens: partially-confirmed, medium**

I read render.ts, prompt.ts, critique.ts, keep.ts, styles.ts, images.ts, the render and refine routes, the client flow in restage-app.tsx, and the installed AI SDK and gateway code.

What is real:
1. Labels are cut off from their images. In ai@7.0.99, generateImage's prompt type is `{ images: DataContent[]; text?: string }` (index.d.ts:6543-6544). normalizePrompt (index.js:12863-12871) maps it to a single `prompt` string plus an ordered `files` array. GatewayImageModel.doGenerate (@ai-sdk/gateway index.js:1745-1755) posts `{ prompt, files }`. This API cannot interleave text and images, so generateRoomImage (render.ts:41-56) moves all labels to the end of the text.
2. Image order is fixed by renderRoom (render.ts:72-98). With a current render it is [currentRender, roomImage, ...styleRefs]. assembleRefineInstruction (prompt.ts:120, "The last input image is the original room photo for architectural reference only") is therefore false whenever styleRefs is non-empty. That happens when a saved style is selected (refine/route.ts:56-57) or one-off refs are attached (refine/route.ts:59-61, client restage-app.tsx:238-242).
3. keepConstraintBlock (prompt.ts:25) says "copy these objects from the FIRST input photo". In refine and in the corrective re-render (render/route.ts:87-95 and refine/route.ts:88-96), the first image is the current or failed render. So when the critique fails on a replaced keep-list sofa (critique.ts:39), the corrective prompt points the model at the render that replaced it.
4. assembleRefineInstruction takes no style profile. render/route.ts:88-91 leaves out styleProfileText even though it is in scope. refine/route.ts:57 keeps only `.images` from resolveStyle. The images are still attached.

What is overstated or wrong:
- The initial render is fine. Its prompt says "FIRST input image" and "remaining input images" (prompt.ts:66, 87), which matches the order [room, ...styles]. The dangling labels there are harmless.
- "The single automatic correction cannot repair a replaced keep item" goes too far. The critique's free-text correctiveInstruction will often say to restore the original piece, and the trailing labels are in the right order. The contradiction makes the fix less likely to work; it does not make it impossible. Nothing here was tested against a real model.
- "The client sends styleId on every refine" is true only when a saved style is selected.
- Severity: this is a prompt-clarity defect with a probabilistic effect on quality. It is not a crash or a broken flow, and it only applies to refines that use style refs and to auto-fixes, which run only after a critique failure. Under the rubric that is medium, not high.

Problems with the recommendation:
- Bullet 3 (route keep/architecture/camera failures to a fresh render from the original) needs a change to critiqueResultSchema. The schema is only `{ passed, issues, correctiveInstruction }` (schemas.ts:152-156), so there is no failure category to route on. That makes it effort M and optional. It costs the same one generation.
- Bullet 4 (send no style images on refine or auto-fix) is a trade-off. For one-off references there is no profile text to replace them, so dropping them loses the style anchor. Dropping them is reasonable only for saved styles that have a profile. It also saves downloading every style image from Blob on each refine, which resolveStyle does with no count cap. The token savings per call are small next to the output-image cost.

</details>

<sub>Merged from: api-cost:The auto re-render and refine prompts tell the image model which image is which incorrectly · performance:Refine and re-render prompts point the model at the wrong image when style references are present · ux:Refine and auto re-render prompts point to the wrong image as the architecture reference when style references exist · correctness:Image model is told the wrong image roles: labels are flattened, the "last image" is a style reference, and the corrective render copies kept items from the failed render · ai-quality:Refine and auto-fix prompts point to the wrong image as the original room, and their image labels are cut off from the images</sub>

<a id="aiq-03"></a>
#### AIQ-03: Refinements never update the design brief: the 'Cheaper' and 'Keep the sofa' chips can't work, and the shopping list and rationale drift from the image

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/refine-bar.tsx:8-15`, `src/components/refine-bar.tsx:48`, `src/components/restage-app.tsx:234-254`, `src/components/restage-app.tsx:534-603`, `src/app/api/refine/route.ts:101`, `src/lib/ai/prompt.ts:105-121`, `src/lib/ai/shopping.ts:31`, `src/lib/ai/shopping.ts:41`

**Problem**

Chips are sent as lowercase free text (`handleRefine(chip.toLowerCase())`). /api/refine returns only `{ imageUrl, mediaType }`. handleRefine re-sends the same designBrief and regenerates the list against it.

- **'Cheaper'** becomes an image edit, while the shopping prompt still says 'at ${brief.constraintsFromUser.budgetTier} budget tier'.
- **'Keep the sofa'** never reaches constraintsFromUser.keepItems. The 'Kept:' chips, the HARD KEEP LIST in later refines, the critique and the shopping list's 'Do NOT include keep-list items' all ignore it. The refine prompt calls the original photo 'for architectural reference only', so the model can't bring the original sofa back. The chip also appears for every room type (bathroom, kitchen) and when a sofa is already kept.
- **Rationale, palette and materials** always show the original plan.

**Impact**

Common refinements produce shopping lists that contradict the request, especially 'cheaper' and keeping a piece. Two of the six prominent chips can't do what their labels say. The written rationale and the list drift away from the image.

**Recommendation**

- Keep `refinements: string[]` on the brief, have /api/refine return the updated brief, and pass the refinements to the refine, critique and shopping prompts.
- Map the fixed chips to structured edits:
  - 'Cheaper' steps budgetTier down one level and can rerun just the list, with no image call.
  - 'Keep …' chips are generated from inventory items not yet kept, and applied through the keep-list flow: add to keepIds, re-plan, and re-render from the original photo.
- Label the rationale 'Original concept', or refresh it after a refine.

<sub>Merged from: ux:Refine chips don't change the brief: "Cheaper" keeps the budget tier, "Keep the sofa" skips the keep list, and the rationale goes stale · ai-quality:Refinements never update the brief: shopping list goes stale, and the "Cheaper" and "Keep the sofa" chips can't do what they say · maintainability:Refinements never update the design brief, so the shopping list and later refines work from stale constraints · api-cost:Every refine regenerates the shopping list, using the original brief</sub>

<a id="aiq-04"></a>
#### AIQ-04: A selected saved style conflicts with the pre-filled style text and with the budget tier

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:38-45`, `src/lib/ai/plan.ts:50-58`, `src/lib/ai/prompt.ts:74-77`, `src/lib/ai/prompt.ts:90-93`, `src/lib/ai/style-profile.ts:52-62`

**Problem**

`defaultBrief.style = "Warm minimal"`, and `style` is required (`z.string().min(1)`). When the user picks a saved style such as 'Moody Victorian':
- The plan prompt still says `Style: Warm minimal` alongside 'Saved style profile … treat as the authoritative direction'.
- The image prompt says `REDESIGN in this direction: Warm minimal…` and also 'Saved style profile (authoritative for mood/color/materials/finish)'.

styleProfileToText includes `Finish level: premium|mid|budget`, which is declared authoritative for finish, while the same prompt asks for 'real, buyable ${budgetTier}-tier pieces'.

**Impact**

The planner and image model receive two style directions and may blend them. Finish level and budget conflict, which also skews furniture choices and prices.

**Recommendation**

- When a styleId is set, replace `constraintsFromUser.style` with the saved style's name and profile summary, or grey out the style input with 'Using saved style X'.
- State precedence explicitly: the budget tier governs price and finish, and the profile governs palette, materials and mood.
- Leave finishLevel out of styleProfileToText, or phrase it as 'reads premium; translate to ${budgetTier} equivalents'.

<a id="aiq-05"></a>
#### AIQ-05: One-off style references never reach the planner, so the plan's palette and the reference images can disagree

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:148-171`, `src/app/api/plan/route.ts:12-17`, `src/lib/ai/plan.ts:12-18`, `src/lib/ai/prompt.ts:74-76`, `src/lib/ai/prompt.ts:87-89`

**Problem**

`styleRefs` go only to /api/render and /api/refine. The /api/plan request carries only `styleId`, which is undefined for one-off references, so the planner picks palette and materials from the free-text style alone.

The image prompt then says both `Palette: ${designStrategy.palette}` and 'borrow … color story, materials … from the style references', which are two color directions that may conflict. The critic is asked about reference mood without seeing the references, and the shopping list follows the brief's palette.

**Impact**

Results are less coherent when one-off references are used, and the rationale and palette shown don't reflect them.

**Recommendation**

Build a temporary profile from the one-off references by reusing `analyzeStyleImages`: one cheap LLM call on downscaled images. Pass it as `styleProfile` to both plan and render, exactly as saved styles work. Only 1–2 references then need to go to the image model, which trades a small LLM cost for coherence and saves image input tokens.

<a id="aiq-06"></a>
#### AIQ-06: The planner outputs only prose, so the image model is never told which existing pieces to replace, remove or add

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/ai/schemas.ts:37-43`, `src/lib/ai/prompt.ts:74-77`, `src/lib/ai/plan.ts:40-60`, `src/lib/ai/shopping.ts:31-41`

**Problem**

`designStrategySchema` is `{ focalPoint, layoutConcept, palette[], materials[], reasoning }`. The image instruction gets only `Layout: ${layoutConcept}. Focal point… Palette… Materials…`. It never says what happens to non-kept items such as the TV, curtains, plants or art: replace, remove or leave. The shopping list then has to re-infer every piece from the render in a separate vision call.

**Impact**

The image model keeps or swaps unlisted items unpredictably. The shopping list can drift from the design intent, and the critic has no piece list to check against.

**Recommendation**

- Add `pieces: z.array(z.object({ name, action: z.enum(['add','replace','remove']), replacesId: z.string().optional(), placement, material, color, approxSizeCm }))` to the plan.
- In the image prompt, render a concise block, for example `REPLACE: grey rug → 200×300 oat wool rug; REMOVE: floor plant; ADD: walnut media console under TV`.
- Seed the shopping list from the add/replace pieces and use the render only to confirm.

This should raise quality at roughly the same cost.

<a id="aiq-07"></a>
#### AIQ-07: The image prompt names the clichés it wants to avoid and produces broken sentences when lists are empty

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/ai/prompt.ts:64-102`, `src/lib/ai/prompt.ts:69`, `src/lib/ai/prompt.ts:84`, `src/lib/ai/prompt.ts:96-100`

**Problem**

`AVOID: … generic AI-staging clichés (arched mirror, fiddle-leaf fig, bouclé overload, pillow overload)` names exactly the objects the prompt wants absent. Image models tend to be primed by named objects, and Google's Gemini image-prompting guidance recommends positive (semantic) phrasing over negation. Much of the AVOID list also repeats the PRESERVE block (windows, doors, walls, camera).

Empty arrays produce broken sentences such as `and these fixed elements: . Same camera angle` and `Shadows must fall consistently away from .` The second happens, for example, when naturalSources is empty in an interior or night photo.

**Impact**

The prompt can prime the very clichés it bans, spends tokens on duplicated text, and sends malformed sentences to the model.

**Recommendation**

- Rewrite the AVOID list as short positive constraints, for example 'Decor is sparse and specific: at most one plant, 2–3 cushions, mirrors rectangular or none, natural textiles.'
- Keep the named-cliché list only in the LLM plan and critique prompts, where it helps.
- Skip clauses whose arrays are empty.
- Put the single most important constraint (same camera and architecture as the original photo; keep items unchanged) both first and last.

<a id="aiq-08"></a>
#### AIQ-08: Output schemas have no field guidance, include fields that are always overwritten, and leave numbers unbounded

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/ai/schemas.ts:16-19`, `src/lib/ai/schemas.ts:29-35`, `src/lib/ai/schemas.ts:45-79`, `src/lib/ai/analyze.ts:41`, `src/lib/ai/analyze.ts:68-81`, `src/lib/ai/prompt.ts:51`, `src/lib/ai/prompt.ts:79`

**Problem**

`roomInventorySchema` is used as the LLM output schema, but:
- analyze.ts:74-80 overwrites `constraintsFromUser` entirely
- `existingFurniture[].keep` is forced to false
- `windows/doors[].keep` is never read (prompt.ts uses only `.location`)
- `roomType` is overwritten (restage-app.tsx:158)

No field has `.describe()`, although zod v4's `toJSONSchema` would emit it as `description`. Free-text fields such as cameraAngle, walls and dominantDirection are pasted verbatim into the image prompt. `ceilingHeightM`, `roomWidthM` and `roomDepthM` are unbounded `z.number()` values interpolated as `ceiling ${…}m`. One enum slip (for example finishLevel 'mid-range') fails the whole call, because no `repairText` is set.

**Impact**

Output tokens are wasted, calls have more ways to fail, and the image prompt gets inconsistent wording and scale values.

**Recommendation**

- Use a dedicated LLM output schema, for example `roomInventorySchema.omit({ constraintsFromUser: true })` without the keep flags.
- Add `.describe()` with format and examples. For cameraAngle: 'height, position, direction, lens — e.g. eye level ~1.5m, from doorway, facing window wall, ~24mm wide'.
- Clamp numbers after parsing (ceiling 2.1–5m, room 1.5–15m) and say 'approx.' when confidence is low.
- Add a furniture `id`, `name` and `location` (see the keep-matching finding).

### User experience

<a id="ux-01"></a>
#### UX-01: Refine shows no progress, clears the typed instruction on failure, puts errors off-screen without announcing them, and doesn't count as busy

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:77`, `src/components/restage-app.tsx:219-270`, `src/components/restage-app.tsx:257-259`, `src/components/restage-app.tsx:414-422`, `src/components/restage-app.tsx:424-434`, `src/components/restage-app.tsx:605`, `src/components/restage-app.tsx:607-619`, `src/components/restage-app.tsx:625-627`, `src/components/refine-bar.tsx:18`, `src/components/refine-bar.tsx:26-35`, `src/components/refine-bar.tsx:73-74`, `src/app/api/refine/route.ts:68-101`

**Problem**

- **Progress never shown.** handleRefine sets statusText ('Refining design…', then the streamed 'Applying refinement…', 'Running quality check…' and 'Auto-refining…', then 'Updating shopping list…'). statusText is rendered only inside ProgressStages, which mounts only when `analyzing || generating || showKeepStep` (414), and all three are false in the results view. A mocked Chromium run confirmed none of those strings appear.
- **Unlabelled button.** While loading, the submit button's content becomes `<Loader2/>` (refine-bar.tsx:74). Its textContent is '' and it has no aria-label.
- **Input cleared on failure.** handleRefine catches every error and never rethrows (257-259), so RefineBar's `await onRefine(text.trim()); setInstruction("")` clears the input even when the refine failed. Verified: typed 'swap the sofa for cognac leather', mocked an error, and the input was then ''. Clicking a chip also wipes typed text.
- **Error off-screen.** The error box sits at the top of main (424) with no role=alert. At 320×568, scrolled down to the bar, its rect top was -1012px.
- **Refine not busy.** There is no refining flag. RefineBar gets `disabled={generating}` (626), and 'Change keep list' has no disabled prop at all. Clicking it mid-refine clears designBrief and renderResult; the in-flight refine then writes renderResult and fires the shopping-list call with a stale designBrief.
- **List state.** The shopping list shows no 'updating' state.

**Impact**

Refine is the main loop after a render: render, critique, optional re-render, then the list, often 30–180 s. Users see only a tiny spinner. On failure their custom instruction disappears and the error may be off-screen on mobile, which invites retries that each cost more image generations. The page can also end up in an inconsistent state.

This fails WCAG 4.1.3 (AA) and 3.3.1 (A).

**Recommendation** (verifier-corrected)

This is a small, client-only change and does not affect AI output.

**1. In RestageApp**, add `const [refining, setRefining] = useState(false)` and `const [refineError, setRefineError] = useState<string | null>(null)`. Change handleRefine to return `Promise<boolean>`:

```tsx
if (!designBrief || !renderResult || !roomDataUrl) return false;
setRefining(true); setRefineError(null); setStatusText("Refining design…");
try { /* existing body */ return true; }
catch (err) { setRefineError(err instanceof Error ? err.message : "Refinement failed"); return false; }
finally { setRefining(false); setStatusText(""); }
```

Then:
- Set `const busy = analyzing || generating || refining;`.
- Pass `disabled={busy}` to "Change keep list", or have its onClick return early when refining. This closes the stale-closure race.
- Clear statusText in that onClick and in the analyze and generate catch blocks.
- Add `aria-busy={refining}` to the results section.
- While refining, dim ShoppingListView (for example `className={refining ? "opacity-50 transition-opacity" : undefined}` on a wrapper) with a small "Updating…" label.

**2. In RefineBar**, change the prop type to `onRefine: (i: string) => Promise<boolean>` and add `statusText` and `error` props. Pass `disabled={generating || refining}`.
- In handleRefine, remember the last instruction and clear the input only on success, and only when the text came from the input (`const ok = await onRefine(t); if (ok && fromInput) setInstruction("")`), so a chip click no longer wipes typed text.
- Inside the sticky bar, which is always on screen, render `<p role="status" aria-live="polite">{statusText}</p>` while loading.
- When an error arrives, render `<p role="alert">{error} <button onClick={() => handleRefine(last)}>Retry</button></p>`. Retry must stay a user action and must never fire automatically, because each retry costs one or two image generations.
- Give the loading button a visible label, `<><Loader2 className="size-4 animate-spin" /> Refining…</>`, or `aria-label="Refining"`.

**3. Also add** `role="alert"` to the main error box at restage-app.tsx:424, which helps the analyze and generate errors too.

**Optional and out of scope:** surfacing whether the quality gate triggered a correction would mean adding a flag to toClientRenderResult (render.ts:25). A useTransition or state-machine refactor is fine but not needed; a boolean flag is the minimal effective fix. The chips need no change, since they are already disabled while loading.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced every sub-claim through the code. The mechanics are all real, but the finding overstates a few things and cites one WCAG criterion that does not apply.

1) Progress text never shows during refine: CONFIRMED. handleRefine (restage-app.tsx:224, 248) sets statusText, and callApi forwards the streamed statuses from refine/route.ts:69,79,87,100 ("Applying refinement…", "Running quality check…", "Auto-refining based on quality check…", "Refinement complete") and from shopping-list/route.ts ("Sourcing furniture for your region…"). A grep shows statusText is rendered in only one place, ProgressStages (progress-stages.tsx:65-68), which mounts only when `analyzing || generating || showKeepStep` (restage-app.tsx:414). In the results view hasResults is truthy, so showKeepStep (line 77) is false. handleRefine never sets analyzing or generating, so the text is never mounted. The title's "no progress" is slightly overstated: there is a busy cue, just no stage text. The submit button shows a Loader2 spinner, and the chips and input are disabled (refine-bar.tsx:46,65,70-77).

2) The loading button has no label: CONFIRMED. In lucide-react 1.45.0, buildLucideIconNode adds aria-hidden="true" when no a11y prop is passed. The button therefore has no accessible name while loading. Impact is small because the button is also disabled then.

3) The input is cleared on failure: CONFIRMED. handleRefine catches everything and never rethrows (restage-app.tsx:257-259). RefineBar's `await onRefine(text.trim()); setInstruction("")` (refine-bar.tsx:30-31) therefore always clears the input. A chip click also clears any typed text on completion, because it goes through the same handleRefine path (line 48). Two related points the finding missed:
- statusText is never cleared on error.
- If the refine succeeds but the shopping-list call fails, the new render sits next to the old, now mismatched shopping list with only the top-of-page error.

4) The error is off-screen and not announced: CONFIRMED. In the results view, the error div (restage-app.tsx:424-433) is the first child of main, above the slider, rationale and shopping list. It has no role="alert" or aria-live; no element in the codebase has one. The RefineBar is sticky at the bottom, so a user scrolled to the shopping list will not see the error. This is a fair WCAG 4.1.3 (Status Messages, AA) failure. Citing 3.3.1 (Error Identification) is wrong: that criterion covers automatically detected input errors, and here a server or model failure is described in text.

5) Refine does not count as busy: CONFIRMED. There is no refining state, `busy = analyzing || generating` (line 73), and RefineBar gets `disabled={generating}` (line 626). "Change keep list" (607-619) has no disabled prop.
- Clicking it mid-refine nulls designBrief and renderResult, which unmounts RefineBar and shows the keep step, with Generate and Re-analyze enabled because busy is false.
- The in-flight handleRefine closure still holds the old designBrief and renderResult. It then calls setRenderResult(refined), sets "Updating shopping list…", which now appears inside the keep step's ProgressStages, and fires /api/shopping-list, a paid vision LLM call whose result nobody sees.
- If the user also clicks Generate, the two flows race. Once the new plan's designBrief is set, the refine's setRenderResult can make hasResults true and show the new rationale with the old refined image. Whichever shopping-list response lands last wins, so the final list can belong to the old design.
This is real but needs a deliberate click during a long wait.

6) The shopping list has no "updating" state: CONFIRMED. Line 605 keeps showing the old list for the whole refine and the list regeneration.

Severity: the happy path works and has a busy cue. The worst effects are in the failure path (lost text, error not seen) and in a race that needs deliberate user action. The cost angle is weak: a user who misses the error and retries pays the same as one who retries on purpose. The only avoidable spend is the orphaned shopping-list call after "Change keep list". This is a meaningful UX and a11y defect cluster on the main post-render loop, not a breakage, so medium rather than high. I could not reproduce the "mocked Chromium run" and the "-1012px" measurement, but the code trace fully determines the behaviour. The 30–180 s duration is a plausible estimate: up to two gemini-2.5-flash-image generations, one critique and one shopping-list LLM call, run in series.

**Severity/fix lens: partially-confirmed, medium**

I read restage-app.tsx, refine-bar.tsx, progress-stages.tsx, shopping-list.tsx, client-api.ts, api/refine/route.ts and render.ts, and checked lucide-react 1.45.0 in node_modules. Every mechanism in the finding is real:

1. **Progress is never shown.** statusText is rendered only by ProgressStages. That component mounts only when `analyzing || generating || showKeepStep` (restage-app.tsx:414). showKeepStep is `inventory !== null && !hasResults && !generating` (line 77), so it is false in the results view. analyzing and generating are never set by handleRefine. The server streams "Applying refinement…", "Running quality check…", "Auto-refining based on quality check…" and "Refinement complete" (refine/route.ts:69-100). callApi forwards them to setStatusText, but nothing on screen shows them.

2. **The loading button has no name.** At refine-bar.tsx:73-74 the button's only content is `<Loader2/>`, and lucide 1.45 adds aria-hidden="true" by default (buildLucideIconNode.mjs:48). The button has no aria-label, so its accessible name is empty.

3. **The typed instruction is cleared on failure.** handleRefine catches every error and returns normally (257-259). RefineBar then runs `await onRefine(...); setInstruction("")` (30-31) whether or not the refine worked. A chip click also clears whatever the user had typed once it finishes.

4. **The error is easy to miss.** The error box sits at the top of main (424-434) with no role="alert". The repo has no aria-live, role="status" or scrollIntoView anywhere. The RefineBar is sticky at the bottom, so the user can start a refine from any scroll position. After a failure the image stays the same and the input clears exactly as it does on success, so a failure can look like a success where the model ignored the instruction.

5. **Nothing marks a refine as busy.** There is no refining flag. RefineBar gets `disabled={generating}`, which only matters during the generate flow's shop stage. "Change keep list" (607-619) has no disabled prop. Clicking it mid-refine nulls designBrief, renderResult and shoppingList and unmounts RefineBar. The in-flight closure then writes renderResult and fires /api/shopping-list with the abandoned brief. If the user then clicks Generate, the old refine's setRenderResult and setShoppingList can land in the middle of the new run. For example, plan finishes, hasResults turns true, and the new brief is shown next to the old refined image. The old list can also overwrite the new one if it arrives later.

6. **The shopping list gives no sign it is updating.** It keeps showing the list for the previous render.

**Extra defect the finding missed.** Neither the refine catch block nor the "Change keep list" handler clears statusText. After a failed refine, going back to the keep step shows ProgressStages with a stale, pulsing "Running quality check…" that looks like work in progress.

**Where the finding is wrong or overstated:**
- **Severity.** The happy path works. The button shows a spinner, and the chips and input are disabled while loading (refine-bar.tsx:46 and :65). For a single-owner app this is a noticeable defect, mostly on the failure path, not breakage of a common flow. That makes it medium, not high.
- **WCAG 3.3.1.** That criterion covers user input errors, not server failures. Only 4.1.3 Status Messages applies.
- **Chips.** The recommendation to "disable the chips" is already done: they are disabled while loading.
- **Rethrowing.** The "rethrow" option would cause an unhandled promise rejection. RefineBar's onSubmit and chip onClick call handleRefine without awaiting it, and it has only try/finally. Returning a boolean is the correct fix.
- **Retry cost.** Silent failures do invite retries, and each retry costs one or two image generations plus a critique. The cost impact is real but modest.

None of the fixes touch prompts or models, so AI output quality is unaffected.

</details>

<sub>Merged from: api-cost:Refine progress and errors are not visible · performance:Refine progress text is never shown, and refine is not treated as busy · ux:Refine gives almost no feedback, clears the typed instruction on failure, and shows errors off-screen · accessibility:Refining gives no progress, drops the typed instruction on failure, and shows the error off-screen without announcing it · correctness:Refine shows no progress, clears the typed instruction on failure, and leaves conflicting controls enabled · platform:Refinement progress is never shown, and 'Change keep list' stays enabled while a refine runs · maintainability:restage-app.tsx has an implicit state machine (18 useState hooks) that causes concrete UX and cost bugs</sub>

<a id="ux-02"></a>
#### UX-02: Results are ephemeral: no history, undo, restore after refresh, or download, and "Change keep list" deletes the current render

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** M · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:38-45`, `src/components/restage-app.tsx:53`, `src/components/restage-app.tsx:62-67`, `src/components/restage-app.tsx:219-270`, `src/components/restage-app.tsx:550-553`, `src/components/restage-app.tsx:607-619`, `src/lib/blob.ts:115-122`, `src/app/api/refine/route.ts:52-53`, `src/app/api/render/route.ts:44`, `src/app/api/plan/route.ts:39`, `src/lib/ai/images.ts:26-53`, `src/components/before-after-slider.tsx:55-71`, `src/app/api/blob/route.ts:23-29`

**Problem**

All results (inventory, designBrief, renderResult, shoppingList, roomDataUrl) live only in useState. `grep` finds no localStorage, sessionStorage, beforeunload or download handling anywhere in src.

Each refine overwrites the render (`setRenderResult(refined)`) with no history stack. 'Change keep list' runs `setDesignBrief(null); setRenderResult(null); setShoppingList(null)` with no confirmation, and it is the only way back from results to edit the brief or start over.

Renders are uploaded to Blob under unique names (`renders/${Date.now()}-${uuid}`), but nothing records or lists them. Brief preferences (region, budget, style) reset to defaultBrief and getDefaultRegion() on every visit.

**Impact**

A refresh, an accidental back-swipe or a discarded mobile tab loses minutes of waiting and 4–7 paid AI calls. Image-edit refines drift and often get worse, but the user can't step back to an earlier version or compare versions. Trying a different keep list destroys the current design. There is no Download or Share button; on mobile, a long-press on the left half saves the 'before' image.

**Recommendation** (verifier-corrected)

These are client-only changes in src/components/restage-app.tsx, plus one optional line in the blob route. None of them touches prompts or models.

1. **Version history (highest value, cuts API use).** Replace renderResult and shoppingList with `versions: {imageUrl, mediaType, instruction: string|null, shoppingList: ShoppingList|null}[]` and `activeIndex`.
   - handleGenerate pushes a version with instruction null.
   - handleRefine sends `currentRenderUrl: versions[activeIndex].imageUrl` and appends the result as a new version. The refine route already accepts any allowed /api/blob URL, so refining from an older version needs no server change.
   - Show a thumbnail strip. Clicking a thumbnail sets activeIndex with no API call. Optionally let the user compare against the previous version by passing it as the slider's beforeSrc.
   - If the shopping-list call after a refine fails, keep the version with shoppingList null and offer a retry.

2. **"Change keep list".** Don't clear the results. Add a view flag, e.g. `editing`, that shows the upload, brief and keep sections while keeping the versions. Rename the button to "Edit brief & keep list" and add "Back to results" while versions exist. A new generate appends to the history.

3. **Download.** Add `<a href={active.imageUrl} download={`restage-${activeIndex + 1}.${active.mediaType.split('/')[1] ?? 'png'}`}>Download</a>`. The URL is a same-origin /api/blob link, so the download attribute works, and the explicit name avoids a file called "blob". Optionally, a `?download=1` parameter in src/app/api/blob/route.ts could set `Content-Disposition: attachment`.

4. **Persist across refresh with IndexedDB, not localStorage.** A prepared JPEG can be up to 4 MB, about 5.3 MB as base64, which is over the localStorage quota.
   - Store `{roomFile, floorPlanFile, brief, selectedStyleId, inventory, designBrief, versions, activeIndex}`. File objects can be stored directly.
   - On mount, restore state and call setRoomFiles([roomFile]). The existing re-encode from roomFiles[0] then keeps plan, render and refine working unchanged.
   - Wrap every storage call in try/catch.
   - Don't use the Blob-restore route for now. plan, render and refine only accept data URLs (dataUrlToImageInput), so a Blob-URL room photo would fail without route changes. A projects/ route or a renders/ listing endpoint would also expose data publicly on an app with no auth.

5. **beforeunload.** Add a beforeunload prompt while `busy` or a refine is running. It only helps on desktop; iOS doesn't reliably fire it and it can't stop tab discard, so step 4 is the real mobile fix.

6. **Remember brief preferences (low).** Keep region, budget and style in localStorage.

Net effect: going back to an earlier good design costs 0 AI calls instead of a 3–5 call regenerate, with no change to output quality.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, high**

I traced the whole client flow in restage-app.tsx and the routes it calls. The core claims hold.

1. Every result lives only in React state: `inventory`, `designBrief`, `renderResult`, `shoppingList` and `roomDataUrl` (restage-app.tsx:62-66), plus `brief` initialised from `defaultBrief` (38-45, 53). A grep of src for localStorage, sessionStorage, beforeunload, history, pushState or a download button finds nothing. The only "download" hits are the server-side `downloadPrivateBlob`. page.tsx just renders `<RestageApp/>`, so a refresh or a discarded tab loses everything.

2. Refine overwrites the render with no history. `handleRefine` sends `currentRenderUrl: renderResult.imageUrl` (239) and then calls `setRenderResult(refined)` (247) and `setShoppingList(list)` (255). The server uses that render as the edit target (render.ts:74-79 and refine/route.ts:53,71-76), so edits pile up on the latest image and there is no way back to an earlier one.

3. "Change keep list" (607-619) sets `designBrief`, `renderResult` and `shoppingList` to null with no confirmation, and nothing in src calls `confirm(`. While `hasResults` is true, the upload and brief sections (305-412) are hidden and the header has no click handler. That makes this button the only in-app way back to edit the style, budget, region, function or photo, and pressing it throws the current design away. Getting it back means plan + render + shop again.

4. Renders go to `renders/${Date.now()}-${uuid}` (blob.ts:115-122). `listByPrefix` is only ever called for styles (styles.ts:54,169), so nothing lists or records renders. `uploadUpload(..., "room")` (blob.ts:124-132) exists but is never called, so the room photo exists only as a client data URL.

5. More evidence the finding missed: `streamStatus` (api.ts:28-56) and the routes never pass `request.signal` or `abortSignal` to the AI calls (a grep finds none). A refresh in the middle of generation therefore likely does not stop the paid calls running. The render still gets uploaded as an orphaned blob, but the client never receives its URL.

Corrections:
- The call count is overstated. A full run is analyze 1 + plan 1 + render 1-3 (render, critique, optional re-render) + shopping 1, which is 4-6 calls, not 4-7. Each refine is 2-4 more (render 1-3 + shopping 1).
- The long-press remark is imprecise. The slider's `onPointerDown` (before-after-slider.tsx:31-35) handles every pointer type and button and immediately moves the divider to the touch or click point. So a long-press or right-click lands on the seam or the 4px divider, and saving the render from the slider is unreliable. The underlying point stands: there is no explicit way to save the result.
- The download recommendation needs a filename. /api/blob (route.ts:23-29) sends no Content-Disposition and the URL's last path segment is "blob", so a bare `download` attribute names the file "blob". It is same-origin, so an explicit `download="restage-….png"` value is honoured.
- beforeunload prompts are not reliable on mobile (iOS Safari, tab discards). Persistence is the real fix; beforeunload only helps on desktop.
- RestageApp is server-rendered. Reading storage during render would cause a hydration mismatch, so a restore has to happen after mount.

Severity: high is justified. This is the core loop (results → refine or adjust the brief). The one action that edits the brief destroys the result, refines can't be undone, and every lost result costs 2-6 paid AI calls to recreate. That cost works directly against the owner's goal of reducing API usage.

**Severity/fix lens: partially-confirmed, medium**

I read all of restage-app.tsx, before-after-slider.tsx, refine-bar.tsx, blob.ts, client-api.ts, lib/ai/images.ts, lib/ai/render.ts, prepare-image.ts and the plan, render, refine, shopping-list and blob routes.

What holds up:
- All results live only in React state. A grep of src finds no localStorage, sessionStorage, IndexedDB, beforeunload or download handling.
- Each refine overwrites the single renderResult, so there is no history.
- "Change keep list" clears designBrief, renderResult and shoppingList with no confirmation. It is the only control that leaves the results view, because the upload and brief sections only render when !hasResults.
- Renders go to Blob under random names and nothing records them.
- Brief preferences come back as defaultBrief on every load.
- The long-press claim is plausible. The "before" image sits on top with a clip-path, and clip-path also limits where it can be touched, so a press left of the divider lands on the before image.
- The call count is about right: a full run with the quality gate is 5–6 calls (analyze, plan, render, critique, sometimes a re-render, shopping), and each refine adds 2–4.

What is misdescribed or overstated:
1. "Deletes the current render" is wrong. The button only drops the URL from client state. The blob stays in storage, orphaned and unreachable from the UI. Nothing is deleted.
2. Severity. On the rubric this is a missing-feature gap, not "breakage in a common flow". No stored data is lost, and nothing fails. The no-undo refine loop does waste paid calls: getting back to an earlier good design means a full regenerate. That makes this a meaningful improvement, so medium, not high.
3. The restore half of the recommendation would not work as written.
   - After a refresh roomFiles is empty. handleGenerate and handleRefine (restage-app.tsx:141-143, 227-229) then fall back to roomDataUrl.
   - If that holds a Blob URL, the server breaks: plan/route.ts:39, render/route.ts:44 and refine/route.ts:52 all call dataUrlToImageInput, which throws "Invalid data URL format" (images.ts:27-30) for an /api/blob URL. So "upload the room photo to Blob once" also needs route changes.
   - A projects/{id}.json with ?project= needs a new unauthenticated route and a wider allowlist. That is more public attack surface on an app with no auth.
   - localStorage can't hold the photo. prepare-image.ts:5 allows JPEGs up to 4 MB, which is about 5.3 MB as a data URL, over the roughly 5 MB localStorage quota.
   - IndexedDB can store the File object itself. Restoring roomFiles from it keeps every existing call path working with no server change.
4. `<a href download>` with no filename saves the file under a name taken from the URL path "/api/blob" (for example "blob"). It needs an explicit filename.
5. beforeunload does not reliably fire in iOS Safari and does nothing against mobile tab discard. Only persistence fixes the mobile case.

A plus for the history idea: the refine route already accepts any allowed Blob URL as currentRenderUrl, fetched through urlToImageInput (refine/route.ts:53, images.ts:46-53). So refining from an older version needs no server change. None of this affects AI output quality.

</details>

<a id="ux-03"></a>
#### UX-03: Partial failures are hidden and nothing retries a single step: a failed render re-runs the plan, and a failed list can only be recovered with a new render

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:128-137`, `src/components/restage-app.tsx:152-205`, `src/components/restage-app.tsx:247-259`, `src/components/restage-app.tsx:284-290`, `src/components/restage-app.tsx:519-526`, `src/components/restage-app.tsx:605`

**Problem**

- **Plan always re-runs.** handleGenerate always calls `setDesignBrief(null)` (133) and re-calls /api/plan. If /api/render fails, the keep step reappears and 'Generate redesign' plans again before rendering.
- **Missing list looks like success.** If /api/shopping-list fails after `setRenderResult`, the results view renders with no list section (`{shoppingList && ...}`), while the header still shows a check and 'Analyzed · Designed · Rendered · Sourced', which is driven only by hasResults.
- **No list-only retry.** The only ways to get a list back are a refine (1–2 image generations, a critique and the list) or a full regenerate.
- **Stale list after refine.** In handleRefine, if the list fails, the previous render's list stays on screen with no stale marker.
- **Re-analyze.** It re-runs the vision call even though brief edits are already applied to the inventory in handleGenerate (156-167).

**Impact**

Each transient failure costs a re-plan (a vision LLM call) and changes the design the user was about to see. Recovering a list costs an image generation. The user can see a mismatched or missing list under a success header.

**Recommendation**

- Track status per stage (`{analyze, design, render, shop}: idle | running | done | error`) and derive the header from it.
- Add 'Retry render' and 'Retry shopping list' actions. The list retry calls /api/shopping-list with the current brief and renderUrl.
- Cache the plan keyed on a hash of (inventory, keepItems, brief, styleId) and skip /api/plan when the key is unchanged.
- Clear the list, or mark it 'out of date', when it fails during a refine.
- Present Re-analyze as an explicit re-scan, with a hint that brief changes don't need it.

<sub>Merged from: api-cost:No step-level retry or reuse: a failed step forces paid upstream steps to run again · ux:Partial failures are hidden: missing shopping list still reads "Sourced", there is no per-stage retry, and retrying re-runs the plan · correctness:If the optional quality gate fails, the successful paid render is thrown away, and retrying re-runs the plan</sub>

<a id="ux-04"></a>
#### UX-04: The implicit state machine in restage-app.tsx has no run identity: inputs stay editable mid-run and late results land on newer state

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:48-77`, `src/components/restage-app.tsx:79-88`, `src/components/restage-app.tsx:102-118`, `src/components/restage-app.tsx:305-412`, `src/components/restage-app.tsx:318`, `src/components/restage-app.tsx:607`, `src/components/restage-app.tsx:626`

**Problem**

The flow's phase is spread across about 18 useState hooks (analyzing, generating, currentStage, completedStages, statusText, inventory, designBrief, renderResult, shoppingList, roomDataUrl, error, …). The upload zones, style picker and brief form render whenever `!hasResults` and are never disabled while busy. There is no AbortController or run id anywhere. Refine is not part of `busy` (see the refine finding).

- **Photo swapped mid-analysis:** resetFromPhotoChange calls `setRoomDataUrl(null)`, then the in-flight call runs `setInventory(analyzed)` for the old photo. The keep step lists the old photo's furniture with no image, and 'Generate redesign' is disabled (canGenerate needs roomDataUrl) with no explanation.
- **Photo swapped mid-generation:** the run keeps calling /api/render (image, critique, retry) and /api/shopping-list for the discarded photo, and Analyze stays disabled (busy) until it finishes.

**Impact**

Users hit confusing dead ends, image generations are billed for results that get thrown away, and the user is blocked until they finish.

**Recommendation**

- Replace the flags with a useReducer over explicit phases (`idle | analyzing | choosingKeep | generating{stage} | results | refining{status}`), with busy derived from the phase.
- Move the async flows into a `useRestagePipeline()` hook. It owns one AbortController per run, passes `signal` to callApi, and drops dispatches from stale run ids.
- Short term: wrap the input sections in `<fieldset disabled={busy}>`.
- The reducer can also be unit-tested without React.

<sub>Merged from: ux:Inputs stay editable during in-flight runs (stale results leave odd states), and there is no scroll handling between steps · maintainability:restage-app.tsx has an implicit state machine (18 useState hooks) that causes concrete UX and cost bugs</sub>

<a id="ux-05"></a>
#### UX-05: Deleting the selected saved style leaves a hidden stale selection: the plan silently drops the style and the render then fails with 'Style not found'

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/style-picker.tsx:26-36`, `src/components/style-picker.tsx:101-108`, `src/components/style-picker.tsx:172`, `src/components/my-styles-manager.tsx:170-190`, `src/components/restage-app.tsx:50`, `src/components/restage-app.tsx:148-150`, `src/components/restage-app.tsx:170`, `src/components/restage-app.tsx:184`, `src/components/restage-app.tsx:336-339`, `src/components/restage-app.tsx:358-363`, `src/app/api/plan/route.ts:19-25`, `src/app/api/render/route.ts:50-55`, `src/lib/ai/styles.ts:182-189`

**Problem**

After a delete, onStylesChanged → StylePicker.refresh() reloads the list, but RestageApp's selectedStyleId still holds the deleted id. No card renders as selected, so there is nothing to click to deselect it.

One-off references stay suppressed (`selectedStyleId ? [] : ...`). The only hint is the note 'A saved style is selected — it takes priority' inside the collapsed one-off panel.

On Generate:
1. /api/plan: resolveStyleProfileText → loadManifest returns null → undefined, so the plan is generated and billed without the style.
2. /api/render: resolveStyle throws 'Style not found' and the route returns 500.

Every retry fails the same way.

**Impact**

The user is stuck: every Generate fails after a paid plan call. Getting out requires selecting and deselecting another style, or reloading and losing the analysis.

**Recommendation**

- In StylePicker, after each refresh and on mount, call `onSelect(null)` when `selected` is not in the loaded summaries.
- On the server, validate styleId at the start of /api/plan and return 404 'The selected style no longer exists' before the LLM call.
- Alternatively, treat a missing style as 'no style' with a status warning, applied the same way in plan, render and refine (see the route-duplication finding).

<sub>Merged from: ux:Deleting the selected saved style leaves a hidden selection that can't be cleared and breaks every render · correctness:Deleting the selected saved style leaves its id selected, so render fails with "Style not found" after the plan has been paid for · platform:Deleting the selected saved style leaves it selected: the plan silently ignores it and the render then fails</sub>

<a id="ux-06"></a>
#### UX-06: Required brief fields aren't marked: Analyze stays disabled with no reason, and a blank Style or Region returns a generic 'Invalid user brief'

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:44`, `src/components/restage-app.tsx:74`, `src/components/restage-app.tsx:390-410`, `src/components/brief-form.tsx:102-112`, `src/components/brief-form.tsx:136-161`, `src/lib/ai/schemas.ts:5-12`, `src/app/api/analyze/route.ts:21-24`

**Problem**

- `canAnalyze = roomFiles.length > 0 && brief.function.trim().length > 0`, and defaultBrief.function is ''.
- The 'How is the room used?' field (brief-form.tsx:150-160) is the last in the form. Unlike the photo zone, which has a 'Required' badge, it has no Required marker, no `required` or `aria-required` attribute, and no helper text.
- With a photo uploaded, the harness screenshot shows 'Analyze room' at opacity-50 with no message. The button is natively disabled, so it also drops out of the tab order.
- The server schema also requires `style: z.string().min(1)` and `region: z.string().min(1)`, which the client never checks. Clearing either field returns 400 'Invalid user brief' without naming the field.

**Impact**

This is the first-run friction point. Users, especially on mobile where the field is below the fold, upload a photo and see a dead primary button or a vague error, and conclude the app is broken. This fails WCAG 3.3.2 (A).

**Recommendation**

- Mark the field Required and add `required aria-required="true"`.
- Validate on the client with `userBriefInputSchema.safeParse(brief)` and show inline errors.
- Either keep Analyze enabled and, on click, focus the first missing field; or show helper text under the button listing what's missing, linked with aria-describedby.
- Return `parsed.error.issues` field paths from the route.
- Consider defaulting a blank style to 'designer's choice'.

<sub>Merged from: ux:Brief validation: Analyze is disabled with no reason, and blank Style or Region returns "Invalid user brief" · accessibility:'How is the room used?' is silently required: Analyze stays disabled with no explanation</sub>

<a id="ux-07"></a>
#### UX-07: The sticky refine bar covers a third to half of a phone screen, and the slider handle draws over it and takes its taps

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/refine-bar.tsx:38`, `src/components/refine-bar.tsx:40`, `src/components/before-after-slider.tsx:73`, `src/components/restage-app.tsx:625`

**Problem**

The bar is `sticky bottom-0`, with a `flex flex-wrap` row holding a label and six chips above the input. Measured with the real CSS (fallback font, so approximate), before any on-screen keyboard opens:
- 224px of 667 (34%) at 375×667
- 264px of 568 (46%) at 320×568
- 185px of 375 (49%) at 667×375 landscape

The bar has no z-index. The slider divider is `absolute inset-y-0 z-10` inside a container that creates no stacking context, so it paints above the bar. At 667×375, `elementFromPoint` on the refine input hit the slider, and a tap there moved the slider (clip 50% → 47.4%) instead of focusing the input. The 320px screenshot shows the divider and handle drawn across the chips.

**Impact**

On phones, most of the before/after image and the rationale sit behind the bar. Where the handle overlaps, the refine input and chips can't be tapped.

**Recommendation**

- Add `relative z-30` to the RefineBar wrapper and `isolate` to the slider container.
- Below `sm`, collapse the chips into a single horizontally scrolling row (`flex-nowrap overflow-x-auto`) or behind a 'Suggestions' toggle, so the bar is about 110px tall.
- Add `scroll-padding-bottom` of about the bar height on `html`, so focused content never lands underneath it.

<a id="ux-08"></a>
#### UX-08: The shopping list is ungrounded and not actionable: queries and retailers are plain text, prices are free strings, and there is no total

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/ai/shopping.ts:31-42`, `src/lib/ai/schemas.ts:89-103`, `src/components/shopping-list.tsx:53-70`

**Problem**

The prompt asks for 'real furniture … genuinely sold in the user's region', with retailers and a search query, but no retrieval is done. `item.retailers` render as `<span>` chips (55-62), and `item.searchQuery` sits in a `<span>` next to a decorative search icon (65-70). There is no link or copy button, and the items are `<div>`s rather than a list. `estPriceRange` and `currency` are free-form strings chosen by the LLM, so there is no total and no check against the budget.

**Impact**

The model will invent specific product names and retailer availability. Users have to retype each query into a retailer site, on mobile by long-pressing small chips. There is no cost overview, and screen readers get no list structure.

**Recommendation**

- Ask for descriptive generic names, with model names only when the model is certain.
- Build search links on the client, never fabricated product URLs: for example `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.searchQuery)}`, plus a retailer→search-URL map (IKEA, HAY, Loods 5, vtwonen, West Elm…). Use target=_blank, rel="noopener noreferrer" and the accessible name 'Search for {item.name}'.
- Add copy-to-clipboard.
- Make price numeric `{ min, max }`, derive currency from region in code, and show the total against the budget tier.
- Render the items as `<ul>`/`<li>`.
- Optional paid upgrade: ground the top 3–5 items with `gateway.tools.perplexitySearch({ country, maxResults: 5 })` (documented in node_modules/@ai-sdk/gateway/docs).

<sub>Merged from: ux:Shopping list isn't actionable: search queries and retailers are plain text, with no total · accessibility:Shopping list items are not actionable: search queries and retailers are plain text · ai-quality:Shopping list is ungrounded and not actionable (hallucinated products, plain-text retailers, price strings)</sub>

<a id="ux-09"></a>
#### UX-09: After a generation or refine error, the last status message keeps pulsing as if work were still running

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:77`, `src/components/restage-app.tsx:202-205`, `src/components/restage-app.tsx:257-259`, `src/components/restage-app.tsx:414-422`, `src/components/progress-stages.tsx:65-69`

**Problem**

The catch block in handleGenerate resets currentStage but not statusText. After a failure, inventory is set and hasResults is false, so showKeepStep is true. ProgressStages then shows the stale text (for example 'Rendering redesigned room…') with animate-pulse, right next to the error box. handleRefine's catch has the same omission, and its stale text reappears after 'Change keep list'.

**Impact**

After an error, the page looks like it is still working.

**Recommendation**

Call `setStatusText("")` in every catch block (analyze, generate, refine), or derive the status from a phase reducer (see the state-machine finding).

<sub>Merged from: correctness:After a generation error, the last status message keeps pulsing as if work were still running · maintainability:restage-app.tsx has an implicit state machine (18 useState hooks) that causes concrete UX and cost bugs</sub>

<a id="ux-10"></a>
#### UX-10: My Styles gaps: no rename, no per-image removal, a new style doesn't open, and the modal can be closed mid-upload

**Severity:** ⚪ Low · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/app/api/styles/[id]/route.ts:15-52`, `src/app/api/styles/[id]/images/route.ts:33`, `src/components/my-styles-manager.tsx:94-115`, `src/components/my-styles-manager.tsx:259-290`, `src/components/style-picker.tsx:56-63`, `src/components/style-picker.tsx:148-155`

**Problem**

- The routes offer only style GET and DELETE plus image POST. There is no PATCH (rename) and no image DELETE, so one off-style image pollutes the profile until the whole folder is deleted.
- handleCreate ignores the returned `{ style }` and goes back to the grid, so the user has to find and open the empty folder to add images.
- The delete confirmation renders at the top of the manager even when triggered from a card further down.
- The Escape handler, backdrop click and X button close the modal at any time, even while uploadStatus is set. The upload keeps going, but its success, warning or error is never shown.

**Impact**

Curating a style takes extra steps, mistakes can't be fixed in place, and upload results can be missed.

**Recommendation**

- Add `PATCH /api/styles/[id] {name}` and `DELETE /api/styles/[id]/images?pathname=…`, and mark the profile stale after a removal.
- Open the new style after creation (`handleOpen(created.style.id)`).
- Show the delete confirmation inline on the card.
- Block closing the modal, or ask for confirmation, while an upload is running.

<a id="ux-11"></a>
#### UX-11: Visual and mobile polish: select triggers show raw lowercase values, the header pill wraps at 320px, keep checkboxes look like radios, and reduced motion is ignored

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/brief-form.tsx:56-72`, `src/components/brief-form.tsx:79-98`, `src/components/restage-app.tsx:285-290`, `src/components/keep-picker.tsx:43`, `src/components/progress-stages.tsx:47`, `src/components/progress-stages.tsx:66`, `node_modules/@base-ui/react/internals/resolveValueLabel.mjs:66-94`

**Problem**

- **Raw select values.** The SelectItems use `value={type.toLowerCase()}` and 'budget'/'mid'/'premium', and `<SelectValue />` has no children. Base UI 1.8's SelectValue resolves a label only from the Root `items` prop or `itemToStringLabel` (SelectRoot.d.ts:98-111), and otherwise falls back to `stringifyAsLabel(value)`. So the triggers show and announce 'living room' and 'mid'.
- **Header pill.** 'Analyzed · Designed · Rendered · Sourced' wraps to four lines inside a rounded-full lozenge at 320px.
- **Checkbox shape.** The keep checkbox uses `rounded-lg` (1rem) on a 26px box, which makes a circle that looks like a radio button.
- **Reduced motion.** With `prefers-reduced-motion: reduce` emulated, animate-spin still runs, and the status line uses animate-pulse with no motion-safe guard.

**Impact**

The app looks less polished, lowercase select values are confusing next to title-cased options, and a multi-select reads as single-select. Motion-sensitive users get constant animation (2.3.3 is AAA only).

**Recommendation**

- Pass `items` (value → label) to both Selects, e.g. `items={Object.fromEntries(ROOM_TYPES.map(t => [t.toLowerCase(), t]))}`, or render `<SelectValue>{(v) => label(v)}</SelectValue>`.
- Below `sm`, show only the check icon with sr-only text.
- Use `rounded-md` for the checkbox.
- Use `motion-safe:animate-pulse` and `motion-reduce:animate-none` on the spinners.

<sub>Merged from: accessibility:Visual and mobile polish: raw select values shown, header pill wraps at 320px, keep checkboxes look like radios, reduced motion ignored · correctness:The brief form's dropdowns show raw lowercase values ("living room", "mid") instead of their labels</sub>

### Accessibility & mobile

<a id="a11y-01"></a>
#### A11Y-01: Upload zones can't be reached by keyboard or assistive tech, and the remove/delete buttons have no name and appear only on hover

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/components/upload-zone.tsx:62-74`, `src/components/upload-zone.tsx:95-105`, `src/components/upload-zone.tsx:117`, `src/components/upload-zone.tsx:122-124`, `src/components/upload-zone.tsx:126-135`, `src/components/restage-app.tsx:74`, `src/components/restage-app.tsx:318`, `src/components/restage-app.tsx:387`, `src/components/my-styles-manager.tsx:410-416`, `src/components/my-styles-manager.tsx:494-501`

**Problem**

- The drop zone is `<div onClick={() => inputRef.current?.click()}>` with no role, tabIndex or key handler.
- The real control, `<input type="file" ... className="hidden">`, is display:none, which removes it from the tab order and the accessibility tree. In headless Chromium, 30 Tab presses never reached 'Room photo' or 'Floor plan'.
- The remove button contains only `<X/>`. lucide-react 1.45 marks icons aria-hidden, so the button has no accessible name.
- The remove button uses `opacity-0 ... group-hover:opacity-100`; measured opacity was 0 on touch and when focused. The style-grid delete button has the same pattern (my-styles-manager.tsx:498).
- A PDF preview is only a FileImage icon, with no filename (123).
- The same component handles 'Add images' in My Styles (410).

**Impact**

`canAnalyze` requires `roomFiles.length > 0`, so keyboard-only users, switch users and many screen-reader users cannot use the app at all, and cannot add images to styles. Touch users can't see how to remove a wrong photo or delete a style. This fails WCAG 2.1.1 (A), 4.1.2 (A) and 2.4.7 (AA).

**Recommendation** (verifier-corrected)

All changes are in src/components/upload-zone.tsx, plus one class change in my-styles-manager.tsx. None of them touches the AI pipeline.

1. Zone element: change the outer `<div>` at lines 62-74 to a `<label>` and delete its `onClick`. The label's native activation opens the picker, and keeping the programmatic `.click()` would fire it twice. Change the input's `hidden` to `sr-only` so it can be focused and assistive tech can see it. Add `aria-describedby` pointing at the description span (use a `useId` for the id). Show the focus state with `focus-within:ring-3 focus-within:ring-ring/50`. Keep the drag handlers on the label. For valid label content, the inner `<div>`s can become `<span className="flex ...">`, though browsers do not require it. Sketch:
```tsx
<label onDragOver={..} onDragLeave={..} onDrop={handleDrop}
  className={cn("flex cursor-pointer flex-col items-center gap-3 rounded-3xl bg-muted px-6 py-10 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50", dragging ? "bg-tint" : "hover:bg-[#ece8e2]")}>
  ...
  <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="sr-only" aria-describedby={descId} onChange={...} />
</label>
```
An equivalent alternative is to keep the div and add `role="button" tabIndex={0} aria-label={label}`, plus an onKeyDown that calls `inputRef.current?.click()` on Enter or Space.

2. Remove button (lines 126-135): add `aria-label={`Remove ${file.name}`}`. Replace `opacity-0 group-hover:opacity-100` with `opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100`. Tailwind 4.3.3 ships the `pointer-fine` variant, and its `hover` is already limited to `(hover: hover)`, which is why touch devices never show the button today. Always showing the 24px chip is an acceptable, even simpler, choice.

3. Style-grid delete (my-styles-manager.tsx:498): keep the existing aria-label and apply the same class change so the button appears on touch and when focused. A visible Delete button already exists in the detail view, so this is polish.

4. Non-image previews (lines 122-124): render a truncated `file.name` under the icon.

5. Same edit: move `URL.createObjectURL` out of render. Build the URLs in a `useEffect` keyed on `files` and revoke them in its cleanup, e.g. `useEffect(() => { const u = files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : null); setUrls(u); return () => u.forEach(x => x && URL.revokeObjectURL(x)); }, [files])`. Today every keystroke in BriefForm creates and leaks a blob URL per thumbnail and forces the photo to be decoded again.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I read upload-zone.tsx in full, every place that uses it (restage-app.tsx:318, 325, 364 and my-styles-manager.tsx:410), the style-grid and detail-view delete controls, button.tsx, and how lucide-react 1.45.0 and Tailwind 4.3.3 behave in node_modules. I also rebuilt the component's DOM with its real Tailwind classes and ran it in Playwright Chromium (/opt/pw-browsers/chromium-1194), once on desktop and once with touch emulation.

What is confirmed:
- `hidden` compiles to `display:none`. As a result, Tab goes straight from the link before the zone to the remove button. The file input never gets focus and is not in the accessibility tree. The zone div has no tabIndex, role or key handler, and there is no paste handler anywhere in src. A keyboard-only user therefore cannot pick a room photo. `canAnalyze` (restage-app.tsx:74) needs `roomFiles.length > 0`, so for that user the app is blocked. The same zone is the only way to add images in My Styles (my-styles-manager.tsx:410).
- lucide adds aria-hidden="true" to an icon when no aria-/role/title prop is passed (shared/src/build/buildLucideIconNode.mjs:48, hasA11yProp.mjs). The Chromium accessibility tree shows the remove button as `button ""`, with no name.
- Tailwind v4 wraps hover and group-hover in `@media (hover: hover)` (confirmed in the compiled CSS). The remove button measured opacity 0 while focused on desktop, stayed at 0 under touch emulation, and was still 0 after a tap. The button can still be tapped, just not seen. The style-grid delete button (my-styles-manager.tsx:498) uses the same `opacity-0 ... group-hover:opacity-100`, so its focus-visible ring is invisible too.
- A PDF preview is just the FileImage icon with no filename (upload-zone.tsx:123).

What the finding gets wrong or overstates:
- The title says the delete button has no name. It does: `aria-label={`Delete ${style.name}`}` at my-styles-manager.tsx:505. Only the upload-zone remove button is unnamed.
- "Touch users can't delete a style" is overstated. The style detail view has an always-visible `<Button variant="destructive">Delete</Button>` (my-styles-manager.tsx:341-353), which goes through the same requestDelete confirmation. The hover-only button in the grid is just a shortcut.
- The Room photo zone is single-file (`onChange(list.slice(0,1))`, line 42), so picking again replaces the photo. On touch, the real losses are:
  - clearing an optional floor plan (the zone is single-file, so it can only be replaced, never emptied);
  - removing one of several one-off style references.
- "Many screen-reader users" is plausible but was not verified per screen reader. The keyboard-only blockage is the claim that holds for certain.
- Severity: the stated usage model is a single owner who most likely uses a mouse or touch. For that owner, the keyboard block doesn't apply, and the touch problem hits secondary actions (clearing a floor plan, removing a style reference). By the rubric that is medium. It becomes high if the app is ever opened to other users, because it fails WCAG 2.1.1 (Level A).

Related issue listed in the sources but missing from the evidence, confirmed: upload-zone.tsx:117 calls `URL.createObjectURL(file)` during render and never revokes it. RestageApp keeps `brief` in state (`<BriefForm value={brief} onChange={setBrief}/>`, restage-app.tsx:387), so every keystroke re-renders every UploadZone. Each re-render creates new blob: URLs and changes each thumbnail's src, so the image is fetched and decoded again, and removed Files stay pinned in memory until the page unloads.

I tested the proposed fix: a `<label>` wrapping a `sr-only` input, plus `opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100` on the remove button. With it, the input is reachable by Tab (its role is button), the remove button shows opacity 1 when focused and under touch, and hover still works on desktop.

**Severity/fix lens: partially-confirmed, medium**

I read upload-zone.tsx in full, the three places it is used in restage-app.tsx (318, 325, 364), the My Styles use (my-styles-manager.tsx:410) and the grid and detail-view delete controls. I checked the installed libraries: lucide-react 1.45 (Icon.mjs, buildLucideIconNode.mjs) and tailwindcss 4.3.3 (dist/lib.js).

What holds up:
(1) The drop zone is a plain `<div onClick>` with no role, tabIndex or key handler (upload-zone.tsx:62-74). The only real control is `<input type="file" className="hidden">` (95-105). `hidden` is display:none, so the input is neither focusable nor in the accessibility tree. The component has no paste handler, and drag-and-drop needs a pointer. A keyboard-only user therefore cannot add a room photo, and `canAnalyze` requires `roomFiles.length > 0` (restage-app.tsx:74). The core flow is blocked for them, and so is "Add images" in My Styles.
(2) The remove button at upload-zone.tsx:126-135 contains only `<X/>`. lucide sets aria-hidden="true" when no a11y prop is passed (buildLucideIconNode.mjs:48), so the button has no accessible name.
(3) That button is `opacity-0 ... group-hover:opacity-100`. In Tailwind v4 the hover variant is wrapped in `@media (hover: hover)` (lib.js: `i.static("hover",...B("@media","(hover: hover)"...))`), so touch devices never show it, and nothing makes it visible on focus. It stays invisible but still tappable.
(4) A non-image preview (the PDF floor plan) shows only a FileImage icon and no filename (upload-zone.tsx:122-124).

What is overstated or wrong:
- The style-grid delete button does have a name, `aria-label={`Delete ${style.name}`}` (my-styles-manager.tsx:501). Only its hover-only visibility is a problem, and it lacks focus-visible:opacity-100.
- "Touch users can't delete a style" is wrong. The style detail view has a visible, labelled Delete button (my-styles-manager.tsx:341-353), and deletion goes through a confirm step (259-290).
- The "Add images" zone passes `files={NO_FILES}` (414), so it never shows thumbnails or remove buttons. Only the keyboard problem applies there.
- For the single-file zones (room photo, floor plan), picking again replaces the file (`onChange(list.slice(0,1))`, line 42). The invisible X only matters for multi-file style references and for clearing the optional floor plan.

Severity: this is a single-owner personal app. The owner's main flows with a mouse or touch (upload, replace, delete a style) still work. The defect fully blocks keyboard and switch users, and makes removing a file hard to discover on touch. That fits "noticeable defect / meaningful improvement" (medium) better than "breakage in a common flow" (high) for this audience. It is still a WCAG 2.1.1 / 4.1.2 Level A failure and cheap to fix.

The fix is mostly sound, with two corrections:
- If the zone becomes a `<label>`, the existing `onClick={() => inputRef.current?.click()}` must be removed. Otherwise the label's native activation and the programmatic click both fire.
- Tailwind 4.3 ships a `pointer-fine` variant, which is cleaner than the arbitrary `[@media(hover:hover)]` variant.

The listed maintainability source also holds up and belongs in the same edit. `URL.createObjectURL(file)` runs inside render (upload-zone.tsx:117) and is never revoked. The zone re-renders on every keystroke, because BriefForm's `onChange={setBrief}` (restage-app.tsx:387) updates RestageApp state. Each keystroke therefore creates a new blob URL per thumbnail and forces the image to be decoded again.

</details>

<sub>Merged from: accessibility:Upload zones cannot be reached by keyboard or assistive tech, and the remove-file buttons have no name and stay invisible · ux:Upload zones aren't keyboard-operable, and remove/delete controls appear only on hover · maintainability:UploadZone creates a new object URL per thumbnail on every render and never revokes them</sub>

<a id="a11y-02"></a>
#### A11Y-02: The before/after slider has no keyboard or assistive-tech support and loses touch drags (no touch-action, no pointercancel)

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/components/before-after-slider.tsx:31-35`, `src/components/before-after-slider.tsx:42`, `src/components/before-after-slider.tsx:45-54`, `src/components/before-after-slider.tsx:72-79`, `src/components/restage-app.tsx:550-553`, `src/components/ui/slider.tsx:29`

**Problem**

- The container is a plain div with only onPointerDown, onPointerMove and onPointerUp (51-53). It has no tabIndex, role=slider, aria-valuenow or key handler; the harness measured tabIndex -1 and role null.
- It sets no touch-action (computed 'auto') and has no onPointerCancel or onLostPointerCapture.
- A CDP touch drag of 120px with 30px of vertical drift fired pointercancel. The divider moved from 50% to 58.6% instead of about 43%, and `dragging` can stay true.
- handlePointerDown calls updatePosition immediately (34), so any vertical scroll that starts on the image makes the divider jump to the finger.
- The accessible Base UI slider in ui/slider.tsx, which already has touch-none, role=slider and keyboard support, is unused.

**Impact**

Keyboard and screen-reader users are stuck at a 50/50 split on the core result. On phones, drags are jerky or cancelled, and scrolling past the image moves the divider. This fails WCAG 2.1.1 (A) and 4.1.2 (A); 2.5.7 is met because tapping sets the position.

**Recommendation** (verifier-corrected)

Keep the custom pointer handling and fix it in before-after-slider.tsx only.

1) Touch: add `touch-pan-y` to the container class, plus `touch-pinch-zoom` if pinch-zoom should keep working. Tailwind 4.3 composes the two. Then make the start of a touch drag wait for real horizontal movement, and undo any change if the browser takes over the gesture:
```tsx
const start = useRef<{x:number;pos:number;moved:boolean}|null>(null);
onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start.current = {x:e.clientX, pos:position, moved:false}; setDragging(true); if (e.pointerType !== 'touch') updatePosition(e.clientX); }}
onPointerMove={e => { const s = start.current; if (!dragging || !s) return; if (e.pointerType === 'touch' && !s.moved && Math.abs(e.clientX - s.x) < 6) return; s.moved = true; updatePosition(e.clientX); }}
onPointerUp={e => { if (e.pointerType === 'touch' && start.current && !start.current.moved) updatePosition(e.clientX); /* tap-to-set */ setDragging(false); }}
onPointerCancel={() => { if (start.current && !start.current.moved) setPosition(start.current.pos); setDragging(false); }}
onLostPointerCapture={() => setDragging(false)}
```
Capturing on `e.currentTarget` instead of `e.target` keeps capture on the element that owns the handlers.

2) Keyboard and screen readers: add a native range input that is visually hidden but still focusable, placed before the handle in the DOM. Arrow, Home, End and Page keys and screen-reader value announcements then work for free, and the pointer behavior is unchanged:
```tsx
<input type="range" min={0} max={100} step={1} value={Math.round(position)} onChange={e => setPosition(Number(e.target.value))} aria-label="Before/after comparison" aria-valuetext={`${Math.round(position)}% original photo shown`} className="peer sr-only" />
```
Give the handle knob a visible focus ring with `peer-focus-visible:ring-3 peer-focus-visible:ring-ring`.

What to avoid:
- Laying an opacity-0 range input over the whole image: it still jumps on vertical swipes, and on iOS it only responds to thumb drags.
- Laying ui/slider's touch-none Control over the image: it stops the page from scrolling there.
- Limiting drags to the handle: it breaks click-anywhere on desktop.

This touches no AI calls and does not affect output quality.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

The defects are real. I ran the actual component (transpiled with the repo's TypeScript, rendered with the repo's React 19.2.8 production build) in headless Chromium through Playwright under /tmp/.../scratchpad/slider/. The mobile context was 390x844 with hasTouch and isMobile, and touches were sent through CDP Input.dispatchTouchEvent.

What reproduced:
1. **Keyboard:** the container has tabIndex -1, role null and 0 focusable descendants. Tab lands on BODY and ArrowLeft does nothing.
2. **touch-action:** the computed value is "auto". Nothing in globals.css, Tailwind preflight, tw-animate-css or shadcn/tailwind.css sets it.
3. **Horizontal touch drag is worse than the finding says.** A perfectly straight 120px left drag starting at 70% fired pointerdown, 3 pointermoves, then pointercancel and lostpointercapture. The divider ended at 65.0% instead of 36.5%, and adding 30px of vertical drift gave the same result. So touch dragging moves only about 5% before Chrome cancels it, even with no vertical drift. Only tap-to-position works.
4. **Scrolling moves the divider.** A 200px vertical scroll starting on the image scrolled the page, but the divider jumped from 50% to 70%, the touch point, because pointerdown calls updatePosition at line 34.
5. **`dragging` stays true after pointercancel.** On a touch-plus-mouse context, moving the mouse with no button pressed afterwards moved the divider to 10%. This only affects hybrid devices; on phones every new touch sends pointerdown again, so it does no harm there.
6. **Mouse drag on desktop works** (50% to 20%).

The fix direction is confirmed: adding `touch-action: pan-y` to the container made the 120px drag reach exactly 36.5% with 20 pointermoves and a pointerup, and vertical scrolling still worked. The jump to the touch point on a vertical scroll remained, so the deferred update or threshold is also needed.

Where the finding is wrong or overstated:
- **Screen-reader impact.** Both images carry alt text ("After redesign" and "Before"), so screen-reader users get both images. A visual split means little to blind users. The people actually affected are sighted keyboard and switch users. For them the slider is the only view of the render (restage-app.tsx:550-553; there is no other full view or download), so they see only half of it at 50%.
- **Drive it from ui/slider.tsx.** This conflicts with the finding's own touch-pan-y advice. Base UI's Control carries `touch-none` (ui/slider.tsx:29) and does a track-press setValueFromPointer on a passive touchstart (node_modules/@base-ui/react/slider/control/SliderControl.js:308-339, 356). Wrapping the whole image in it would block page scrolling from the image on phones. Its size-3 thumb and h-1 track styling also don't fit an image overlay.

Severity: this is a single-owner app, and the core result view is degraded rather than unusable: tapping still sets the position (so WCAG 2.5.7 is met), and desktop mouse works. That puts it at medium, a noticeable defect in the core view, rather than high.

**Severity/fix lens: partially-confirmed, medium**

The defects are real, but the finding overstates the severity and parts of the fix need correcting.

What I checked in the code:
- before-after-slider.tsx:45-54: the container is a bare div with only pointer handlers. It has no tabIndex, role, aria-* or onKeyDown, no touch-action class, and no onPointerCancel or onLostPointerCapture. `select-none` only sets user-select, and globals.css has no touch-action rules.
- Line 34 calls updatePosition on pointerdown.
- The component is used once, at restage-app.tsx:550-553. It is the only place the rendered image is shown: there is no full view and no download.
- ui/slider.tsx (Base UI 1.8, with `touch-none` on its Control at line 29) is imported nowhere.

Browser test: I copied the component's handlers into a plain page and ran CDP touch drags in headless Chromium 1194 (375px mobile viewport, container 343px wide).
- With the default touch-action auto, a pure horizontal 120px drag got 2 pointermoves, then pointercancel. The divider stopped at 44.2% instead of 15%, and `dragging` stayed true.
- With 30px of vertical drift the result was the same.
- With `touch-action: pan-y`, both drags reached 15.0% and ended with pointerup.
- A vertical scroll swipe that started on the image moved the divider to 85% under both auto and pan-y. So pan-y alone does not fix the jump-on-scroll. The touch path needs a deferred start or a revert.
- A stuck `dragging=true` does no harm on touch-only screens. With a hovering pen, or on a hybrid touch-and-mouse device, it can move the divider without a press.

Keyboard and screen readers: the failures of WCAG 2.1.1 and 4.1.2 are real. Keyboard users only ever see a 50/50 split of the one render view.

Severity: this is a single-owner personal app, so screen-reader and keyboard-only use is unlikely. On phones, tapping to set the position still works; only dragging is broken. That makes this a noticeable UX defect with a workaround, not a breakage of the core flow: medium, not high.

Problems with the recommended fix:
- A transparent native range input laid over the image still jumped to the touch point on a vertical swipe in Chromium (value 86.7, while the page scrolled 166px). On iOS Safari a range input only responds when you drag its thumb. So the overlay option does not fix the touch problems.
- An invisible input shows no focus ring unless the handle is styled for it.
- Laying the Base UI Control, which has touch-none, across the whole image would stop the page from scrolling from any touch on it, which is a regression on phones.
- Allowing drags only from the handle would remove click-anywhere and drag-anywhere on desktop, which is also a regression.

</details>

<sub>Merged from: accessibility:The before/after slider cannot be used from the keyboard, is invisible to assistive tech, and loses touch drags to page scrolling · correctness:The before/after slider has no touch-action or pointercancel handling, so dragging is unreliable on touch screens · ux:Before/after slider forces a 3:2 crop, render size ignores the photo's orientation, and dragging is weak on touch and keyboard</sub>

<a id="a11y-03"></a>
#### A11Y-03: Progress, status and error messages are never announced, and stage state is shown only visually

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/progress-stages.tsx:36`, `src/components/progress-stages.tsx:45`, `src/components/progress-stages.tsx:65`, `src/components/restage-app.tsx:424`, `src/components/my-styles-manager.tsx:259`, `src/components/my-styles-manager.tsx:292`, `src/components/my-styles-manager.tsx:419`, `src/components/style-picker.tsx:85`

**Problem**

- There is no aria-live, role=status or role=alert anywhere in src; the harness counted 0 live regions.
- During analysis, the accessibility tree for the stages reads only 'Analyzing room 2 Designing 3 Rendering 4 Sourcing furniture'. The completed `<Check>` and current `<Loader2>` icons are aria-hidden, so nothing says which stage is done or running.
- The statusText `<p>` mounts only when non-empty (`{statusText && (...)}`, line 65), so adding aria-live to it alone would still miss the first message.
- The error boxes, the delete confirmation and 'Uploading images (1 of 2)…' are plain divs.

**Impact**

The 1–3 minute analyze → plan → render → shop pipeline is silent for screen-reader users, and failures go unnoticed. This fails WCAG 4.1.3 (AA) and 1.3.1 (A).

**Recommendation**

- Add one always-mounted `<div role="status" aria-live="polite" className="sr-only">` in RestageApp, fed from changes to currentStage and statusText.
- Render the stages as an `<ol>` with `aria-current="step"` and sr-only 'completed' / 'in progress' text.
- Render errors with role="alert".
- Use `motion-safe:animate-pulse` on the status line.

<a id="a11y-04"></a>
#### A11Y-04: Focus and scroll position are not managed between steps, and the results view has no h1 or h2

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:77`, `src/components/restage-app.tsx:305`, `src/components/restage-app.tsx:390`, `src/components/restage-app.tsx:436`, `src/components/restage-app.tsx:532`, `src/components/restage-app.tsx:556`, `src/components/shopping-list.tsx:15`

**Problem**

- The Analyze button sits inside `{!inventory && (...)}` (390), so it is disabled and then unmounted while it has focus. In the harness, activeElement was BODY during and after analysis, even when triggered with Enter.
- `showKeepStep` includes `!generating` (77), so pressing Generate unmounts the whole keep section, including the focused button. Focus again goes to BODY.
- When results arrive, the upload and brief sections unmount (`!hasResults`, 305) but window scroll stays where it was. Measured scrollY was 517 at 375×667 and 657 at 320×568, with the slider's top at -507px, so the user lands mid-rationale or mid-list. The same large layout jump happens after analysis, with no scrollIntoView.
- The h1 renders only when `!hasResults`, so the results view's heading outline is just H3 'Design rationale' and H3 'Shopping list'.

**Impact**

Keyboard and screen-reader users are sent back to the start of the document with no cue about what changed. Mobile users land mid-page and have to scroll up to find their render. This fails WCAG 2.4.3 (A) and 1.3.1 (A), and falls short of the intent of 2.4.6.

**Recommendation**

- Keep a persistent h1 and add an h2 for the results section.
- After analysis, focus the 'What should stay?' heading (`tabIndex={-1}` plus `ref.focus()`) and `scrollIntoView({block:'start'})`.
- When generation starts, focus the progress region.
- When results arrive, `window.scrollTo({top: 0})` and focus the results h2.

<sub>Merged from: accessibility:Focus and scroll position are not managed between steps, and the results view has no h1 or h2 · ux:Inputs stay editable during in-flight runs (stale results leave odd states), and there is no scroll handling between steps</sub>

<a id="a11y-05"></a>
#### A11Y-05: The Manage styles overlay does not behave as a modal: focus is not moved, trapped or returned, and the delete button is invisible when focused

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/style-picker.tsx:55`, `src/components/style-picker.tsx:78`, `src/components/style-picker.tsx:148`, `src/components/style-picker.tsx:150`, `src/components/my-styles-manager.tsx:203`, `src/components/my-styles-manager.tsx:259`, `src/components/my-styles-manager.tsx:498`

**Problem**

The overlay is a `div role="dialog" aria-modal="true"` with a window-level Escape listener (55-63, 148-175), and nothing else. In the harness:
- After clicking 'Manage styles', focus stayed on the trigger outside the dialog.
- Tab then reached the background 'Modern 2 images' card, then Close, New style, the card, 'Delete Modern', and then back out to the background 'Or upload one-off references…'.
- The background is not inert, and body overflow stays 'visible', so the page behind scrolls on mobile.
- After Escape, focus landed on BODY instead of the trigger.

The grid delete Button uses `opacity-0 transition-opacity group-hover:opacity-100` (my-styles-manager.tsx:498); its measured opacity while keyboard-focused was 0. The delete confirmation appears at the top of the manager (259) without moving focus or announcing itself. The dialog uses aria-label although it contains two h3 headings.

**Impact**

Keyboard users tab around behind the overlay, screen-reader users are not placed in the dialog, and focus is lost on close. This fails WCAG 2.4.3 (A) and 2.4.7 (AA).

**Recommendation**

- Use a native `<dialog>` opened with `showModal()`, which provides focus containment, an inert background, Escape handling and `::backdrop`, or use Base UI Dialog.
- Return focus to the 'Manage styles' button on close, and point aria-labelledby at the title h3.
- Add `focus-visible:opacity-100 [@media(hover:none)]:opacity-100` to the delete button.
- Move focus to the confirmation's Cancel button when it appears.

<a id="a11y-06"></a>
#### A11Y-06: Several text and UI-state colours fall below WCAG AA contrast (placeholders, faint text, error text, focus ring, switch, checkbox)

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/app/globals.css:69`, `src/app/globals.css:77`, `src/app/globals.css:130`, `src/components/brief-form.tsx:111`, `src/components/refine-bar.tsx:66`, `src/components/keep-picker.tsx:44`, `src/components/keep-picker.tsx:131`, `src/components/upload-zone.tsx:80`, `src/components/upload-zone.tsx:92`, `src/components/shopping-list.tsx:23`, `src/components/progress-stages.tsx:56`, `src/components/restage-app.tsx:425`, `src/components/restage-app.tsx:451`, `src/components/restage-app.tsx:485`, `src/components/my-styles-manager.tsx:261`, `src/components/my-styles-manager.tsx:304`, `src/components/ui/button.tsx:6`

**Problem**

Ratios computed from the tokens with the WCAG luminance formula:
- **--faint #a89c92 on white: 2.68:1.** Used for shopping-list notes, pending stage labels and the 'items detected' line.
- **--faint on --muted #f2efeb: 2.34:1.** Used for every placeholder (brief-form, keep-picker:131, refine-bar:66) and the upload hint. For the keep and refine inputs the placeholder is the only label.
- **--muted-foreground #7c7168 on --muted: 4.15:1** (3.89:1 on the #ece8e2 hover). Affects the 14px upload-zone description and the style warning box.
- **text-destructive (#e7000b) on bg-destructive/10 (#fde6e7): 3.99:1** at 14px. Affects the main error box, the delete confirmation and the destructive Button.
- **Non-text.** Switch off track #ddd5cc is 1.45:1 on white (restage-app.tsx:485); keep-checkbox border #cdc5bc is 1.71:1.
- **Focus.** outline-ring/50 and ring-ring/50 render as #e0a591, 2.12:1 on white and 1.85:1 on muted.

**Impact**

Low-vision users can't read hints, notes, placeholders or errors, can't tell whether the auto quality check is off, and can't follow keyboard focus. This fails WCAG 1.4.3 (AA) and 1.4.11 (AA).

**Recommendation**

Checked candidates:
- `--muted-foreground: #6b6158`: 6.04:1 on white, 5.27:1 on muted, 4.95:1 on hover.
- Text currently on --faint, including placeholders: use muted-foreground, or #70665d (4.89:1 on muted).
- Non-text borders and the switch off track: at least #8f847a (3.65:1 on white, 3.19:1 on muted).
- Error text: #c10007 (5.40:1 on the tint).
- Focus: a solid outline-ring / ring-ring (4.95:1) with outline-offset-2 instead of the /50 variants.

<a id="a11y-07"></a>
#### A11Y-07: Selection states and field labels are missing for assistive tech (preset chips, keep and refine inputs, refine chips, style cards)

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/brief-form.tsx:115`, `src/components/keep-picker.tsx:120`, `src/components/refine-bar.tsx:40`, `src/components/refine-bar.tsx:61`, `src/components/style-picker.tsx:119`

**Problem**

- The selected style preset is shown only by `bg-foreground text-background` (brief-form.tsx:115-128), with no aria-pressed.
- The 'Add another keep item' input and the refine input have no label or aria-label. The accessibility tree names them from their placeholders, so the refine field is announced as 'e.g. swap the sofa for something in cognac leather'.
- The refine chips follow a plain `<span>Refine this design</span>` with no role=group.
- Each style card button contains `<img alt={style.name}>` plus the same name as text, so its accessible name repeats the style name.

**Impact**

Screen-reader users can't tell which preset is active or what the refine field is for. This fails WCAG 4.1.2 (A) and 1.3.1 (A).

**Recommendation**

- Add `aria-pressed={selected}` to the preset chips.
- Add sr-only labels or aria-labels ('Keep another item', 'Describe a change').
- Wrap the refine chips in `<div role="group" aria-labelledby=...>`.
- Use `alt=""` on thumbnails inside buttons that are already named.

### Performance

<a id="perf-01"></a>
#### PERF-01: /api/blob serves immutable blobs as 'private, no-cache' with no validators, and style thumbnails are the full 2048px originals

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/app/api/blob/route.ts:18-29`, `src/lib/blob.ts:115-143`, `src/lib/ai/styles.ts:156-165`, `src/components/style-picker.tsx:117-123`, `src/components/my-styles-manager.tsx:393-405`, `src/components/my-styles-manager.tsx:466-472`

**Problem**

The proxy responds with `"Cache-Control": "private, no-cache"` and forwards no ETag or Last-Modified. The browser must revalidate but has nothing to revalidate with, so every view is a full re-download through a serverless function.

Every renders/ and uploads/ pathname embeds `${Date.now()}-${crypto.randomUUID()}` and is never overwritten; allowOverwrite only matters for style.json. get() already returns `blob.etag` and supports `ifNoneMatch`, answering with a 304 (@vercel/blob dist/index.d.ts:147-152).

toSummary's thumbnailUrl is the first original image (about 0.75 MB), shown in roughly 200px tiles in StylePicker on every page load and in the manager grid. The detail grid loads every original eagerly, without loading="lazy".

**Impact**

With 8 styles, about 6 MB downloads before the user does anything. Each view costs repeated function invocations and Blob transfer, and the picker is slow on mobile.

**Recommendation**

- For renders/ and uploads/, return `Cache-Control: private, max-age=31536000, immutable` and `ETag: result.blob.etag`. Pass `ifNoneMatch` from the request's If-None-Match header to get() and answer 304 when it matches.
- At style upload, generate a WebP thumbnail of about 480px, store its `thumbPathname` in the manifest, and use it in toSummary and the grids; load the full image on click.
- Add loading="lazy", decoding="async" and explicit width and height to these images.
- Keep plain <img> and silence the no-img-element rule with a reason. next/image's default loader does not forward headers (docs 02-components/image.md:86-87), so it can't fetch an auth-protected /api/blob. A local src with a query string would also need an exact `images.localPatterns.search` match.

<sub>Merged from: performance:/api/blob disables caching for immutable blobs, and style thumbnails are the full 2048px originals · ux:Thumbnails re-decode on every keystroke, and immutable blob images are served no-cache · platform:Image proxy sends 'private, no-cache' with no validators, so every view re-downloads the full blob through a function</sub>

<a id="perf-02"></a>
#### PERF-02: UploadZone creates a new blob: URL for every thumbnail on every render and never revokes them

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/upload-zone.tsx:108-120`, `src/components/restage-app.tsx:53`, `src/components/restage-app.tsx:318-332`, `src/components/restage-app.tsx:387`, `src/components/brief-form.tsx:156`, `next.config.ts:3-5`

**Problem**

`<img src={URL.createObjectURL(file)} … />` runs during render. RestageApp holds the brief, statusText and keepItems state, and none of its children are memoized. Every keystroke in BriefForm, every keep toggle and every SSE status update therefore re-renders every UploadZone and creates new blob: URLs. The harness counted 4 createObjectURL calls while typing 4 characters.

Each new URL changes the img `src`, so the browser fetches and decodes the full-resolution original (12–48 MP) again. There is no URL.revokeObjectURL anywhere. React Compiler is not enabled (next.config.ts is empty).

**Impact**

Typing jank and flicker on phones. Blob URLs and decoded bitmaps pile up for the lifetime of the page, even after files are removed.

**Recommendation**

- Move each preview into a per-file child: `const url = useMemo(() => URL.createObjectURL(file), [file]); useEffect(() => () => URL.revokeObjectURL(url), [url]);`. Alternatively, create the URL in a useEffect.
- Preview the prepared (at most 2048px) blob instead of the original.
- Wrap UploadZone and StylePicker in memo and pass stable callbacks.
- Optionally enable `reactCompiler: true` to cut re-renders app-wide.

<sub>Merged from: performance:UploadZone creates a new object URL for every thumbnail on every render and never revokes them · ux:Thumbnails re-decode on every keystroke, and immutable blob images are served no-cache · accessibility:Upload previews create a new object URL on every render (every keystroke) and never revoke them · correctness:UploadZone creates a new object URL for every thumbnail on every render and never revokes them · maintainability:UploadZone creates a new object URL per thumbnail on every render and never revokes them · platform:UploadZone mints a new blob: URL for every thumbnail on every render and never revokes it</sub>

<a id="perf-03"></a>
#### PERF-03: Style images are prepared all at once with Promise.all: memory spikes, and one bad file fails the whole selection

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/styles-client.ts:85-90`, `src/components/restage-app.tsx:150`, `src/components/restage-app.tsx:233`, `src/lib/prepare-image.ts:35-45`, `src/lib/prepare-image.ts:77-86`, `src/components/my-styles-manager.tsx:134-162`

**Problem**

`Promise.all(files.map(prepareImageForUpload))`, and likewise `Promise.all(styleFiles.map(fileToPreparedDataUrl))`, decodes every file at the same time at full size with `createImageBitmap(file, { imageOrientation: 'from-image' })`. Each file also gets its own 2048px canvas, which is never released (for example with canvas.width = 0).

Because it is Promise.all, one file that can't be decoded (for example HEIC in Chrome, or a file still over 4 MB after compression) rejects the whole selection, and the error message doesn't name the file.

**Impact**

A 12 MP photo is about 48 MB as RGBA, and a 48 MP one about 192 MB. Adding 10 photos to My Styles can briefly need 0.5–2 GB plus canvas memory, which risks iOS Safari tab reloads or canvas memory-limit errors. One bad photo blocks all the others.

**Recommendation**

- Prepare 1–2 images at a time with a small concurrency limit, and use Promise.allSettled.
- Upload the files that prepared successfully and report skipped ones by filename.
- Set canvas.width = canvas.height = 0 after toBlob.
- Consider OffscreenCanvas in a worker.

<sub>Merged from: performance:Client decodes every selected photo at full resolution concurrently · ux:Style uploads re-derive the profile per batch, concurrent drops lose images, and one bad file fails the whole selection</sub>

<a id="perf-04"></a>
#### PERF-04: heic-convert (libheif wasm) loads at module scope on the render and refine path, for a branch the app never reaches

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/ai/normalize-image.ts:1`, `src/lib/ai/normalize-image.ts:25-32`, `src/lib/ai/normalize-image.ts:47-61`, `src/lib/ai/render.ts:4`, `src/lib/client-api.ts:142-144`, `src/app/api/styles/[id]/images/route.ts:53-58`

**Problem**

`import convertHeic from "heic-convert"` loads heic-decode, which loads libheif-js/wasm-bundle.js. That file runs `module.exports = require('./libheif-wasm/libheif-bundle.js')()`, instantiating an embedded wasm bundle of about 2 MB at import time; libheif-js is 8.5 MB on disk. Measured locally: 66–88 ms to require, and about 26 MB extra RSS. render.ts imports normalize-image.

heic-convert is not in Next's default serverExternalPackages list (sharp is, server-external-packages.jsonc:88), so it is bundled into the route chunks.

The branch is unreachable from the app: the client always converts HEIC to JPEG or throws (prepare-image.ts:51-64), and the style upload route rejects HEIC. Prebuilt sharp only decodes HEIF for .avif (`sharp.format.heif.input.fileSuffix` is ['.avif']), so the 'try sharp first' branch always fails and logs a warning before heic-convert runs.

**Impact**

Adds cold-start latency and memory to /api/render and /api/refine, the most latency-sensitive routes, and bloats their bundles with effectively dead code.

**Recommendation**

Load it lazily inside heicToJpeg with `const { default: convertHeic } = await import("heic-convert")`. Alternatively, remove heic-convert and reject HEIC on the server (skip sharp for sniffed HEIC), since the client already converts.

<sub>Merged from: performance:heic-convert loads at module scope in the render and refine path, although HEIC never reaches the server from the app · platform:normalize-image: sharp runs with safety limits removed on unauthenticated input, and HEIC wasm is instantiated at import for a path the client never reaches · maintainability:Dependency hygiene: two unused deps, shadcn CLI in production deps (298 extra packages), no engines field, and a deprecated AI SDK API used at 5 call sites</sub>

<a id="perf-05"></a>
#### PERF-05: The styles list makes N+1 origin Blob reads and is fetched twice after every change

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/ai/styles.ts:168-179`, `src/lib/blob.ts:84-107`, `src/components/style-picker.tsx:26-53`, `src/components/style-picker.tsx:172`, `src/components/my-styles-manager.tsx:53-80`, `src/components/my-styles-manager.tsx:106-107`, `src/components/my-styles-manager.tsx:147-148`

**Problem**

listStyles calls `list({ prefix: 'styles/' })` and then fetches every style.json with `useCache: false`, straight from origin. `list()` is not paginated (default limit 1000).

StylePicker and MyStylesManager each fetch the list on mount. After every create, upload or delete, the manager runs `await refresh(); onStylesChanged?.()`. The second call is StylePicker.refresh, so every mutation triggers two full 1+N listings back to back.

**Impact**

Minor: extra function time and billed Blob operations, and the picker loads more slowly as the number of styles grows.

**Recommendation**

- Lift the summaries into a single owner (StylePicker) and pass them, plus a refresh function, down to MyStylesManager. Apply each mutation's response instead of listing again.
- Alternatively, keep a small `styles/index.json` (id, name, updatedAt, imageCount, thumbPathname, summary) written on each manifest save.

<sub>Merged from: performance:The styles list makes N+1 origin reads and is fetched twice per change · platform:Style listing makes N+1 origin Blob reads and is fetched twice after every change</sub>

### Platform (Next.js 16 / Vercel)

<a id="plat-01"></a>
#### PLAT-01: Images travel as base64 JSON on every call: the room photo is re-uploaded for every step, and one-off references or PDFs push requests past Vercel's 4.5 MB body limit after the plan is already billed

**Severity:** 🟡 Medium (auditor said high; verifiers corrected it) · **Effort:** S · **Verification:** ✅ Partially confirmed · **Auditor confidence:** high

**Locations:** `src/components/restage-app.tsx:140-144`, `src/components/restage-app.tsx:148-150`, `src/components/restage-app.tsx:153-188`, `src/components/restage-app.tsx:227-233`, `src/components/restage-app.tsx:364-371`, `src/components/upload-zone.tsx:36-46`, `src/lib/client-api.ts:11-12`, `src/lib/client-api.ts:141-144`, `src/lib/prepare-image.ts:3-5`, `src/lib/prepare-image.ts:99-103`, `src/lib/ai/images.ts:12-23`, `src/lib/styles-client.ts:5-6`, `src/lib/blob.ts:124-132`, `src/app/api/render/route.ts:56-60`, `src/app/api/refine/route.ts:52-62`

**Problem**

The code knows about the limit: styles-client.ts:5 says 'Stay under Vercel's ~4.5MB serverless request body' (README:98 says the same), but only the My Styles uploader batches.

- **Room photo re-prepared.** handleGenerate calls `fileToPreparedDataUrl(roomFiles[0])` again (141-143), although roomDataUrl already came from the same function on the same File in handleAnalyze (103, 108). The 'stale HEIC' comment at 140 is out of date.
- **Same bytes posted repeatedly.** The same ~1 MB base64 string goes to /api/plan (169), /api/render (182) and every /api/refine (227-238). Each one-off reference goes along as another data URL (183, 241), and refine re-decodes and re-encodes all of them.
- **No caps.** The one-off UploadZone is `multiple` with no cap. MAX_OUTPUT_BYTES allows 4 MB per image, about 5.3 MB as base64, so even one maximum-size image fails /api/analyze. PDFs pass through uncompressed (client-api.ts:143).
- **When it fails.** Typical 2048px q0.85 JPEGs are 0.5–1.5 MB, so a room photo plus 2–3 references exceeds 4.5 MB. The platform returns 413 before the function runs, and the user sees 'That photo is too large…'. /api/plan, which carries only the room photo, has already succeeded and been billed by then.
- **Unused helper.** `uploadUpload` (blob.ts:124), with uploads/room and uploads/floorplan prefixes, exists but is never called.
- **State.** The multi-MB roomDataUrl is also held in state and in the DOM (restage-app.tsx:66, 442, 551).

**Impact**

One-off references and PDF floor plans fail every time once a few are added. The error message is misleading, and a paid plan call has already run. Refine then keeps failing for the rest of the session.

Every Generate uploads about 2 MB plus about 1 MB per reference, and every refine uploads 1 MB or more. Each image also costs 0.3–1 s of client decode and encode, which is slow on mobile.

**Recommendation** (verifier-corrected)

**Minimal fix (small effort; keeps output quality)**

1. **Stop re-preparing the room photo.**
   - In handleGenerate (restage-app.tsx:140-144) and handleRefine (227-230), use `const roomImage = roomDataUrl;`.
   - Drop the re-encode, the `setRoomDataUrl` calls and the stale comment.
   - Remove roomFiles from both dependency lists.

2. **Prepare each one-off reference only once.** Memoize in client-api.ts:
```ts
const prepared = new WeakMap<File, Promise<string>>();
export function fileToPreparedDataUrl(file: File, opts?: { maxEdge?: number }) {
  const hit = prepared.get(file); if (hit) return hit;
  const p = (isPdf(file) ? fileToDataUrl(file) : prepareImageForUpload(file, opts).then(fileToDataUrl));
  p.catch(() => prepared.delete(file)); prepared.set(file, p); return p;
}
```
   - Key the cache by maxEdge if the same File can be prepared with different options.
   - A simpler alternative is to prepare references once when they are added, in UploadZone's onChange, and keep the data URLs in state.

3. **Downscale and cap one-off references.**
   - Give `prepareImageForUpload` a `maxEdge` parameter (prepare-image.ts:3, 66).
   - Call it with about 1024 for one-off references; that is about 0.15–0.35 MB each.
   - Keep 2048 for the room photo, because architecture fidelity matters there.
   - This does not hurt output quality: render.ts:94 tells the image model to use references for "mood/materials only — do NOT copy layout".
   - Add a `maxFiles` prop to UploadZone (for example 4) and use it for "Style references".

4. **Fail fast, before any billed call.**
   - In handleGenerate, after preparing, compute `roomImage.length + styleRefs.reduce((n, s) => n + s.length, 0)`.
   - If it exceeds about 4,000,000, throw a specific error ("Too many/large reference images — remove some or use a saved style") before calling /api/plan.
   - Make parseApiError's 413 message stop blaming "that photo". It can mention the total upload or reference images instead.

5. **Fix PDF floor plans separately.** They are broken whatever their size, because toFilePart relabels application/pdf as image/jpeg. Either:
   - rasterize page 1 on the client (for example with pdf.js) and pass it through prepareImageForUpload, or
   - remove `.pdf` from accept (restage-app.tsx:331) and the "Image or PDF" copy.

**Optional structural change (medium effort) to stop re-sending the room photo**

1. **Persist the prepared JPEG once, on the server.** Reuse the existing unused `uploadUpload` rather than adding a client-token route:
   - either add a small multipart route, `POST /api/uploads`, that validates with sniffImageKind and stores through uploadUpload('room' | 'style'),
   - or have /api/analyze persist the room image and return its pathname.
2. **Accept pathnames downstream.** plan, render and refine accept `roomImagePath` and `styleRefPaths`, and load them with the existing `urlToImageInput` (images.ts:46-53), which already enforces isAllowedBlobPathname.
3. **If you use `@vercel/blob/client` upload() plus handleUpload instead** (it supports `access: 'private'` in @vercel/blob 2.8.0):
   - set `maximumSizeInBytes` to about 5 MB, not 15 MB, since prepared images never exceed about 3 MB;
   - set allowedContentTypes to image/jpeg, image/png and image/webp;
   - use `addRandomSuffix: true` and a short `validUntil`;
   - note that the token route is unauthenticated, the same exposure as /api/styles/[id]/images.
4. **Either way, add a retention policy.** Room photos of a private home would otherwise sit in Blob indefinitely. Delete `uploads/room/*` on photo reset, or prune entries older than N days.

**Low-priority polish**

Show the before image with `URL.createObjectURL(preparedBlob)` instead of a ~1–2 MB data URL.

Do not claim this reduces AI token spend. The gain is avoiding a wasted plan call when the render body would fail, plus less bandwidth and client CPU.

<details><summary>Verification notes</summary>

**Reproduce lens: partially-confirmed, medium**

I traced the client flow and the server routes from start to finish, and checked the platform limit against node_modules.

What holds up:
1. **Redundant re-prep of the room photo.** handleAnalyze prepares the room photo with fileToPreparedDataUrl and stores it in roomDataUrl. handleGenerate (140-144) and handleRefine (227-230) prepare the same File again. resetFromPhotoChange nulls roomDataUrl whenever the file changes, so roomDataUrl always matches roomFiles[0]. The re-prep is pure waste. git show b9a9a64 shows the "stale HEIC" comment was added in the same commit that switched analyze from fileToDataUrl to fileToPreparedDataUrl. The situation it guards against can no longer happen.
2. **Repeated uploads.** The room photo is posted as base64 JSON to /api/plan and /api/render, and again on every /api/refine. One-off references are re-prepared and re-posted on every Generate and every Refine.
3. **Platform limit.** The 4.5 MB body limit is real. @vercel/blob's README says so ("limited to the request body your server can handle. Which in case of a Vercel-hosted website is 4.5 MB"). The 413 is caught by parseApiError and shown as "That photo is too large to upload. Try a smaller image or fewer at once." Locally, Next route handlers have no body cap, and there is no proxy file, so the failure only shows up on Vercel.
4. **Inconsistent client cap.** MAX_OUTPUT_BYTES is 4 MiB, which becomes about 5.6 MB as base64. A single image between about 3.2 and 4 MiB passes the client check and still fails the platform. This is rare in practice for 2048px q0.85 JPEGs.
5. **No count limit on references.** The one-off UploadZone is `multiple` with no cap, and nothing checks the total payload size.
6. **Plan is billed before the failure.** handleGenerate calls /api/plan (room photo only) before /api/render (room photo plus references). If render gets a 413, the plan call has already been paid for. Each retry of Generate pays for it again.
7. **Dead helper.** uploadUpload (blob.ts:124) is never called.

What is wrong or overstated:
- **"Refine then keeps failing for the rest of the session" is false.** Refine is only reachable when hasResults is true, which needs a successful render. The one-off UploadZone is hidden while results are shown, so styleFiles cannot change. The refine body equals the render body plus a short URL and the instruction, so it cannot newly exceed the limit.
- **"Fail every time once a few are added" is overstated.** The raw budget is about 3.2–3.4 MB across the room photo and all references. With camera photos (about 0.5–1.2 MB each after prep), the break point is roughly the room photo plus 3–4 references. Web-sourced inspiration images are not upscaled, since prepare-image uses scale = min(1, …). They stay around 100–300 KB, so many references fit.
- **PDF floor plans are not part of the post-plan failure.** They go only to /api/analyze, which fails before anything is billed. They are also broken for a separate reason: toFilePart (images.ts:18-22) relabels application/pdf as image/jpeg.
- **This is mostly not AI API usage.** The same bytes still reach the models. The savings are client bandwidth, client CPU, and the wasted plan call, which is a cheap vision LLM call next to image generation.
- **Severity.** The broken path is the optional one-off references section, which is collapsed by default. The main saved-style path sends styleId and styleRefs = [], so it is unaffected. This is a single-owner app. Medium fits the rubric better than high.
- **The recommended 15 MB maximumSizeInBytes is too permissive.** There is no auth, and the client never produces more than about 4 MB.

**Severity/fix lens: partially-confirmed, medium**

I read all the cited code and checked the library code it relies on. The core mechanism is real, but several impact claims are overstated or wrong, and the severity should be medium, not high.

**Confirmed**
- **Room photo re-prepared.** handleAnalyze sets roomDataUrl from fileToPreparedDataUrl (restage-app.tsx:103, 108). handleGenerate (140-144) and every handleRefine (227-230) run fileToPreparedDataUrl on the same File again. The "stale HEIC" comment at line 140 is out of date: roomDataUrl is already a canvas-made JPEG. A photo change resets roomDataUrl and inventory (79-88), so roomFiles[0] always matches it.
- **One-off references re-encoded every time.** They are re-decoded and re-encoded on every Generate and every Refine (148-150, 231-233). They are sent as base64 JSON with no cap: UploadZone `multiple` (upload-zone.tsx:39-40) has no maximum.
- **Plan is billed before render can fail.** handleGenerate calls /api/plan (room image only) before /api/render (room plus references). An oversized render body therefore fails only after one generateObject plan call has run. The 413 error text, "That photo is too large…" (client-api.ts:11-12), points at the photo rather than the references.
- **Unused helper.** uploadUpload (blob.ts:124-132) is never called (grep).
- **4 MB cap too loose for JSON.** 4 MB of image becomes 5.33 MB as base64, above Vercel's 4.5 MB function body limit. Next's bundled docs define body limits only for Server Actions and proxy; there is no proxy.ts or middleware.ts, so the Vercel platform limit is the one that applies.

**Overstated or wrong**
1. **"Refine then keeps failing for the rest of the session" is false.** Refine is only reachable once hasResults is true. The upload section is hidden at that point (`!hasResults &&`, line 305), so the references cannot change. The refine body carries the same room image and the same references as the render body that already succeeded, plus only small strings. If render fit, refine fits.
2. **"Even one maximum-size image fails /api/analyze" cannot happen in practice.** I measured with sharp/libjpeg at q85:
   - pure random noise at 2048x2048 is 2.85 MB (3.80 MB as base64);
   - a moderately detailed 2048x1536 image is 1.28 MB (1.71 MB as base64);
   - a smoother one is 0.52 MB.

   The 4 MB guard never trips at a 2048px edge. Analyze carries at most one room photo (the room zone is single-file) plus a floor plan, which stays under 4.5 MB when both are images.
3. **PDF floor plans are broken whatever their size.** toFilePart (images.ts:12-23) relabels any non-image mediaType as image/jpeg. The AI SDK only overrides the declared mediaType when the bytes sniff as an image (node_modules/ai/dist/index.js:1777-1785), so the provider receives PDF bytes labelled as JPEG. "Once a few are added" also does not apply, since there is only one floor plan.
4. **The threshold is about 3–4 detailed phone photos, not "2–3".** At roughly 1.0–1.7 MB base64 each, a room photo plus 2–4 references crosses 4.5 MB. Web or Pinterest references (1000px or less, 0.1–0.3 MB) rarely do.
5. **Little AI cost is involved.** The wasted call is one designer-model plan call; no image generation is lost. The repeated uploads cost bandwidth and client CPU, not AI tokens.

**Why medium, not high**
- The failing flow is the secondary one: one-off references sit behind a collapsed "Or upload one-off references" toggle.
- In the primary saved-style flow, references are resolved on the server (render/route.ts:52-57, refine/route.ts:48-49), and bodies carry only the room image (about 2 MB or less).
- It is a real, uncapped UX failure that happens after a billed call, but it is not a breakage in a common flow.

**Checking the proposed fix**
- `@vercel/blob/client` upload() plus handleUpload does work with `access: 'private'` in the installed @vercel/blob 2.8.0 (client.d.ts; onBeforeGenerateToken supports allowedContentTypes, maximumSizeInBytes, addRandomSuffix and validUntil).
- It is not the minimal fix, and it has trade-offs:
  - it adds a new unauthenticated token-minting route;
  - 15 MB is far more than prepared images ever need;
  - room photos would stay in Blob indefinitely, with no cleanup (a privacy and storage issue);
  - every step adds Blob GETs.
- Downscaling one-off references is sound for quality, because the render prompt says references are for "mood/materials only — do NOT copy layout" (render.ts:94). The room photo should stay at 2048px for fidelity to the architecture.

</details>

<sub>Merged from: api-cost:Images travel as base64 JSON on every call, so one-off references push render and refine past Vercel's 4.5 MB body limit · performance:Room photo is re-prepared and re-uploaded as base64 JSON for plan, render and every refine; one-off references push requests past Vercel's 4.5 MB body limit after plan has already been billed · ux:Room photo and one-off references go as base64 JSON on every call and can hit Vercel's body limit after the plan is paid for · correctness:JSON routes carry base64 images, so a few one-off references push /api/render past the 4.5 MB body limit (after the plan is paid) · platform:JSON routes carry base64 images and routinely exceed the 4.5 MB Vercel Functions request body limit; the room photo is re-uploaded on every step · maintainability:The client re-encodes and re-uploads the room photo and style references on every Generate and Refine</sub>

<a id="plat-02"></a>
#### PLAT-02: The env checks require static keys, blocking the OIDC auth the README recommends, and misconfiguration only shows up mid-pipeline

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/env.ts:17-23`, `src/lib/api.ts:8-26`, `src/lib/ai/gateway.ts:10-24`, `README.md:22`, `README.md:29`, `README.md:60`, `src/app/page.tsx:1-5`, `src/app/api/render/route.ts:19-22`, `src/app/api/plan/route.ts:19-25`

**Problem**

`hasAiGateway()` is `Boolean(process.env.AI_GATEWAY_API_KEY)`, and checkAiConfig and getGateway return 503 or throw without it. But @ai-sdk/gateway already falls back to OIDC when no key is set: getGatewayAuthToken calls getVercelOidcToken() (node_modules/@ai-sdk/gateway/dist/index.js:3787-3803). That token comes from the x-vercel-oidc-token request header, or from VERCEL_OIDC_TOKEN (@vercel/oidc/dist/get-vercel-oidc-token.js:68).

Similarly, hasBlob() requires BLOB_READ_WRITE_TOKEN, while @vercel/blob 2.8 resolves OIDC plus BLOB_STORE_ID first (chunk-YYMLUMXS.js:173-197).

README:29 says 'On Vercel deployments, prefer OIDC authentication instead of a static key.'

Nothing checks configuration up front. With the Blob token missing, analyze and plan both run (2 LLM calls) before /api/render returns 503, and plan's loadManifest error is swallowed by getJsonBlob.

**Impact**

A deployment set up the way the README recommends returns 503 from every AI route. That forces a long-lived static key into production env vars, which is costly if it leaks and riskier with no auth in front. A partly configured deployment wastes paid calls before it fails.

**Recommendation**

- Let the SDKs resolve credentials: call createGateway() without apiKey, and map GatewayAuthenticationError to 503.
- If a pre-check stays, use `Boolean(AI_GATEWAY_API_KEY || VERCEL || VERCEL_OIDC_TOKEN)`; checking VERCEL covers runtime, where the token arrives as a header.
- For Blob, use `Boolean(BLOB_READ_WRITE_TOKEN || BLOB_STORE_ID)`. Keep the token if you adopt handleUpload, which derives client tokens from it.
- Have page.tsx (a Server Component) compute `{ai, blob}` and pass it to RestageApp, which shows a banner and disables Analyze and Generate when a dependency is missing.
- Update the 503 messages and the README.

<sub>Merged from: ux:AI config check requires AI_GATEWAY_API_KEY even though the README recommends OIDC; misconfiguration shows up only mid-pipeline · platform:The env gating hard-requires static keys, so the OIDC auth the README recommends can never work (AI Gateway and Blob) · maintainability:README and code have drifted: the documented OIDC setup is blocked by the API-key gate, and routes, env vars and model APIs are misdocumented</sub>

<a id="plat-03"></a>
#### PLAT-03: Inputs use a 15px font on phones, so iOS Safari zooms the page on every focus

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/components/brief-form.tsx:39`, `src/components/brief-form.tsx:159`, `src/components/keep-picker.tsx:131`, `src/components/refine-bar.tsx:66`, `src/components/ui/input.tsx:11`, `src/components/ui/textarea.tsx:9`

**Problem**

The base Input and Textarea use `text-base md:text-sm`, which is 16px on mobile. Callers pass `text-[15px]`: fieldClass (brief-form.tsx:39), the textarea (:159), keep-picker.tsx:131 and refine-bar.tsx:66. Running the project's `cn` on these class lists drops `text-base` and keeps `text-[15px]`. In Chromium at 375px, computed font-size is 15px for #style, #region and #function. iOS Safari zooms the viewport when a field smaller than 16px gets focus, and does not zoom back out.

**Impact**

Every text entry on an iPhone (style, region, room use, keep item, refine) zooms the layout. Users have to pinch back out, and the sticky refine bar ends up offset or partly hidden.

**Recommendation**

Use `text-base sm:text-[15px]` in fieldClass and the other three class strings. Alternatively, keep the primitives' `text-base` and apply 15px only from `sm:` up.

### Maintainability & testing

<a id="maint-01"></a>
#### MAINT-01: No server-side error logging and no AI usage or cost capture, so savings and quality can't be measured

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/api.ts:41-54`, `src/app/api/analyze/route.ts:53`, `src/app/api/render/route.ts:109`, `src/lib/ai/analyze.ts:61-73`, `src/lib/ai/plan.ts:30`, `src/lib/ai/critique.ts:22-73`, `src/lib/ai/shopping.ts:21-54`, `src/lib/ai/style-profile.ts:41`, `src/lib/ai/render.ts:58-65`

**Problem**

- **Errors.** All 10 route catch blocks just `return apiError(message)` with no console.error. streamStatus turns thrown errors into SSE error frames without logging them. The only logs in the codebase are 3 console.warn/error calls in normalize-image.ts. Because the routes catch everything, Next's instrumentation onRequestError never sees these errors either.
- **Usage and cost.** Every AI call reads only `result.object` or `{ image }`. usage, warnings, finishReason, retry counts and the `providerMetadata.gateway` cost fields (gatewayCostMetadataKeys, node_modules/ai/dist/index.js:12640-12648) are all discarded. Warnings only go through process.emitWarning.
- **Retries.** generateImage defaults to maxRetries 2 and also retries empty results, so one renderRoom can bill up to 3 generations without any trace.
- **Unused features.** @ai-sdk/gateway supports `providerOptions.gateway.tags`/`user` and `getSpendReport({ groupBy: 'tag' })`.

**Impact**

Production failures are invisible in Vercel logs. The owner can't see:
- spend per stage
- the critique pass rate or re-render rate
- retries or reasoning tokens
- whether a change cut cost without hurting quality

Every other cost recommendation depends on this.

**Recommendation**

- Wrap each AI call in `tracedAi(stage, fn)`, which logs one JSON line: `{reqId: x-vercel-id, route, stage, model, ms, inputTokens, outputTokens, reasoningTokens, gatewayCost, warnings, critiquePassed, reRendered, retried}`.
- Pass `providerOptions: { gateway: { tags: ['restage', `stage:${stage}`] } }` so the Gateway spend report groups by stage.
- console.error the full error, including its cause, before returning the sanitized message.
- Set maxRetries explicitly (1 for images).
- Optionally set `globalThis.AI_SDK_LOG_WARNINGS` to forward SDK warnings to the same log, and add OpenTelemetry later.

<sub>Merged from: api-cost:No usage or cost telemetry, so no saving can be measured · maintainability:No server-side error logging and no AI usage or cost capture</sub>

<a id="maint-02"></a>
#### MAINT-02: No tests and no CI, and in Next 16 `next build` no longer lints, so the current lint error ships

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `package.json:5`, `src/components/restage-app.tsx:70`, `src/lib/client-api.ts:3`, `src/lib/client-api.ts:99-104`

**Problem**

package.json has only dev, build, start and lint scripts: no test or typecheck script, and no .github workflow. The bundled Next 16 upgrade guide (upgrading/version-16.md:1084) says 'next build no longer runs linting', so the react-hooks/set-state-in-effect error never blocks a Vercel deploy. `next typegen` must run before `tsc`, because layout.tsx uses the generated global LayoutProps.

The pure modules already contain bugs a small test suite would catch:
- keep.ts over-matching
- toFilePart relabelling PDFs
- the blob path check
- a bare `JSON.parse(line.slice(6))` in the SSE parser, with no reader.cancel() on error
- the BODY_TOO_LARGE regex never matching Vercel's `FUNCTION_PAYLOAD_TOO_LARGE` text (underscores) and containing a probable typo, 'functional payload'. This is harmless today only because `status === 413` is checked first.

**Impact**

Regressions in prompt assembly, keep logic, blob path allowlisting and SSE parsing reach production unnoticed, and there is no way to check that cost-reduction changes preserve behaviour.

**Recommendation**

- Add Vitest with vite-tsconfig-paths, as the bundled Next 16 testing guide describes.
- Add scripts `"typecheck": "next typegen && tsc --noEmit"` and `"test": "vitest run"`.
- Add a GitHub Actions job on Node 22: npm ci, lint, typecheck, test, next build.
- Start with tests for keep.ts, toFilePart/dataUrlToImageInput, isAllowedBlobPathname, prompt assembly and the SSE parser.

<a id="maint-03"></a>
#### MAINT-03: Route handlers duplicate boilerplate, render and refine copy the quality gate, and style resolution exists in 3 divergent versions

**Severity:** 🟡 Medium · **Effort:** M · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/app/api/analyze/route.ts:33`, `src/app/api/plan/route.ts:19`, `src/app/api/plan/route.ts:42`, `src/app/api/shopping-list/route.ts:32`, `src/app/api/render/route.ts:48`, `src/app/api/render/route.ts:77`, `src/app/api/refine/route.ts:55`, `src/app/api/refine/route.ts:78`, `src/app/api/styles/[id]/images/route.ts:19`, `src/app/api/styles/[id]/images/route.ts:53`, `src/lib/ai/critique.ts:55`, `src/lib/ai/shopping.ts:44`

**Problem**

- **Dead non-stream branches.** analyze, plan and shopping-list each spell out the AI call twice, once for `if (stream)` and once for the non-stream path. Every client call passes onStatus (restage-app.tsx:113, 172, 187, 196, 245, 253), so the non-stream branches are never used.
- **Duplicated quality gate.** The critique plus corrective re-render block is duplicated almost line for line in render/route.ts:77-97 and refine/route.ts:78-98.
- **Three versions of style resolution:**
  - plan: resolveStyleProfileText via loadManifest silently ignores a missing style.
  - render: resolveStyle throws 'Style not found', after the plan has already been billed.
  - refine: resolveStyle, but it discards the profile.
- **Repeated fetches.** The manifest is fetched separately by plan and render.
- **Duplicated checks.** The images route checks HEIC/MIME twice (53-64, then again in fileToImageInput 19-31).
- **Hand-built parts.** critique and shopping build `{type:'image'}` parts by hand, bypassing toFilePart.
- **Redundant runtime export.** `export const runtime = "nodejs"` is the Next 16 default.

**Impact**

Fixes and prompt changes have to be made twice and are already drifting: missing-style behaviour differs between routes, and refine loses the profile.

**Recommendation**

- Add `defineAiRoute({ schema, requires: ['ai','blob'], run: (input, { send, signal }) => ... })` in lib/api.ts to handle JSON parsing, zod validation, config checks, stream vs JSON response, logging and error sanitising.
- Move `renderWithQualityGate({ brief, instruction, roomImage, styleRefs, currentRender, signal })` into lib/ai.
- Add a single `resolveStyleContext(styleId)` that returns `{ profileText, images }`, with one policy for missing styles and a capped image count, and reuse it in refine.
- Thread `request.signal` into the AI calls.
- Add `import "server-only"` to lib/blob.ts, lib/env.ts and the lib/ai server modules.

<a id="maint-04"></a>
#### MAINT-04: One experimental model runs every LLM task with no per-task tuning, sampling controls or fallback, through the deprecated generateObject/system API

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** medium

**Locations:** `src/lib/env.ts:25-29`, `src/lib/ai/gateway.ts:26-32`, `src/lib/ai/analyze.ts:61-66`, `src/lib/ai/plan.ts:30-33`, `src/lib/ai/critique.ts:22-26`, `src/lib/ai/shopping.ts:21-24`, `src/lib/ai/style-profile.ts:41-46`

**Problem**

`getDesignerModel()` defaults to `deepseek/deepseek-v4-flash-vision-exp`, an 'exp' model, and serves analyze, plan, critique, shopping and style profiling. No call sets temperature, seed, maxOutputTokens, reasoning, or a `providerOptions.gateway.models` fallback.

Every call shares DESIGNER_SYSTEM_PROMPT ('Your job is to RE-DECORATE that exact room'), including the pure-inventory and inspiration-profile tasks, where it doesn't fit.

In ai@7, `generateObject` is marked `@deprecated Use generateText with an output setting instead` (node_modules/ai/dist/index.d.ts:7728), and `system` is marked `@deprecated Use instructions instead` (index.d.ts:688). Both are used at all 5 call sites. generateObject's options also omit `timeout` (`Omit<RequestOptions, 'timeout'>`), which generateText supports as `timeout: { totalMs }`.

**Impact**

Cost and quality can't be tuned per task. Shopping and style profiling could use the cheapest model, while the critique, whose verdict decides whether to pay for another image, may deserve a stronger judge at temperature 0.

An experimental model with no fallback means an outage or deprecation breaks every flow. A non-deterministic judge makes pass/fail flaky, so re-render cost varies, and analyses drift between runs. Migration will be forced when generateObject is removed.

**Recommendation**

- Add per-task env vars (ANALYZE_MODEL, PLAN_MODEL, CRITIQUE_MODEL, SHOPPING_MODEL, STYLE_MODEL), each defaulting to DESIGNER_MODEL, with stable vision defaults.
- Use temperature 0 for analyze and critique.
- Add `providerOptions: { gateway: { models: [fallback] } }`.
- Give each task its own short system prompt.
- Migrate the 5 call sites to one helper built on `generateText({ model, instructions, messages, output: Output.object({ schema }), timeout: { totalMs }, abortSignal, maxOutputTokens })`.
- Run a small fixed eval (5–10 room photos) comparing image-edit models already in the gateway catalog, such as gemini-3.1-flash-image, gpt-image-* and flux-kontext.

<sub>Merged from: api-cost:One experimental model serves every task, with no per-task settings, no fallback, and a deprecated API · ai-quality:One experimental model runs every LLM task with no sampling controls; deprecated API; README contradicts the code · platform:Deprecated AI SDK v7 APIs, an unused font, unused dependencies and dead code · maintainability:Dependency hygiene: two unused deps, shadcn CLI in production deps (298 extra packages), no engines field, and a deprecated AI SDK API used at 5 call sites</sub>

<a id="maint-05"></a>
#### MAINT-05: Dead code: unused exports, UI components, schema, starter assets and redundant declarations

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `src/lib/blob.ts:124-132`, `src/lib/env.ts:1`, `src/lib/env.ts:7`, `src/lib/client-api.ts:126`, `src/lib/ai/styles.ts:156`, `src/lib/ai/schemas.ts:126`, `src/components/ui/card.tsx:1`, `src/components/ui/checkbox.tsx:1`, `src/components/ui/progress.tsx:1`, `src/components/ui/slider.tsx:1`, `src/app/api/styles/[id]/route.ts:13`, `public/next.svg`

**Problem**

Grep finds only definitions, and no callers, for the following:
- `uploadUpload` (blob.ts:124), `getEnv` (env.ts:1) and `requireEnv` (env.ts:7).
- `fileToDataUrl` and `toSummary`, which are exported but used only inside their own modules.
- `styleManifestSchema`, which is never used to parse anything.
- ui/card, ui/checkbox, ui/progress and ui/slider (about 263 lines), which are imported nowhere.
- The five create-next-app SVGs in public/ (file, globe, next, vercel, window).

Also:
- globals.css defines a `.dark` theme that nothing applies, and 6 hard-coded hex colours (e.g. `hover:bg-[#ece8e2]`, `bg-[#ddd5cc]`) bypass the theme tokens.
- The hand-rolled `type Context = { params: Promise<{ id: string }> }` duplicates the generated `RouteContext<'/api/styles/[id]'>`.
- `export const runtime = "nodejs"` is the default everywhere.

**Impact**

Noise for maintainers and AI agents, and code that looks supported but has no tests.

**Recommendation**

- Delete these, or wire them in where they fit: uploadUpload is exactly what the upload-once fix needs, styleManifestSchema belongs in manifest parsing, and ui/slider can back the accessible before/after slider.
- Use RouteContext and drop the redundant runtime exports.
- Add knip (or ts-prune) to CI so dead code doesn't come back.

<sub>Merged from: maintainability:Dead code: unused exports, UI components, schema and starter assets · platform:Deprecated AI SDK v7 APIs, an unused font, unused dependencies and dead code</sub>

### Dependencies

<a id="dep-01"></a>
#### DEP-01: Dependency hygiene: unused clsx and tailwind-merge, the shadcn CLI in production deps, an unused preloaded font, and no engines field

**Severity:** ⚪ Low · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `package.json:11`, `package.json:17`, `package.json:24`, `package.json:26`, `package.json:32`, `src/app/globals.css:3`, `src/app/globals.css:11`, `src/app/layout.tsx:10-13`, `src/app/layout.tsx:25`, `src/lib/utils.ts:1`

**Problem**

- **clsx and tailwind-merge** have zero imports in src. `cn` comes from the `cn` package (lib/utils.ts:1 and ui/*), which is needed.
- **shadcn** is a CLI in runtime dependencies, there only to supply `@import "shadcn/tailwind.css"` at build time. Walking package-lock shows it adds 298 of the 414 packages in the production closure (@modelcontextprotocol/sdk, @babel/core, ts-morph, @dotenvx/dotenvx, execa, …) plus a second copy of cn@0.2.6.
- **Geist_Mono** is created in the root layout. next/font preloads it on every route (preload defaults to true), but no element uses font-mono.
- **Node version.** There is no `engines` field, and @types/node is ^20 while the runtime is Node 22.
- **Outdated.** `npm outdated` shows patch updates for ai (7.0.111) and @ai-sdk/gateway (4.0.89).

**Impact**

Larger installs and supply-chain surface, confusing ownership of `cn`, and an unnecessary font preload competing with first paint.

**Recommendation**

- `npm rm clsx tailwind-merge`.
- Move shadcn to devDependencies; Vercel installs devDependencies at build time.
- Drop Geist_Mono and `--font-mono` (or set `preload: false`).
- Add `"engines": { "node": ">=22" }` and bump @types/node to ^22.
- Add Dependabot or Renovate for the ai-sdk packages.

<sub>Merged from: performance:Unused runtime dependencies and a preloaded font nothing uses · maintainability:Dependency hygiene: two unused deps, shadcn CLI in production deps (298 extra packages), no engines field, and a deprecated AI SDK API used at 5 call sites · platform:Deprecated AI SDK v7 APIs, an unused font, unused dependencies and dead code</sub>

### Documentation

<a id="doc-01"></a>
#### DOC-01: The README has drifted from the code: routes, env vars, modules and the image-model API are misdocumented, and nothing warns that the app is unauthenticated

**Severity:** 🟡 Medium · **Effort:** S · **Verification:** Not verified · **Auditor confidence:** high

**Locations:** `README.md:29`, `README.md:44`, `README.md:84`, `README.md:100-107`, `src/lib/env.ts:17`, `src/lib/api.ts:8`, `src/lib/ai/gateway.ts:11`, `src/lib/ai/render.ts:58`, `.env.example:12`

**Problem**

- The README recommends OIDC (README:29), but the key-only gate blocks it; see the env-gating finding.
- README:105 says the image model runs 'via generateText → result.files[].uint8Array', but the code uses generateImage.
- The env table omits IMAGE_SIZE and IMAGE_QUALITY, which exist in .env.example:12-15 and env.ts:32-35.
- The routes table omits POST /api/plan, GET /api/blob and GET/DELETE /api/styles/[id]. It says /api/analyze returns a 'Design Brief' (it returns a RoomInventory) and /api/render returns a 'Blob URL' (it returns a /api/blob proxy URL).
- The modules table omits plan, keep, styles, style-profile, normalize-image, images and gateway.
- Nothing warns that the deployment is unauthenticated.

**Impact**

Following the docs breaks the deployment, and readers, including future AI agents working in the repo, learn the wrong architecture.

**Recommendation**

- Fix the image-model description.
- Update the env, route and module tables.
- Add a 'Security / exposure' section.
- Consider generating the routes table from the route files in CI.

<sub>Merged from: maintainability:README and code have drifted: the documented OIDC setup is blocked by the API-key gate, and routes, env vars and model APIs are misdocumented · ai-quality:One experimental model runs every LLM task with no sampling controls; deprecated API; README contradicts the code</sub>

## Appendix A: Auditor notes

These are each auditor's own summary notes, **not independently verified**. They include the per-flow accounting of AI calls and payload sizes (API cost and performance), which leads each auditor checked and dropped, and platform gotchas specific to Next.js 16.

<details><summary><strong>AI API usage & cost (includes the per-flow AI call accounting)</strong></summary>

What was checked: I read the whole repo at /home/user/restage and checked behaviour against node_modules (ai 7.0.99, @ai-sdk/gateway 4.0.80, @vercel/blob 2.8.0, Next 16.3.5 docs and source). Scratch scripts are in /tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad:
- sizes.mjs and sizes2.mjs measure prompt and JSON sizes.
- stream-cancel.mjs confirms that enqueue after a stream is cancelled throws.

Verified library facts:
- **Retries:** both calls default to maxRetries=2 on retryable errors (408/409/429/5xx), with 2 s / 4 s backoff. generateImage also retries empty-image results.
- **Gateway image model:** it forwards `size` and `providerOptions` as-is. Provider-specific options only apply to the provider they are keyed by.
- **Abort on disconnect:** Next's app-route passes `signalFromNodeResponse(res)` as request.signal, and pipeToNodeResponse cancels the body stream when the client closes.
- **Deprecation:** generateObject is deprecated and cannot take `timeout`.
- **Blob:** `put` supports `ifMatch` conditional writes.

Leads not reported as findings:
- **Concurrent refines:** RefineBar locks itself with its internal `loading`, and Generate/Analyze are guarded by `busy`, so concurrent refines or generates from the UI aren't possible. `disabled={generating}` on RefineBar is dead code, because `generating` is never true in the results view. The real concurrency gaps are the style-upload race and 'Change keep list' mid-refine.
- **Prompt caching:** the system prompt (~340 tokens) is below typical caching minimums; the ordering suggestion is in the token-waste finding.

Other observations, not listed because they are outside this dimension:
- normalize-image.ts:17 uses sharp `{unlimited: true}`, which disables the pixel limit; a decompression bomb could exhaust function memory.
- /api/blob sends `Cache-Control: private, no-cache` for immutable, uuid-named blobs. The style grid and picker load full ~2048px originals as thumbnails through the function on every view.
- The README says Gemini is used via generateText with files, but the code uses generateImage.
- The images go through a pointless round trip: bytes → data URL string → bytes (SDK) → base64 (gateway).

Per-flow AI call accounting

Assumptions:
- L = generateObject call on DESIGNER_MODEL (vision). I = generateImage call on IMAGE_MODEL.
- "≤2048" means the client-prepared JPEG with a long edge of at most 2048px (~3 MP, ~0.5-1.5 MB). "render" means Gemini output of ~1 MP (e.g. 1248x832 at 3:2), typically PNG.
- Text tokens are roughly chars/4 and include the system prompt (~340 tokens) where one is sent. The brief is measured on a representative 12-item room: pretty-printed ~1.2k tokens, compact ~1.0k, focused projection ~0.35k.
- Every L and I call can run up to 3 times with retries; the worst cases below show that.

CURRENT
| Flow | Calls | Images per call (resolution) | Text per call |
|---|---|---|---|
| Analyze | 1 L | room ≤2048 (+ floor plan; PDFs sent mislabelled) | ~1.35k (prompt 355 + inventory schema ~640) |
| Generate, gate OFF | 3 L + 1 I | plan: room ≤2048. render: room ≤2048 + R one-off refs ≤2048. shopping: render | plan ~1.65k (inventory JSON ~890). render instruction ~900. shopping ~1.9k |
| Generate, gate ON (default) | 3 L + 1-2 I | as above, plus critique: room ≤2048 + render. Re-render if the critique fails: render + room + refs | critique ~2.5k (brief 1.2k + rules 660). Re-render ~240 |
| Generate with saved style of N images | same as above | render I: 1+N images ≤2048 (N Blob downloads + sharp re-encodes). Re-render: 2+N | + profile text ~80 in plan and render |
| Generate example: gate on, N=10 | 3 L + 2 I worst case | 27 image attachments (1+11+2+12+1); 15 if the critique passes | as above |
| Each Refine, gate ON (default) | 2 L + 1-2 I | refine I: current render + room + N refs. critique: 2. re-render: 2+N. shopping: 1 | refine ~240. critique ~2.5k. shopping ~1.9k |
| Refine example: N=10 | 2 L + 1-2 I | 15-27 image attachments | as above |
| Each Refine, gate OFF | 1 L + 1 I | refine I: 2+N. shopping: 1 | as above |
| Re-analyze | 1 L | same as Analyze (runs even if only the brief changed) | same as Analyze |
| Change keep list → regenerate | same as Generate | plan re-runs even if the keep list is unchanged | same as Generate |
| Add style images in K batches | K L | batch k sends every image in the folder so far (P + n1 + ... + nk), each ≤2048 | ~650 each |
| Example: 20 photos, 4 batches | 4 L | 5+10+15+20 = 50 full-res attachments | ~650 each |
| Example: add 1 photo to a 30-image folder | 1 L | 31 full-res attachments | ~650 |
| Open a style | 0 if the profile is fresh. 1 L with all images if stale, repeated on every open while it keeps failing (and the open returns 500) | all images, ≤2048 | ~650 |
| List styles | 0 AI calls (1 Blob list + N manifest GETs) | none | none |

AFTER RECOMMENDATIONS
| Flow | Calls | Images | Text | Estimated reduction |
|---|---|---|---|---|
| Analyze | 1 L | room at 1024px | ~1.2k (overwritten fields dropped from the output schema) | Calls unchanged. Vision tokens −0-70% depending on tokenizer; upload −60-75% |
| Generate, gate OFF | 3 L + 1 I | plan: room 1024. render: room ≤2048 + ≤3 refs at 768. shopping: render at 1024 | plan ~1.3k. shopping ~0.9k | LLM text −30-50% |
| Generate, gate ON | 3 L + 1 I + (1 I only on a critical failure) | critique: 2 images at 1024, temperature 0 | critique ~1.0k | Critique text −60%. Fewer re-renders (measure the rate). A critique failure keeps the first render instead of forcing a regenerate, avoiding 1 L + 1-2 I per incident |
| Generate example: gate on, N=10 | as above | 27 → ≤10 attachments worst case (15 → 7 when the critique passes), at lower resolution | as above | as above |
| Each Refine (default) | 1 I + 0 L. Critique opt-in, and told the user's instruction. Shopping list on demand | current render + room (+ ≤1 ref at 768) | ~260 | From 2 L + 1-2 I to 1 I: LLM calls −100%, image gens −0-50%. Attachments 15-27 → 2-3 for N=10 |
| Re-analyze | 0 L when photo + roomType are unchanged (cached). 1 L only as an explicit re-scan | same as Analyze | same as Analyze | −1 L per unneeded re-analyze |
| Change keep list → regenerate | same as Generate after | plan reused when keep list, brief and style are unchanged | same as Generate after | −1 L in that case |
| Add style images in K batches | 1 L after the last batch | ≤12 images at 768 | ~650 | 20 photos / 4 batches: 4 L with 50 full-res attachments → 1 L with 12 at 768px. Calls −75%, attachments −76%, pixels about −95% |
| Add photos to a 30-image folder | 1 L | new images + previous profile text (incremental), or ≤12 at 768 | ~650 | large drop in image input |
| Open a style | 0 L. No derivation in GET; failed derivations are marked and retried explicitly with backoff | none | none | removes repeated paid calls on stale or failed folders |
| List styles | 0 AI calls | none | none | unchanged |

The absolute dollar savings are largest from four changes:
1. Closing the unauthenticated endpoints, which removes unbounded cost.
2. Not re-running the critique and shopping list on every refine.
3. Deriving the style profile once per upload session at low resolution.
4. Making the quality gate failure-isolated, which avoids paying for full regenerates after optional-step failures.

Image downscaling mostly saves payload and latency. Its token savings depend on the provider's image tokenizer, so verify them with the proposed usage logging before and after.

</details>

<details><summary><strong>Performance (includes bytes per flow)</strong></summary>

Scope: performance and efficiency, plus a few significant issues from other dimensions (auth/cost, SSRF, PDF handling, prompt ordering). I read all of the source and checked library behaviour in node_modules:
- @vercel/blob get(): useCache:false adds `cache=0` (origin read); returns an etag and supports ifNoneMatch/304; list() defaults to limit 1000.
- AI SDK 7.0.99 generateImage: data URL strings are decoded inside the retry loop, then the gateway re-base64s Uint8Array files. Default maxRetries is 2 and also covers empty-image results. `size` is always sent.
- Gateway language model: supportedUrls is `*/*`, so presigned Blob URLs could be passed instead of bytes.
- Next's Node server wires request.signal to the response closing.
- Scratch measurements under the scratchpad directory: sharp re-encode costs about 55 ms per 2048px JPEG; a 0.78 MB 16000x16000 PNG took 4.5 s and about 1.5 GB RSS; heic-convert require costs 66-88 ms and about 26 MB; a 1536x1024 PNG is about 3.1 MB versus about 0.4 MB as WebP/JPEG.

**Biggest latency contributors in Generate, largest first:**
1. generateImage (roughly 20-90 s depending on model and quality). It runs twice in sequence when the critique fails, and the user sees nothing until render, critique and any re-render all finish. Sending the first render as a preview SSE event would improve perceived latency.
2. Three sequential structured-output vision LLM calls (plan, critique, shopping). Shopping cannot start until the render and critique finish, and it needs its own request plus a Blob re-download of a 3 MB PNG.
3. Three sequential client-to-function round trips per Generate (plan, render, shopping), each possibly cold (render also loads heic-convert). The room photo goes up twice as roughly 1 MB of base64.
4. Server pre-processing: an origin read of every style image (useCache:false), a sharp re-encode of every input on every render and again on the re-render, and a 3 MB PNG upload before the critique.
5. Client: the room photo and refs are re-decoded, resized and re-encoded before plan and before every refine (about 0.3-1 s per image on phones).

**Bytes today vs after fixes.** Assumptions: a prepared 2048px JPEG is about 0.75 MB (about 1.0 MB as base64); a render PNG is about 3 MB.

| | Today | After fixes |
|---|---|---|
| Generate, upload | about 2.0 MB (plan 1.0 + render 1.0), +1.0 MB per one-off ref | about 10-20 KB of JSON |
| Generate, download | about 3 MB PNG | about 0.4 MB |
| Refine, upload | about 1.0 MB, +1.0 MB per ref | about 5-10 KB |
| Refine, download | about 3 MB | about 0.4 MB |
| Generate + 1 Refine, total | about 3 MB up (about 5 MB with one ref), about 6 MB down | about 20 KB up, about 0.8 MB down |
| Page load | plus N × 0.75 MB of full-size style thumbnails through a function | about 30 KB WebP thumbnails, cached immutable |
| Server to gateway, per Generate | about 11 MB with no saved style (plan 1.0, render 1.0, critique 1.0 + 4.1, shopping 4.1); a 12-image style adds about 13 MB per render call, doubled on re-render | about 2-3 MB (full-res room photo for the render only, 1024px inputs of about 0.2 MB for LLM calls, 3 or fewer downscaled refs) |

"After fixes" means: the room photo is uploaded once to private Blob as binary (about 0.75 MB, at analyze time) and later steps send pathnames only; renders are served as WebP/JPEG at about 0.4 MB and cached immutable.

**Other observations:**
- generateObject is marked `@deprecated Use generateText with an output setting` in ai v7 typings, and `system` is deprecated in favour of `instructions`.
- .env.example sets IMAGE_QUALITY=high. For gpt-image-1 at 1536x1024, high costs roughly 4x medium. It is ignored for the default Gemini model, because it is sent under providerOptions.openai.
- restage-app.tsx:28-45 builds `defaultBrief` at module scope from navigator.language. Node 22 defines `navigator` (navigator.language is 'en-US', verified), so the server renders 'United States' while a non-US browser starts from a different value, a hydration mismatch. The effect at line 69-71 (the baseline lint error) only masks this.
- Renders and discarded first renders are never deleted, so storage grows without bound. That is minor for a single owner.

</details>

<details><summary><strong>User experience</strong></summary>

Scope and method: I read every file in src plus the README and config. I checked library behaviour directly in node_modules: AI SDK generateImage options and normalizePrompt, GatewayImageModel forwarding size/aspectRatio/abortSignal, the gateway's OIDC fallback, React 19 input hydration, and the `cn` package. I also ran the real keep-matching function in a scratch script (/tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad/keep.mts). No repo files were modified.

Leads that did not hold or were narrowed:
- Refine does have a minimal loading state: RefineBar's local `loading` disables the chips and input and spins the submit button. The real problems are the invisible statusText, the cleared instruction on failure and the off-screen error.
- Multiple room photos cannot happen in the UI. The room UploadZone isn't `multiple`, and addFiles keeps only `list.slice(0, 1)`, so the roomFiles[0] concern doesn't apply.
- Brief edits after analysis are mostly applied: handleGenerate overrides roomType, style, budget, region and function. Only the floor plan is silently ignored until Re-analyze.
- Style deletion already has a confirmation step.
- 503 messages carry a README hint in both RestageApp and MyStylesManager. The real gap is that OIDC is treated as unconfigured and nothing checks config up front.
- The region hydration mismatch is cosmetic: React sets defaultValue on hydration, so the lint error at restage-app.tsx:70 does not produce a wrong visible region.

Outside my dimension: the missing authentication (open AI and Blob spend on the public URL) is the critical issue, and the security/cost reviewers will likely cover it. I included the SSRF in urlToImageInput because it is easy to miss.

Top 3 highest-leverage UX changes:
1. **Make results durable and reversible.** Keep a client-side render history (imageUrl, instruction, designBrief, shoppingList) with undo, compare and a Download link. Persist the session (brief, inventory, keep selection, history, and the room photo uploaded once to Blob) to localStorage or a projects/{id}.json Blob, and warn on unload while busy. This removes the biggest sources of lost work: refresh, refine drift, and "Change keep list".
2. **Make every stage non-destructive and retryable.** Fall back to the first render when the critique or re-render throws. Track status per stage, with "Retry shopping list" and a cached plan so a render retry skips /api/plan. Show refine progress on the slider and errors inline in the RefineBar, keeping the typed text. Add Cancel via an AbortController that reaches the AI calls through request.signal.
3. **Fix the "What should stay?" contract.** Replace fuzzy itemsMatch selection with index/ID-based keep selection, turn "Keep the sofa" and "Cheaper" into structured edits of the brief, and clear a deleted saved style from the selection. Together these stop renders and shopping lists from contradicting what the user picked.

</details>

<details><summary><strong>Accessibility & mobile</strong></summary>

Overall accessibility grade: D. Several Level A criteria fail in the main flow:
- 2.1.1: the required room-photo upload and the before/after slider cannot be used from the keyboard.
- 4.1.2: the remove buttons have no name, and the slider has no role or value.
- 4.1.3 (AA): no live regions anywhere.
- 1.4.3 and 1.4.11 (AA): the faint, placeholder, error, focus-ring, switch and checkbox colours are below contrast.

A keyboard-only or screen-reader user cannot get past the first step.

Top 3 fixes:
1. Make UploadZone keyboard- and screen-reader-operable. Use a focusable sr-only input or a real button with a visible focus style, and name the remove buttons and keep them visible on touch.
2. Rebuild the before/after slider on the unused Base UI slider in ui/slider.tsx or an input type=range, with `touch-action: pan-y` and a z-index fix against the sticky refine bar.
3. Add an always-mounted role=status region, role=alert errors and focus/scroll management between steps. In the refine loop, show statusText, keep the typed instruction on failure and show the error next to the bar.

How I verified: I transpiled the real components, bundled them and ran them in headless Chromium through Playwright, with /api/* mocked and the project's Tailwind CSS compiled. Tab order, the accessibility tree, focus after each step, touch drags via CDP, hit-testing, computed font sizes and layout were measured at 375×667, 320×568 and 667×375. Pixel measurements are approximate because Figtree was not loaded (fallback font).

Leads that did not hold, or that pass:
- The switch nested in a label works. Chromium names it from the wrapping label ('Auto quality check…'), role=switch and aria-checked are correct, and clicks do not double-toggle. Its only problems are the 1.45:1 off-state contrast and the 2.12:1 focus ring.
- The keep-picker rows (button role=checkbox with aria-checked) have correct names. The style-picker cards already use aria-pressed.
- No horizontal scroll at 320px, so 1.4.10 Reflow passes.
- Next's default viewport meta allows zoom.
- All targets are at least 24px, so 2.5.8 passes.
- Safe-area insets are not a problem: the refine bar is sticky rather than fixed, and viewport-fit=cover is not set.
- 2.4.11 Focus Not Obscured does not currently fail: the only focusable element in the results view, 'Change keep list', sits above the bar's natural position.

Outside this dimension, noted but not pursued: while generating, the upload and brief inputs stay editable, and changing the photo mid-run throws away results that were already paid for (resetFromPhotoChange). The remaining item, at src/components/restage-app.tsx:69-71, is the known lint error.

All scratch files are in /tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad/harness/ (screenshots s-*.png, scripts run1-6.cjs). No repository files were modified.

</details>

<details><summary><strong>Correctness</strong></summary>

Bugs most likely hitting the owner today, in rough order:
1. Keep-step coupling. Most rooms have two sofa-like pieces, several rugs or chairs, or a sideboard with a TV. Keeping one keeps all of them, so the redesign preserves things the user wanted replaced.
2. Refining with a saved style. The model is told the last input image is the original room photo, but it is actually a style reference. The corrective re-render also copies kept items from the render that just failed.
3. Portrait phone photos. Output is forced to 1536x1024 (or the size setting is ignored on Gemini), and the 3:2 object-cover slider crops the before and after images differently.
4. A deleted-but-still-selected style gives "Style not found" at render, after the plan was paid for.
5. The refine UX: no visible progress, the typed instruction is wiped on failure, and the critique can undo refinements that touch kept items.
6. Occasional lost renders when the critique or re-render throws.
7. PDF floor plans and three or more one-off style references (413).

Leads that did not hold, or hold only weakly:
- **Region hydration mismatch.** React 19 skips the input `value` attribute in hydration diffs, and `initInput` sets `defaultValue` from the client prop, so nothing mismatches visibly and nothing warns. The effect is simply redundant.
- **SSE parser.** The parser in client-api.ts handles events split across chunks correctly: it splits on the blank line between events and keeps the remainder. The server never emits non-JSON data lines. A timeout at maxDuration surfaces as the generic "Stream ended without result".
- **Enqueue after client disconnect.** Calling `enqueue` after a disconnect throws inside `send`, which accidentally stops the pipeline at the next step. No abort signal is passed on, though, so the in-flight model call keeps running and is billed.
- **list() without a cursor.** Real, but it only matters past 1000 blobs under one prefix (styles or one style's images), so I left it out.
- **Unbounded `roomImages` in analyze.** The UI only ever sends one image. This is API-abuse and cost exposure only.

Significant items outside my dimension that others should cover:
- There is no authentication on any route.
- `urlToImageInput` makes the server fetch arbitrary non-Blob URLs (src/lib/ai/images.ts:55): server-side request forgery via `currentRenderUrl` or `renderUrl`.
- sharp runs with `unlimited: true`, which removes its protections against decompression bombs.
- IMAGE_QUALITY defaults to "high", the most expensive gpt-image tier when an OpenAI image model is used.
- `generateImage` retries empty image results up to 2 times by default, so one render can bill 3 calls.
- The same room photo is uploaded 3–4 times per run (analyze, plan, render, each refine).
- `generateObject` is marked `@deprecated` in ai v7 (dist/index.d.ts:7728, "Use generateText with an output setting instead").

Scratch evidence is in /tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad/: keep.ts (keep matching), order.mjs (image order and flattened labels), urltest.mjs (blob allowlist bypass), sharptest.cjs (alpha turning black and truncated-JPEG acceptance). No repo files were modified.

</details>

<details><summary><strong>AI output quality</strong></summary>

Cost structure: image-generation calls dominate. The default per Generate is analyze (LLM+image), plan (LLM+image), render (image gen; generateImage defaults to maxRetries 2, so up to 3 attempts on empty results), critique (LLM with 2 images), usually one more image gen, then shopping (LLM+image). Each Refine is image gen + critique + likely another image gen + shopping. Trimming the text prompts matters little: for a realistic brief, pretty-printed JSON was 5040 chars vs 4004 compact (about 21% of roughly 1k tokens). The real levers are the number of image-gen calls and the number and resolution of images sent into them.

Changes that raise or keep quality while cutting cost (win-win):
1. Critique with severity levels, re-rendering only on blockers (fewer image calls; fixes aimed at real failures).
2. Tell the critique what the user asked to refine, so it stops reverting requested changes.
3. Cap saved-style references at 2–3 and downscale them to about 1024px; send none on refine. This also removes the image-order mislabel.
4. Derive the style profile once per upload and cap its images.
5. Compute aspect ratio from pixel dimensions and pass `aspectRatio` (free; removes a likely source of camera/aspect failures that trigger re-renders).
6. Id-based keep selection (fewer false keeps, fewer critique failures).
7. Remove output fields that are always overwritten.
8. Map fixed chips to brief changes ("Cheaper" updates only the shopping list, no image call) and make shopping regeneration on-demand.
9. Cache the room analysis per photo.
10. Shorter, positive image prompt.
11. temperature 0 on the judge.
12. Return both render candidates to the UI (zero cost).

Changes that trade cost for quality:
- A temporary style profile for one-off references (+1 cheap LLM call).
- An optional LLM A/B pick between the first and fixed render (+1 cheap call).
- Re-rendering from the original on architecture failures (same cost, different input).
- Web-search grounding for the shopping list (gateway perplexitySearch, extra tool cost).
- Stronger or stable judge and analysis models.
- A one-off evaluation of image-edit models.
- Keeping IMAGE_QUALITY=high if switching to gpt-image (the most expensive tier; consider medium for drafts and high only for the final render).

Leads I dropped: multiple room photos. The room UploadZone is single-file (UploadZone `multiple` defaults to false), so render and critique using only the first photo is moot in the UI. Keep-list crops for the critique: it already sees the original photo that contains the kept items.

Couldn't verify locally: how the gateway server treats `size` for the Gemini model, and whether it serves `google/gemini-2.5-flash-image` on /image-model (it is listed only as a language model). Hence medium confidence on that finding.

Outside my dimension, likely covered by other audits:
- All AI routes are unauthenticated on a public URL, so anyone can drive image generation. That is critical by the rubric (unbounded cost).
- `urlToImageInput` fetches any non-Blob URL server-side (refine currentRenderUrl, shopping renderUrl), which is an SSRF risk.
- One-off references plus the room photo are posted as base64 JSON and can exceed Vercel's ~4.5MB body limit.
- `hasAiGateway()` requires AI_GATEWAY_API_KEY even though the README recommends OIDC on Vercel.

Scratch evidence: /tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad/keep-test.mjs, flatten.mjs, size.mjs, z.mjs.

</details>

<details><summary><strong>Maintainability, deps & docs</strong></summary>

Read-only audit of all source files. Nothing in the repo was modified; scratch scripts are in /tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad/.

**How the leads held up:**
- **Holds:**
  - Route duplication.
  - render and refine both copy the critique + retry block.
  - Validation is inconsistent across routes.
  - restage-app.tsx has 18 useState hooks and real bugs follow from that.
  - There are no tests and no CI.
  - Dead code exists: uploadUpload, getEnv, requireEnv, the fileToDataUrl export.
  - README drift is real: it says generateText, recommends OIDC while the code requires an API key, and is missing IMAGE_SIZE/IMAGE_QUALITY, /api/plan and /api/blob.
  - env.ts and normalize-image.ts comments assume OpenAI.
  - The lint error and the `<img>` warnings reproduce.
  - Observability is missing.
- **Corrected:** the `cn` package IS used (ui/* and lib/utils import it). The unused packages are clsx and tailwind-merge. shadcn is used, but only for `shadcn/tailwind.css`, so it belongs in devDependencies. It adds 298 of the 414 packages in the production closure.
- **Could not reproduce:** the ESLint 9 deprecation warning did not print (eslint 9.39.5).
- **Found beyond the leads:**
  - PDF floor plans are relabelled image/jpeg.
  - An unused fetch fallback is an SSRF path.
  - Renders are forced to landscape and portrait photos get cropped.
  - keep.ts over-matches; I ran it in scratch and TV matches sideboard.
  - Style profiles are re-derived once per upload batch.
  - A style whose profile fails can't be opened.
  - Refines don't update the brief.
  - sharp runs with `unlimited: true`.

**Cheap cost cuts that don't touch quality (verified, not filed separately):**
- **Compact JSON in prompts.** critique.ts:44, shopping.ts:34 and plan.ts:48 use `JSON.stringify(brief, null, 2)`. On a representative brief that is 29% more characters than compact JSON (4476 vs 3466). Also send the critique only the architecture, keep list and strategy, and the shopping call only the strategy, constraints and keep list, not the full furniture inventory.
- **Lazy shopping list.** Generate it on demand instead of on every generate and refine.
- **Explicit retries.** Set `maxRetries` for generateImage; the default is 2 and it also retries empty results.
- **Honour cancellation.** Pass `request.signal` to AI calls; Next aborts it when the client disconnects.
- **Tag Gateway calls by stage.** Use `providerOptions.gateway.tags`, then check `gateway.getSpendReport({ groupBy: "tag" })` before and after each change.

**Minimal test suite to add first (Vitest + vite-tsconfig-paths, node environment):**
1. `keep.test.ts`: the false positives found in scratch (TV↔sideboard, sectional↔loveseat, "bankers lamp"↔sofa, "frugal shelf"↔rug), plus `applyKeepItems` extras and `uniqueKeepItems`.
2. `images.test.ts`:
   - `dataUrlToImageInput`: jpg/pjpeg become jpeg; an invalid URL throws.
   - `toFilePart`: must not relabel PDFs.
   - `urlToImageInput`: rejects non-blob URLs after the fix; mock `@/lib/blob` with `vi.mock`.
3. `blob.test.ts`: `isAllowedBlobPathname` (leading slash, "..", renders/ and uploads/ allowed, styles/ rejected); `extractBlobPathname` (proxy URL, absolute proxy URL on another host, encoded *.blob.vercel-storage.com path, garbage input).
4. `media-type.test.ts`: every magic number, HEIC brands, truncated buffers; `isHeicLike`.
5. `client-api.test.ts`:
   - `parseApiError`: 413, a Vercel `FUNCTION_PAYLOAD_TOO_LARGE` HTML body, a JSON error, an empty body.
   - `callApi` SSE with a mocked fetch: an event split across chunks, an error frame, a stream that ends with no result, a malformed frame.
6. `prompt.test.ts`: snapshots of `assembleImageInstruction` and `assembleRefineInstruction`, the keep-block fallback to `constraintsFromUser.keepItems`, and the style-profile suffix.
7. `style-profile.test.ts`: `computeStyleSignature` is order-insensitive; `styleProfileToText` drops empty arrays.
8. `api.test.ts`: `streamStatus` emits status, done and error frames.
9. `normalize-image.test.ts`: real sharp; a PNG with alpha becomes JPEG, an empty input is rejected, the passthrough fallback works.
10. After extracting `renderWithQualityGate`, a unit test using `MockLanguageModelV4` and `MockImageModelV4` from `ai/test` (both ship in ai@7). Critique fails → exactly one re-render. `qualityGate` false → no critique call. Needs a model-injection seam in gateway.ts.

**CI** (`.github/workflows/ci.yml`, on push and PR, Node 22, `npm ci`):
- `npm run lint` (optionally `--max-warnings=0` once the `<img>` warnings are handled).
- `npm run typecheck`, i.e. `next typegen && tsc --noEmit`. This is the documented CI command; typegen is needed for `LayoutProps` and route types.
- `npm test`.
- `npx next build`. No secrets are needed, since env checks run per request.
- `npm audit --omit=dev --audit-level=high`.

This matters more on Next 16 because `next build` no longer lints: CI is the only thing that would stop the current error from shipping. Add Dependabot for ai, @ai-sdk/gateway and next.

**Outside my dimension, not filed:** there is no authentication, so all paid and destructive endpoints are public, and routes return raw `error.message`. These belong to the security reviewer. Also, /api/blob serves immutable, UUID-named images with `private, no-cache`, and style thumbnails are full-resolution images.

</details>

<details><summary><strong>Platform (Next.js 16 / Vercel)</strong></summary>

Scope: Next.js 16 / React 19 / Vercel platform usage. I read every file listed. I checked each claim against node_modules (ai 7.0.99, @ai-sdk/gateway 4.0.80, @vercel/oidc, @vercel/blob 2.8.0, sharp 0.35.4, next 16.3.5 bundled docs). Scratch tests are in /tmp/claude-0/-home-user-restage/12e64087-3cbe-5ef6-9185-36491b1bd12c/scratchpad/:
- url.mjs: the %2e%2e allowlist bypass.
- sse.mjs: how a stream handler behaves after the client disconnects.

Leads that did not hold, or needed correcting:
- serverExternalPackages is not needed for sharp. Next 16 auto-externalizes it (next/dist/lib/server-external-packages.jsonc:88). heic-convert bundles fine; its problem is eager wasm instantiation, not bundling.
- `export const runtime = "nodejs"` and `maxDuration = 300` are valid in Next 16. runtime is simply the default. Edge and `preferredRegion` are deprecated, and the code uses neither.
- Route handler params are already awaited correctly.
- GET handlers are uncached by default, so there is no stale-list risk.
- I cannot see the Vercel project settings. `maxDuration = 300` on Hobby is only allowed with Fluid compute (without Fluid, Hobby caps at 60 s and the build rejects 300). Please confirm Fluid is on.

Next 16 gotchas relevant to this codebase:
1. Proxy:
   - It must be `src/proxy.ts`, at the same level as `app/`, exporting a function named `proxy`.
   - It always runs on Node; exporting `runtime` from it throws.
   - Once any proxy exists, request bodies are buffered, and bodies over `experimental.proxyClientMaxBodySize` (default 10 MB) are silently truncated rather than rejected. Large JSON bodies would then fail to parse locally or self-hosted; Vercel's 4.5 MB cap hits first in production.
   - The docs say to re-check auth inside handlers, not in proxy alone.
2. next/image:
   - A local src with a query string (like /api/blob?pathname=…) needs `images.localPatterns[].search`, which is an exact match. Omitting `search` lets any pathname be optimized.
   - The default loader never forwards request headers, so it cannot fetch an auth-protected /api/blob. Use `unoptimized`, keep <img>, or move to a path-based `/api/blob/[...path]` route.
   - Other v16 image changes: `minimumCacheTTL` now defaults to 4 h, `qualities` to [75], and `maximumRedirects` to 3.
3. `reactCompiler` is stable but off by default and needs babel-plugin-react-compiler.
4. `next lint` is removed. package.json already uses `eslint` directly, which is correct.
5. Turbopack is the default for build.
6. Node ≥20.9 is required. On Node ≥21 there is a global `navigator`, so `typeof navigator === 'undefined'` no longer detects SSR (this is the cause of the region mismatch finding).
7. `after()` runs within the route's maxDuration via waitUntil on Vercel. It suits orphan-render cleanup and deferred style-profile derivation.
8. Sync request APIs are gone. The code is compliant: it uses `LayoutProps` and awaits `params`. Switching to `RouteContext<'/api/styles/[id]'>` would be cleaner.

Other issues, mostly outside my dimension:
- The designer LLM receives the full 2048 px client images on every analyze, plan, critique and shopping call, with no server-side downscale.
- Each refine always re-runs the critique and regenerates the shopping list.
- `IMAGE_SIZE` is fixed at 1536x1024 while the prompt demands the input photo's aspect ratio, so portrait photos force reframing. Passing `aspectRatio` derived from the photo would likely cut failed critiques and re-renders.
- `providerOptions.openai.quality` does nothing with the default Gemini image model.

Baseline was unchanged by me: I edited no repo files and ran no git write commands.

</details>

## Appendix B: Baseline tool results

- `npx tsc --noEmit`: passes once route types are generated (`npx next typegen`).
- `npx eslint`: 1 error (`react-hooks/set-state-in-effect` at `src/components/restage-app.tsx:70`) and 4 `@next/next/no-img-element` warnings.
- `npm audit --omit=dev`: 0 vulnerabilities.
- No test suite and no CI configuration.

## Appendix C: Method

- 9 audit agents ran in parallel, one per dimension. Each read the whole codebase, checked library behavior in `node_modules` (ai 7.0.99, @ai-sdk/gateway 4.0.80, @vercel/blob 2.8.0, sharp 0.35.4, next 16.3.5 docs) and ran scratch experiments: keep-matching tests, sharp decompression-bomb measurement, SSRF URL parsing, Playwright accessibility runs, and prompt/payload size measurements.
- A merge agent combined the 153 raw findings into 64 unique ones by root cause.
- Each finding was then sent to skeptic agents told to disprove it (two for critical and high findings). 20 findings were verified before the run was stopped.
- All agents were read-only. No repository files were changed by the audit.
