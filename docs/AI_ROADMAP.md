# Kairos AI workload roadmap

**Product premise:** save teacher time while keeping the teacher responsible for decisions that affect a student's grade. Build from the existing offline Electron, SQLite, curriculum, exam, marking, OMR, report, and analytics capabilities.

Impact and effort are relative estimates for this codebase: **H** = high, **M** = medium, **L** = low. Sequence work by expected teacher minutes returned, confidence of the output, and the ability to review it quickly.

| Horizon | Priority | Capability | Teacher workload removed | Impact | Effort | First release boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Near term | P0 | Marking review queue | Collect AI suggested marks, evidence, confidence, and overrides in one queue so teachers review exceptions first | H | M | Teacher approves every final score; retain original suggestion and override reason |
| Near term | P0 | Rubric and answer key editor | Turn generated marking schemes into editable criteria and partial credit rules before marking begins | H | M | Version rubrics with the exam and show the active version beside each answer |
| Near term | P0 | Question bank with reuse controls | Find existing questions by topic, objective, type, difficulty, and past use | H | M | Extend the current exam backed view with durable question records and duplicate warnings |
| Near term | P1 | Batch feedback drafts | Draft concise, criterion linked feedback for all marked responses | H | L–M | Teacher edits and approves before export; never claim feedback is final until reviewed |
| Near term | P1 | Assessment quality check | Flag missing objectives, mark totals, unclear wording, answer key conflicts, and difficulty imbalance | M–H | M | Show evidence for each flag and let the teacher dismiss it |
| Mid term | P1 | Differentiated exam versions | Generate equivalent A/B papers and accommodations such as simpler wording or extra time formatting | H | M–H | Preserve learning objective and mark equivalence; teacher signs off each version |
| Mid term | P1 | Gap to remediation workflow | Convert class performance gaps into small group activities, practice sets, and a follow up check | H | M | Link each suggestion to scored questions and curriculum objectives |
| Mid term | P1 | Scan to review for written work | OCR handwritten or printed answers, attach image evidence, and route uncertain text to manual correction | H | H | Do not grade low confidence transcription without correction |
| Mid term | P2 | Parent communication drafts | Draft private, constructive progress messages from approved scores and teacher notes | M | M | Explicit teacher approval and recipient review before any message leaves the device |
| Mid term | P2 | Similarity review | Highlight overlap among submissions and local reference material for teacher inspection | M | M | Display matched passages and sources; avoid an automatic misconduct verdict |
| Long term | P2 | Standards aware planning cycle | Suggest a lesson sequence from objectives, prior coverage, performance gaps, and available resources | H | H | Maintain editable objective mappings and cite the curriculum version used |
| Long term | P2 | School wide analytics | Combine approved, permissioned class data to reveal longitudinal gaps and intervention outcomes | H | H | Role based access, aggregation, and a clear export/retention policy |
| Long term | Research | AI authorship signals | Study whether any authorship signal adds value in local languages and mixed language work | Uncertain | H | Never use detector output alone for disciplinary or grading decisions |

## Recommended implementation order

1. **Make marking review trustworthy.** Add rubric versioning, evidence linked suggestions, a review queue, and an audit trail. The current question level `MarkingResult`, teacher score override, `Score`, and marking scheme structures give this a practical starting point.
2. **Make assessment assets reusable.** Normalize questions out of exam JSON into a library with provenance and objective tags. The first UI pass indexes questions in saved exams, so teachers can discover them immediately; durable reuse requires a schema migration.
3. **Connect data back to instruction.** Turn class gaps into remediation plans and follow up assessment drafts. Reuse `WeaknessReport`, lesson generation, and curriculum topic data.
4. **Automate documents and communication after approval.** Add scan review and parent drafts once the review and audit patterns are established.

## Design and measurement requirements

- Every AI assisted grading suggestion should show the rubric criterion, cited answer evidence, confidence, and an easy override. Log suggestion, edit, approver, and time.
- Track teacher minutes per reviewed script, override rate, feedback edit rate, rubric agreement, and time to publish results. Measure workload reduction against a manual baseline with real teachers.
- Test outputs in English and Kiswahili, across subjects and class levels. Evaluate scanned handwriting separately from grading quality so OCR mistakes are visible.
- Version the TIE/NECTA curriculum assets and show the active source in generation and analytics. A new published curriculum should not silently change an existing exam.
- Keep school data local by default. Any future sync or messaging feature needs explicit sharing controls and recipient review.

## Evidence behind the sequencing

The [US Department of Education's AI report](https://www.ed.gov/sites/ed/files/documents/ai-report/ai-report.pdf) places teachers in the decision and evaluation loop for AI in education. [UNESCO guidance](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research?hub=253682) likewise calls for a human centred approach. This supports reviewable grading suggestions before autonomous scoring.

AI text detection is a research item because a [published evaluation of detectors](https://doi.org/10.1016/j.patter.2023.100779) found disproportionate false positives for non native English writing. In a multilingual school setting, a detector score would be a weak basis for an accusation. Similarity review with visible matched evidence is more actionable.

The [Tanzania Institute of Education's ordinary secondary curriculum](https://www.tie.go.tz/uploads/documents/sw-1775820473-CURRICULUM%20FOR%20SECONDARY%20EDUCATION%20FORM%20I-IV%20-CORRECTED%20%202026.pdf) is the curriculum source to compare against the repository's bundled topic data before expanding standards alignment.
