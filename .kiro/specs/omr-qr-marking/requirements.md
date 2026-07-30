# Requirements Document

## Introduction

This feature adds an offline OMR (Optical Mark Recognition) plus QR-code auto-marking pipeline to Kairos. It removes the manual steps of hand-marking objective questions and typing scores into the app. A teacher generates a printable answer sheet for an existing exam, prints it, has students fill bubbles by pencil, then photographs or scans the completed sheets. Kairos reads a QR code to identify the exam and student, deterministically detects the filled bubbles, compares them against the exam's correct answers, computes a score, and writes it into the existing `scores` table. The teacher reviews each result with a per-sheet confidence indicator and can override any misread bubble before finalizing.

The pipeline is scoped to objective question types only (`multiple_choice` and `true_or_false`). Essay and structured questions (`short_answer`, `structured_essay`, `fill_in_the_blank`, `matching`) remain out of scope and continue to be handled by the existing AI marking flow. All processing runs fully offline on the local device. Marking is deterministic (rule-based image analysis), not AI inference, so that results are reproducible and verifiable.

This document defines the requirements for the pipeline. Technical design (algorithms, libraries, image-processing approach, database schema changes) is deferred to the design phase.

## Glossary

- **OMR_System**: The overall Optical Mark Recognition and QR auto-marking subsystem being specified in this document.
- **Sheet_Generator**: The OMR_System component that produces a printable answer sheet for an existing exam.
- **Answer_Sheet**: A printable page containing a QR code and a bubble grid that matches the objective questions of one exam. One Answer_Sheet corresponds to one student's response.
- **Bubble_Grid**: The array of fillable circles on an Answer_Sheet. Each row corresponds to one objective question; each column corresponds to a selectable option (A, B, C, D, E for multiple choice; A/B or True/False for true-or-false).
- **QR_Payload**: The data encoded in the Answer_Sheet QR code, containing at minimum the exam identifier and a student identifier field (either an assigned student ID or a placeholder indicating "unassigned").
- **QR_Reader**: The OMR_System component that decodes the QR_Payload from a captured image.
- **Sheet_Image**: A single photograph or scan of one filled Answer_Sheet supplied by the teacher.
- **OMR_Engine**: The OMR_System component that performs deterministic detection of filled bubbles in a Sheet_Image.
- **Detected_Answer**: The option (or set of options) the OMR_Engine determines a student marked for a single question.
- **Objective_Question**: A question whose `type` is `multiple_choice` or `true_or_false`, which carries a defined `expectedAnswer`.
- **Expected_Answer**: The correct option for an Objective_Question, taken from the exam question's `expectedAnswer` field.
- **Confidence_Score**: A numeric measure (0 to 100) the OMR_Engine assigns to a sheet or to an individual Detected_Answer, indicating how clearly the mark was detected.
- **Low_Confidence_Threshold**: The Confidence_Score value at or below which a sheet or answer is flagged for teacher attention.
- **Review_Interface**: The renderer UI where a teacher reviews detected results, sees confidence indicators, and overrides answers before finalizing.
- **Finalize**: The teacher action that commits a reviewed sheet's result to the `scores` table.
- **Score_Recorder**: The OMR_System component that writes a finalized result into the existing `scores` table.
- **Audit_Record**: Stored provenance data for an auto-recorded score, capturing detected answers, confidence, overrides, and source image reference.
- **Batch**: A set of multiple Sheet_Images submitted for processing in one operation.
- **Teacher**: The authenticated user of Kairos who operates the OMR_System.

## Requirements

### Requirement 1: Generate a printable answer sheet for an exam

**User Story:** As a teacher, I want to generate a printable answer sheet for an existing exam, so that students can record objective answers as pencil bubbles that the app can later read.

#### Acceptance Criteria

1. WHEN the Teacher requests an Answer_Sheet for an exam, THE Sheet_Generator SHALL produce a Bubble_Grid containing one row for each Objective_Question in the exam.
2. WHEN the Teacher requests an Answer_Sheet for an exam, THE Sheet_Generator SHALL exclude every question whose `type` is not `multiple_choice` or `true_or_false` from the Bubble_Grid.
3. WHERE an Objective_Question is of type `multiple_choice`, THE Sheet_Generator SHALL render one bubble per available option label defined in that question's `options`.
4. WHERE an Objective_Question is of type `true_or_false`, THE Sheet_Generator SHALL render exactly two bubbles labelled to represent the true and false choices.
5. IF an exam contains zero Objective_Questions, THEN THE Sheet_Generator SHALL decline to produce an Answer_Sheet and SHALL return a message stating that the exam has no objective questions eligible for OMR.
6. THE Sheet_Generator SHALL render each Bubble_Grid row with its corresponding exam question number visible to the Teacher and student.
7. THE Sheet_Generator SHALL produce the Answer_Sheet as a printable document through the existing ExportService.

### Requirement 2: Encode exam and student identity in a QR code

**User Story:** As a teacher, I want each answer sheet to carry a QR code, so that the app can automatically identify which exam and which student a scanned sheet belongs to.

#### Acceptance Criteria

1. THE Sheet_Generator SHALL place a QR code encoding a QR_Payload on every Answer_Sheet.
2. THE QR_Payload SHALL contain the exam identifier of the exam the Answer_Sheet was generated for.
3. WHERE the Teacher assigns a specific student to an Answer_Sheet before printing, THE Sheet_Generator SHALL encode that student's identifier in the QR_Payload.
4. WHERE the Teacher does not assign a student to an Answer_Sheet before printing, THE Sheet_Generator SHALL encode a placeholder value in the QR_Payload's student identifier field that marks the sheet as unassigned.
5. THE Sheet_Generator SHALL include a version identifier in the QR_Payload so that the OMR_System can determine the sheet layout used.

### Requirement 3: Ingest captured sheet images offline

**User Story:** As a teacher, I want to import photos or scans of filled answer sheets, individually or in batches, so that I can process a whole class without an internet connection.

#### Acceptance Criteria

1. WHEN the Teacher submits one Sheet_Image for processing, THE OMR_System SHALL accept the image and begin processing without requiring network connectivity.
2. WHEN the Teacher submits a Batch of Sheet_Images for processing, THE OMR_System SHALL process each Sheet_Image in the Batch and report a per-sheet result.
3. WHILE a Batch is processing, THE OMR_System SHALL report progress indicating the number of Sheet_Images processed and the total count in the Batch.
4. IF a submitted file is not a readable image, THEN THE OMR_System SHALL record that file as failed with a reason and SHALL continue processing the remaining Sheet_Images in the Batch.
5. THE OMR_System SHALL complete all QR decoding, mark recognition, and scoring using only local device resources.

### Requirement 4: Identify the exam and student from the QR code

**User Story:** As a teacher, I want the app to read the QR code on each sheet, so that scores are matched to the correct exam and student without manual lookup.

#### Acceptance Criteria

1. WHEN a Sheet_Image is processed, THE QR_Reader SHALL decode the QR_Payload from the Sheet_Image.
2. WHEN the QR_Payload is decoded, THE OMR_System SHALL match the encoded exam identifier to an existing exam in the `exams` table.
3. IF the encoded exam identifier does not match any existing exam, THEN THE OMR_System SHALL mark the Sheet_Image as unresolved and SHALL report that the exam was not found.
4. WHERE the QR_Payload contains an assigned student identifier that matches an existing student in the `students` table, THE OMR_System SHALL associate the Sheet_Image with that student.
5. WHERE the QR_Payload contains the unassigned placeholder value, THE OMR_System SHALL mark the Sheet_Image as requiring student assignment by the Teacher.
6. IF the encoded student identifier is present but does not match any existing student, THEN THE OMR_System SHALL mark the Sheet_Image as requiring student assignment by the Teacher.

### Requirement 5: Handle unreadable QR codes gracefully

**User Story:** As a teacher, I want a clear path forward when a QR code cannot be read, so that a damaged or blurred sheet does not block the rest of my marking.

#### Acceptance Criteria

1. IF the QR_Reader cannot decode a QR_Payload from a Sheet_Image, THEN THE OMR_System SHALL mark the Sheet_Image as QR-unreadable and SHALL retain the Sheet_Image for manual resolution.
2. WHEN a Sheet_Image is marked QR-unreadable, THE OMR_System SHALL allow the Teacher to manually select the exam and the student for that Sheet_Image.
3. IF a Sheet_Image in a Batch is marked QR-unreadable, THEN THE OMR_System SHALL continue processing the remaining Sheet_Images in the Batch.
4. WHEN the Teacher manually assigns an exam and student to a QR-unreadable Sheet_Image, THE OMR_System SHALL run mark recognition and scoring for that Sheet_Image using the assigned exam.

### Requirement 6: Correct alignment and skew of captured images

**User Story:** As a teacher, I want the app to tolerate photos taken at an angle or in poor lighting, so that I do not need a scanner or perfect conditions to get accurate results.

#### Acceptance Criteria

1. WHEN a Sheet_Image is processed, THE OMR_Engine SHALL detect fixed reference markers on the Answer_Sheet to establish the sheet's orientation and boundaries.
2. WHERE a Sheet_Image is rotated or skewed relative to the upright sheet orientation, THE OMR_Engine SHALL geometrically correct the Sheet_Image before detecting bubbles.
3. IF the OMR_Engine cannot locate enough reference markers to establish the sheet's orientation, THEN THE OMR_System SHALL mark the Sheet_Image as alignment-failed and SHALL report that the sheet could not be aligned.
4. WHEN the OMR_Engine assesses a Sheet_Image whose overall image quality prevents reliable detection, THE OMR_System SHALL flag the Sheet_Image for Teacher review with a reason.

### Requirement 7: Deterministically detect filled bubbles

**User Story:** As a teacher, I want mark detection to be rule-based and repeatable, so that I can trust the results are consistent and not AI guesses.

#### Acceptance Criteria

1. WHEN the OMR_Engine processes an aligned Sheet_Image, THE OMR_Engine SHALL produce a Detected_Answer for each Bubble_Grid row.
2. WHEN the OMR_Engine processes the same Sheet_Image more than once, THE OMR_Engine SHALL produce identical Detected_Answers on each run.
3. THE OMR_Engine SHALL determine each Detected_Answer using measured mark intensity of the bubbles in a row, without invoking any language model or AI inference.
4. THE OMR_Engine SHALL assign a Confidence_Score between 0 and 100 to each Detected_Answer.
5. THE OMR_Engine SHALL assign a Confidence_Score between 0 and 100 to the Sheet_Image as a whole.

### Requirement 8: Resolve blank, ambiguous, and multiple-filled rows

**User Story:** As a teacher, I want the app to flag rows where a student left it blank, filled more than one bubble, or made a faint mark, so that these are not silently scored wrong.

#### Acceptance Criteria

1. IF no bubble in a Bubble_Grid row exceeds the fill-detection threshold, THEN THE OMR_Engine SHALL record the Detected_Answer for that row as blank.
2. IF more than one bubble in a Bubble_Grid row exceeds the fill-detection threshold, THEN THE OMR_Engine SHALL record the Detected_Answer for that row as multiple-marked and SHALL flag the row for Teacher review.
3. IF the difference in mark intensity between the most-filled bubble and the next-most-filled bubble in a row is below the ambiguity margin, THEN THE OMR_Engine SHALL flag that row for Teacher review.
4. WHEN a Detected_Answer is recorded as blank, THE OMR_System SHALL award zero marks for that question during scoring.
5. WHEN a Detected_Answer is recorded as multiple-marked, THE OMR_System SHALL award zero marks for that question during scoring unless the Teacher overrides the answer.

### Requirement 9: Score the sheet against the exam's correct answers

**User Story:** As a teacher, I want the app to compute each sheet's score automatically from the exam's correct answers, so that I no longer mark objective questions by hand.

#### Acceptance Criteria

1. WHEN a Sheet_Image has Detected_Answers for all Bubble_Grid rows, THE OMR_System SHALL compare each Detected_Answer to the Expected_Answer of the corresponding Objective_Question.
2. WHEN a Detected_Answer equals the Expected_Answer for an Objective_Question, THE OMR_System SHALL award that question's `marks` value for that question.
3. WHEN a Detected_Answer does not equal the Expected_Answer for an Objective_Question, THE OMR_System SHALL award zero marks for that question.
4. THE OMR_System SHALL compute the raw score as the sum of marks awarded across all Objective_Questions on the Answer_Sheet.
5. THE OMR_System SHALL compute the maximum score as the sum of the `marks` values of all Objective_Questions on the Answer_Sheet.
6. THE OMR_System SHALL compute the percentage as the raw score divided by the maximum score, expressed on a 0 to 100 scale, and SHALL derive the grade from the percentage using the application's existing grade-derivation function.

### Requirement 10: Flag low-confidence sheets for review

**User Story:** As a teacher, I want low-confidence sheets clearly marked, so that I know which results to double-check before trusting them.

#### Acceptance Criteria

1. IF a Sheet_Image's Confidence_Score is at or below the Low_Confidence_Threshold, THEN THE OMR_System SHALL flag the Sheet_Image as low-confidence in the Review_Interface.
2. IF an individual Detected_Answer's Confidence_Score is at or below the Low_Confidence_Threshold, THEN THE OMR_System SHALL flag that answer as low-confidence in the Review_Interface.
3. THE Review_Interface SHALL display the Confidence_Score for each Sheet_Image to the Teacher.
4. THE Review_Interface SHALL visually distinguish flagged Sheet_Images and flagged answers from unflagged ones.

### Requirement 11: Review and override detected answers before finalizing

**User Story:** As a teacher, I want to review and correct any misread answer before scores are saved, so that I stay in control of what gets recorded.

#### Acceptance Criteria

1. THE Review_Interface SHALL display, for each Sheet_Image, every Detected_Answer alongside the corresponding Expected_Answer.
2. WHEN the Teacher changes a Detected_Answer in the Review_Interface, THE OMR_System SHALL recompute the raw score, percentage, and grade for that Sheet_Image.
3. THE Review_Interface SHALL allow the Teacher to assign or change the student associated with a Sheet_Image before finalizing.
4. IF a Sheet_Image has no student associated when the Teacher attempts to Finalize it, THEN THE OMR_System SHALL prevent finalization and SHALL prompt the Teacher to assign a student.
5. THE Review_Interface SHALL allow the Teacher to Finalize a single reviewed Sheet_Image.
6. WHERE multiple Sheet_Images in a Batch have an associated student and no unresolved review flags, THE Review_Interface SHALL allow the Teacher to Finalize those Sheet_Images together in one action.

### Requirement 12: Record finalized scores in the existing data model

**User Story:** As a teacher, I want finalized OMR results written into the same scores table the rest of the app uses, so that OMR results appear alongside all other student data.

#### Acceptance Criteria

1. WHEN the Teacher Finalizes a Sheet_Image, THE Score_Recorder SHALL write a record to the `scores` table containing the student identifier, exam identifier, raw score, maximum score, percentage, and grade.
2. WHEN the Score_Recorder writes a finalized result, THE Score_Recorder SHALL populate the per-question scores for each Objective_Question with the question identifier, marks awarded, and maximum marks.
3. WHEN the Score_Recorder writes a finalized result, THE Score_Recorder SHALL set the marked timestamp to the time of finalization.
4. IF a score already exists in the `scores` table for the same student and exam, THEN THE OMR_System SHALL prompt the Teacher to confirm before replacing the existing score.
5. WHEN the Teacher confirms replacement of an existing score, THE Score_Recorder SHALL overwrite the existing record for that student and exam.

### Requirement 13: Preserve an audit trail for auto-recorded scores

**User Story:** As a teacher, I want to see how each auto-recorded score was produced, so that I can trust and defend the results.

#### Acceptance Criteria

1. WHEN the Score_Recorder writes a finalized result, THE OMR_System SHALL store an Audit_Record for that result.
2. THE Audit_Record SHALL include the Detected_Answers, the per-answer Confidence_Scores, and the sheet Confidence_Score used to produce the finalized result.
3. WHERE the Teacher overrode one or more Detected_Answers before finalization, THE Audit_Record SHALL record each overridden answer with its original detected value and its overridden value.
4. THE Audit_Record SHALL include a reference to the source Sheet_Image used to produce the finalized result.
5. THE OMR_System SHALL make the Audit_Record for a finalized result retrievable by the Teacher.

### Requirement 14: Restrict OMR scope to objective questions

**User Story:** As a teacher, I want OMR to handle only objective questions, so that essay and structured questions continue to be marked by the appropriate flow.

#### Acceptance Criteria

1. THE OMR_System SHALL score only questions whose `type` is `multiple_choice` or `true_or_false`.
2. WHERE an exam contains both objective and non-objective questions, THE OMR_System SHALL compute the maximum score from the Objective_Questions only.
3. WHEN the Score_Recorder writes a finalized OMR result, THE OMR_System SHALL indicate that the recorded score covers objective questions only.
