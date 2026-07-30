// src/main/services/OmrScoringService.ts
//
// Deterministic, pure scoring for the OMR pipeline.
//
// This service compares detected (and optionally teacher-overridden) answers
// against an exam's correct answers and computes a raw/max/percentage/grade
// result restricted to objective questions only (Req 14.1, 14.2). Every method
// here is a pure function of its inputs — no clock reads, no randomness, no I/O —
// so the Review Interface can safely recompute a score simply by calling `score`
// again with a new set of overrides (Req 11.2), and the same inputs always yield
// the same result.

import type { Exam, QuestionScore } from '@shared/db-types'
import { getGrade } from '@shared/db-types'
import type { DetectedAnswer } from '@shared/omr-types'
import { objectiveQuestions } from '@shared/omr-layout'

// ─── PUBLIC TYPES ──────────────────────────────────────────────────

/** One entry of the objective-only answer key (Req 14.1). */
export interface ObjectiveAnswerKey {
  questionId: string
  expected: string
  marks: number
}

/** The computed score for one sheet. */
export interface ScoreResult {
  perQuestion: QuestionScore[] // existing shape { questionId, score, maxScore }
  rawScore: number
  maxScore: number // objective marks only (Req 9.5, 14.2)
  percentage: number // 0..100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

// ─── SERVICE ───────────────────────────────────────────────────────

export class OmrScoringService {
  /**
   * Build the objective-only answer key for an exam (Req 14.1). Non-objective
   * questions (essay/structured/etc.) are excluded, so they never contribute to
   * either the awarded score or the maximum score (Req 14.2). Expected answers
   * come from each question's `expectedAnswer`; marks from its `marks`.
   */
  buildKey(exam: Exam): ObjectiveAnswerKey[] {
    return objectiveQuestions(exam).map((q) => ({
      questionId: q.id,
      expected: q.expectedAnswer,
      marks: q.marks
    }))
  }

  /**
   * Resolve the single effective answer for one row (Req 8.5, 11.2).
   *
   * The teacher override wins when present; otherwise the engine's detected
   * `selected` options are used. Only a single, unambiguous option counts as an
   * answer — a blank row (no options) or a multiple-marked row (more than one
   * option) resolves to `null`, which earns zero marks during scoring
   * (Req 8.4, 8.5, 9.3).
   */
  effectiveAnswer(detected: DetectedAnswer, override?: string[]): string | null {
    const options = override !== undefined ? override : detected.selected
    return options.length === 1 ? options[0] : null
  }

  /**
   * Pure scoring over the objective questions (Req 9).
   *
   * For each objective question the effective answer is the override when
   * present else the detected selection (Req 8.5, 11.2). A single effective
   * answer exactly equal to the expected answer earns that question's `marks`
   * (Req 9.2); blank, multiple (un-overridden), or mismatched answers earn zero
   * (Req 8.4, 8.5, 9.3). The raw score is the sum of marks awarded (Req 9.4);
   * the maximum score is the sum of the objective questions' marks (Req 9.5,
   * 14.2); the percentage is raw/max*100 rounded, guarded against a zero maximum;
   * and the grade is derived via the application's existing `getGrade` (Req 9.6).
   */
  score(
    key: ObjectiveAnswerKey[],
    answers: DetectedAnswer[],
    overrides: Record<string, string[]>
  ): ScoreResult {
    const byQuestion = new Map<string, DetectedAnswer>()
    for (const a of answers) byQuestion.set(a.questionId, a)

    const perQuestion: QuestionScore[] = key.map((entry) => {
      const detected = byQuestion.get(entry.questionId)
      const override = Object.prototype.hasOwnProperty.call(overrides, entry.questionId)
        ? overrides[entry.questionId]
        : undefined

      const effective = detected
        ? this.effectiveAnswer(detected, override)
        : override !== undefined && override.length === 1
          ? override[0]
          : null

      const awarded = effective !== null && effective === entry.expected ? entry.marks : 0

      return {
        questionId: entry.questionId,
        score: awarded,
        maxScore: entry.marks
      }
    })

    const rawScore = perQuestion.reduce((sum, q) => sum + q.score, 0)
    const maxScore = perQuestion.reduce((sum, q) => sum + q.maxScore, 0)
    const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0
    const grade = getGrade(percentage)

    return { perQuestion, rawScore, maxScore, percentage, grade }
  }
}
