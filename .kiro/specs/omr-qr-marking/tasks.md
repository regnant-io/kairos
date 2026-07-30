# Implementation Plan: OMR + QR Auto-Marking

## Overview

This plan implements the offline OMR + QR auto-marking pipeline in TypeScript, following the existing Kairos architecture (main-process services + typed IPC + Zustand store/React pages). Work starts from the deterministic pure core (shared types, layout, QR codec) and builds outward through the engine, scoring, persistence, IPC orchestration, and the renderer Review Interface, wiring each piece into the previous one so nothing is left orphaned.

Property-based tests (fast-check + vitest) validate the pure deterministic core against the design's 14 correctness properties; example and integration tests cover the I/O, rendering, and database edges. All test sub-tasks are marked optional with `*`.

## Tasks

- [x] 1. Set up test tooling and OMR dependencies
  - Add pure-JS runtime dependencies to `package.json` with pinned versions: `jimp` (image decode/pixel access), `jsqr` (QR decode), `qrcode` (QR encode)
  - Add dev dependencies: `vitest` (single-run test runner) and `fast-check` (property-based testing)
  - Add a `test` script running `vitest run` and a minimal `vitest.config.ts` that resolves the existing `@shared` path alias
  - _Requirements: 3.5, 7.3_

- [x] 2. Define shared domain types and the deterministic sheet layout
  - [x] 2.1 Create OMR domain types
    - Create `src/shared/omr-types.ts` with `SheetStatus`, `QrPayload`, `UNASSIGNED` sentinel, `DetectedAnswer`, `SheetDetection`, `AnswerOverride`, `OmrBatch`, `OmrSheet`, `OmrAuditRecord`, and `OmrConfig`
    - _Requirements: 2.5, 7.4, 7.5, 8.2, 8.3, 10.1, 10.2, 13.2, 13.3, 13.4_

  - [x] 2.2 Implement the shared SheetLayout module
    - Create `src/shared/omr-layout.ts` exporting `OMR_LAYOUT_VERSION`, `objectiveQuestions(exam)` (keep only `multiple_choice`/`true_or_false`, preserve exam order), and `buildLayout(exam, version)` producing one `RowLayout` per objective question with numbered rows, one bubble per MC option label, and exactly `['T','F']` bubbles for true/false, plus ≥4 corner fiducials and a QR area
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 14.1_

  - [ ]* 2.3 Write property test for layout generation
    - **Property 1: Layout reflects the exam's objective questions**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6**

- [x] 3. Implement the QR payload codec and decoder
  - [x] 3.1 Implement QrService
    - Create `src/main/services/QrService.ts` with pure `encodeText(payload)` / `parse(text)` inverses, `encode(payload)` (PNG data URL via `qrcode`), and `decode(img)` wrapping `jsqr` over an RGBA buffer, returning `{ payload, corners }` and `{ payload: null, corners: null }` on failure
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 5.1_

  - [ ]* 3.2 Write property test for QR payload round-trip
    - **Property 3: QR payload round-trip preserves identity and version**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**

- [x] 4. Implement answer-sheet generation
  - [x] 4.1 Extend ExportService with an answer-sheet builder
    - Add the `answer_sheet` export type and `AnswerSheetContent` to `ExportService`, implementing `buildAnswerSheetHTML` that positions the four fiducial squares, embeds the QR image in the QR area, and renders the numbered bubble grid from `SheetLayout` coordinates, reusing the existing `buildHTML` → hidden `BrowserWindow` → `printToPDF` machinery
    - _Requirements: 1.6, 1.7, 2.1_

  - [x] 4.2 Implement OmrSheetService.generate
    - Create `src/main/services/OmrSheetService.ts` that loads the exam, derives `objectiveQuestions`, returns a decline result (`ok: false`, non-empty message) when there are none, otherwise builds the layout, builds the `QrPayload` (`studentId ?? UNASSIGNED`), encodes the QR, and exports the sheet via `ExportService`
    - _Requirements: 1.5, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.3 Write property test for objective-less exam decline
    - **Property 2: Exams without objective questions are declined**
    - **Validates: Requirements 1.5**

  - [ ]* 4.4 Write example test for QR embedding in generated HTML
    - Assert the generated answer-sheet HTML embeds the QR image element
    - _Requirements: 2.1_

- [x] 5. Implement the OMR engine (alignment + deterministic detection)
  - [x] 5.1 Implement the homography solver and alignment
    - Create `src/main/services/OmrEngine.ts` with a 4-point homography solver and `align(img, layout, qrCorners)` that locates dark fiducial squares plus QR corners; with ≥4 correspondences it returns a homography and a `quality` heuristic, otherwise returns `{ ok: false, reason }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 5.2 Write property test for alignment
    - **Property 6: Alignment recovers geometry or fails cleanly**
    - **Validates: Requirements 6.2, 6.3**

  - [x] 5.3 Implement image loading and bubble detection
    - Add `loadImage(filePath)` (jimp decode; throws on unreadable) and a pure `detect(img, layout, align, cfg)` that maps each bubble center through the homography, samples fill intensity, runs `classifyRow` (blank / multiple / ambiguous / ok using `fillThreshold` and `ambiguityMargin`), and computes per-answer and sheet confidence in 0..100
    - _Requirements: 3.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3_

  - [ ]* 5.4 Write property test for detection determinism and coverage
    - **Property 7: Detection is deterministic and covers every row**
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 5.5 Write property test for confidence range
    - **Property 8: Confidence scores stay within range**
    - **Validates: Requirements 7.4, 7.5**

  - [ ]* 5.6 Write property test for row classification
    - **Property 9: Row classification of blank, multiple, and ambiguous marks**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [ ]* 5.7 Write property test for low-confidence flagging
    - **Property 10: Low-confidence flagging**
    - **Validates: Requirements 10.1, 10.2**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement deterministic scoring
  - [x] 7.1 Implement OmrScoringService
    - Create `src/main/services/OmrScoringService.ts` with `buildKey(exam)` (objective-only answer key), `effectiveAnswer(detected, override)` (override wins), and pure `score(key, answers, overrides)` computing per-question `QuestionScore`, `rawScore`, `maxScore` (objective marks only), `percentage`, and `grade` via the existing `getGrade`
    - _Requirements: 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 11.2, 14.1, 14.2_

  - [ ]* 7.2 Write property test for scoring correctness
    - **Property 11: Scoring correctness over objective questions**
    - **Validates: Requirements 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 11.2, 14.1, 14.2**

- [ ] 8. Implement identity resolution, score mapping, and audit builders
  - [x] 8.1 Implement pure resolution and finalization-precondition logic
    - Create `src/main/services/omr-resolve.ts` with `resolveIdentity(payload, examExists, studentExists)` returning the correct `SheetStatus`, and `canFinalize(sheet)` / `canFinalizeBatch(sheets)` guards for the missing-student and unresolved-flag preconditions
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 11.4, 11.6, 12.4_

  - [x] 8.2 Implement pure score-mapping and audit-record builders
    - In `src/main/services/OmrScoreRecorder.ts`, add pure `mapToScore(sheet, scoreResult, identity)` (student/exam/raw/max/percentage/grade + per-question scores + objective-only marker) and `buildAuditRecord(sheet, scoreId, scoreResult)` (detected answers, per-answer + sheet confidence, original-vs-overridden overrides, source image reference)
    - _Requirements: 12.1, 12.2, 12.3, 13.2, 13.3, 13.4, 14.3_

  - [ ]* 8.3 Write property test for identity resolution
    - **Property 5: Identity resolution from the QR payload**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

  - [ ]* 8.4 Write property test for finalization preconditions
    - **Property 13: Finalization preconditions**
    - **Validates: Requirements 11.4, 11.6, 12.4**

  - [ ]* 8.5 Write property test for score mapping
    - **Property 12: Finalized score mapping populates required fields**
    - **Validates: Requirements 12.1, 12.2**

  - [ ]* 8.6 Write property test for audit-record completeness
    - **Property 14: Audit record completeness**
    - **Validates: Requirements 13.2, 13.3, 13.4**

- [x] 9. Implement persistence layer
  - [x] 9.1 Add the 005_omr migration and score-replacement lookups
    - Append the idempotent `005_omr` migration (`omr_batches`, `omr_sheets`, `omr_audit` tables + indexes) to `DatabaseService.runMigrations()`, and add `getScoreByStudentExam(studentId, examId)` and `replaceScore(existingId, score)` methods
    - _Requirements: 12.4, 12.5_

  - [x] 9.2 Implement OmrRepository
    - Create `src/main/services/OmrRepository.ts` wrapping `DatabaseService` with `createBatch`, `saveSheet`, `getSheet`, `getBatchSheets`, `updateSheet`, `saveAudit`, and `getAuditByScore`, parsing persisted JSON defensively
    - _Requirements: 5.1, 12.1, 12.2, 13.1, 13.5_

- [x] 10. Implement the IPC layer and batch orchestration
  - [x] 10.1 Add OMR channel types
    - Add the `omr:*` invoke channels and the `omr:batch-progress` event to `src/shared/ipc-types.ts` (`KairosInvokeChannels` / `KairosEventChannels`) and expose them through the preload bridge
    - _Requirements: 3.2, 3.3_

  - [x] 10.2 Implement omr.ipc handlers and register them
    - Create `src/main/ipc/omr.ipc.ts` with `registerOMRHandlers`, wiring `generate-sheet`, `process-images` (async batch: decode → QR → resolve → align → detect → score → persist, emitting `omr:batch-progress` per sheet and turning per-sheet errors into `failed`/`qr_unreadable` results), `get-batch`, `assign` (re-runs detection+scoring for manually assigned sheets), `recompute`, `finalize`/`finalize-batch` (student + confirm-replace guards, writes score + audit), and `get-audit`; register it in `app.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2, 5.3, 5.4, 11.2, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.5, 14.3_

  - [ ]* 10.3 Write property test for batch resilience
    - **Property 4: Batch processing is total and resilient**
    - **Validates: Requirements 3.2, 3.4, 5.1, 5.3**

  - [ ]* 10.4 Write integration tests for the processing and finalize paths
    - Single image processed offline yields a scored sheet; a batch emits progress reaching `done === total`; QR decode over a rendered sheet returns the payload; finalize writes to `scores`, confirming replacement overwrites an existing student+exam score, and an `omr_audit` row is created and retrievable via `omr:get-audit`
    - _Requirements: 3.1, 3.3, 3.5, 4.1, 6.1, 12.5, 13.1, 13.5_

- [x] 11. Implement the renderer Review Interface
  - [x] 11.1 Add the omrStore slice
    - Add `useOmrStore` to `src/renderer/src/stores/index.ts` holding batch/sheet state, subscribing to `omr:batch-progress`, and exposing actions that call the `omr:*` channels via the existing `ipc()` helper
    - _Requirements: 3.3, 10.1, 10.2_

  - [x] 11.2 Implement OMRPage generate mode
    - Create `src/renderer/src/pages/OMRPage.tsx` with an exam picker, optional student assignment, and a "Generate Answer Sheet" action that calls `omr:generate-sheet`, opens the resulting PDF, and shows the decline message when the exam has no objective questions
    - _Requirements: 1.5, 1.7_

  - [x] 11.3 Implement the Review Interface mode
    - Add image import (via `file:open-dialog` with multi-select) feeding `omr:process-images`, a sheet list showing per-sheet `Confidence_Score` with visual flags for low-confidence/attention statuses, a detail view listing each `Detected_Answer` beside its `Expected_Answer` with editable overrides (calling `omr:recompute`), a student-assignment control, Finalize (single) / Finalize All (batch) actions with confirm-replace prompting, and an audit viewer using `omr:get-audit`
    - _Requirements: 3.2, 5.2, 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 13.5_

  - [ ]* 11.4 Write example tests for review interactions
    - Assigning an exam/student to a `qr_unreadable` sheet updates it and triggers detection+scoring; overriding an answer updates the displayed score
    - _Requirements: 5.2, 5.4, 11.2_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP.
- Each task references specific requirement sub-clauses for traceability.
- Property-based tests (Properties 1–14) validate the pure deterministic core; each property is its own sub-task placed close to the implementation it checks so errors are caught early.
- Example and integration tests cover the impure edges (HTML/PDF rendering, QR image decoding, batch orchestration, DB writes) that are unsuitable for property testing.
- The no-network (Req 3.5) and no-AI (Req 7.3) guarantees are enforced by keeping the OMR modules free of network/LLM calls; their reproducibility is exercised by the determinism property (Property 7).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "4.1", "5.1", "7.1", "8.1", "8.2", "9.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "5.3", "7.2", "8.3", "8.4", "8.5", "8.6", "9.2"] },
    { "id": 5, "tasks": ["4.3", "4.4", "5.4", "5.5", "5.6", "5.7", "10.1"] },
    { "id": 6, "tasks": ["10.2"] },
    { "id": 7, "tasks": ["10.3", "10.4", "11.1"] },
    { "id": 8, "tasks": ["11.2", "11.3"] },
    { "id": 9, "tasks": ["11.4"] }
  ]
}
```
