// src/main/services/DatabaseService.ts
// SQLite database layer using better-sqlite3

import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { app } from 'electron'
import { v4 as uuid } from 'uuid'
import type {
  Teacher, Lesson, LessonPlan, Exam, ExamPaper, Student, Score,
  ReportComment, WeaknessReport, TopicPerformance, LocalAnalytics,
  UploadedDocument, CurriculumTopic
} from '../../shared/db-types'

export class DatabaseService {
  private db!: Database.Database
  private dataPath: string

  constructor() {
    if (process.env.NODE_ENV === 'test') {
      this.dataPath = join(process.cwd(), '.test-data')
    } else {
      this.dataPath = app.getPath('userData')
    }
  }

  getDbPath(): string {
    return join(this.dataPath, 'kairos.db')
  }

  /**
   * Narrow accessor exposing the underlying better-sqlite3 handle to
   * collaborating repositories (e.g. OmrRepository) that own their own
   * table set. Kept intentionally minimal so most callers keep using the
   * typed methods on this service rather than issuing raw SQL.
   */
  getRawDb(): Database.Database {
    return this.db
  }

  async initialize(): Promise<void> {
    mkdirSync(this.dataPath, { recursive: true })
    const dbPath = this.getDbPath()
    this.db = new Database(dbPath)

    // Performance pragmas
    this.db.pragma('journal_mode=WAL')
    this.db.pragma('synchronous=NORMAL')
    this.db.pragma('cache_size=10000')
    this.db.pragma('temp_store=MEMORY')
    this.db.pragma('foreign_keys=ON')

    this.runMigrations()
  }

  private runMigrations(): void {
    // Create migration tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        name    TEXT UNIQUE NOT NULL,
        run_at  INTEGER NOT NULL
      )
    `)

    const applied = new Set(
      this.db.prepare('SELECT name FROM migrations').all().map((r: any) => r.name)
    )

    const migrations: { name: string; sql: string }[] = [
      { name: '001_initial_schema', sql: this.migration001() },
      { name: '002_indexes', sql: this.migration002() },
      { name: '003_settings', sql: this.migration003() },
      { name: '004_exam_sections', sql: this.migration004() },
      { name: '005_omr', sql: this.migration005() },
    ]

    for (const m of migrations) {
      if (!applied.has(m.name)) {
        this.db.exec(m.sql)
        this.db.prepare('INSERT INTO migrations (name, run_at) VALUES (?, ?)').run(m.name, Date.now())
        console.log('[DB] Applied migration:', m.name)
      }
    }
  }

  private migration001(): string {
    return `
      CREATE TABLE IF NOT EXISTS teachers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE,
        school_id     TEXT,
        school_name   TEXT,
        subjects      TEXT NOT NULL DEFAULT '[]',
        class_levels  TEXT NOT NULL DEFAULT '[]',
        language_pref TEXT NOT NULL DEFAULT 'en',
        pin_hash      TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id            TEXT PRIMARY KEY,
        teacher_id    TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        subject       TEXT NOT NULL,
        topic         TEXT NOT NULL,
        subtopic      TEXT,
        class_level   TEXT NOT NULL,
        duration_mins INTEGER DEFAULT 80,
        language      TEXT DEFAULT 'en',
        content       TEXT NOT NULL,
        is_starred    INTEGER DEFAULT 0,
        tags          TEXT DEFAULT '[]',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS exams (
        id             TEXT PRIMARY KEY,
        teacher_id     TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        title          TEXT NOT NULL,
        subject        TEXT NOT NULL,
        class_level    TEXT NOT NULL,
        exam_type      TEXT NOT NULL,
        topics         TEXT NOT NULL DEFAULT '[]',
        duration_mins  INTEGER,
        total_marks    INTEGER,
        instructions   TEXT,
        questions      TEXT NOT NULL DEFAULT '[]',
        marking_scheme TEXT NOT NULL DEFAULT '[]',
        language       TEXT DEFAULT 'en',
        source_doc_id  TEXT,
        is_starred     INTEGER DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id           TEXT PRIMARY KEY,
        teacher_id   TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        reg_number   TEXT,
        class_level  TEXT NOT NULL,
        stream       TEXT,
        gender       TEXT,
        is_active    INTEGER DEFAULT 1,
        created_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scores (
        id               TEXT PRIMARY KEY,
        student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        exam_id          TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        teacher_id       TEXT NOT NULL,
        raw_score        REAL,
        max_score        REAL NOT NULL,
        percentage       REAL,
        grade            TEXT,
        question_scores  TEXT DEFAULT '[]',
        ai_feedback      TEXT,
        teacher_comment  TEXT,
        marked_at        INTEGER,
        created_at       INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS marking_sessions (
        id               TEXT PRIMARY KEY,
        teacher_id       TEXT NOT NULL,
        exam_id          TEXT NOT NULL,
        status           TEXT DEFAULT 'in_progress',
        total_scripts    INTEGER,
        marked_count     INTEGER DEFAULT 0,
        class_avg        REAL,
        class_weaknesses TEXT,
        created_at       INTEGER NOT NULL,
        completed_at     INTEGER
      );

      CREATE TABLE IF NOT EXISTS report_comments (
        id            TEXT PRIMARY KEY,
        teacher_id    TEXT NOT NULL,
        student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        term          TEXT NOT NULL,
        year          INTEGER NOT NULL,
        comment_text  TEXT NOT NULL,
        strengths     TEXT DEFAULT '[]',
        areas_growth  TEXT DEFAULT '[]',
        recommendation TEXT,
        ai_generated  INTEGER DEFAULT 1,
        is_finalized  INTEGER DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS uploaded_documents (
        id             TEXT PRIMARY KEY,
        teacher_id     TEXT NOT NULL,
        filename       TEXT NOT NULL,
        file_type      TEXT NOT NULL,
        file_path      TEXT NOT NULL,
        extracted_text TEXT,
        embedding_id   TEXT,
        purpose        TEXT,
        created_at     INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS curriculum_topics (
        id           TEXT PRIMARY KEY,
        subject      TEXT NOT NULL,
        class_level  TEXT NOT NULL,
        chapter      INTEGER,
        topic        TEXT NOT NULL,
        subtopics    TEXT DEFAULT '[]',
        necta_weight REAL DEFAULT 0.5,
        keywords     TEXT DEFAULT '[]',
        textbook_ref TEXT
      );

      CREATE TABLE IF NOT EXISTS generation_log (
        id          TEXT PRIMARY KEY,
        teacher_id  TEXT NOT NULL,
        feature     TEXT NOT NULL,
        params_hash TEXT,
        tokens_used INTEGER,
        duration_ms INTEGER,
        model_used  TEXT,
        created_at  INTEGER NOT NULL
      );
    `
  }

  private migration002(): string {
    return `
      CREATE INDEX IF NOT EXISTS idx_lessons_teacher  ON lessons(teacher_id);
      CREATE INDEX IF NOT EXISTS idx_lessons_subject  ON lessons(subject, class_level);
      CREATE INDEX IF NOT EXISTS idx_lessons_recent   ON lessons(teacher_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_exams_teacher    ON exams(teacher_id);
      CREATE INDEX IF NOT EXISTS idx_exams_subject    ON exams(teacher_id, subject, class_level);
      CREATE INDEX IF NOT EXISTS idx_students_teacher ON students(teacher_id, class_level);
      CREATE INDEX IF NOT EXISTS idx_scores_student   ON scores(student_id);
      CREATE INDEX IF NOT EXISTS idx_scores_exam      ON scores(exam_id);
      CREATE INDEX IF NOT EXISTS idx_scores_teacher   ON scores(teacher_id, marked_at);
      CREATE INDEX IF NOT EXISTS idx_scores_analysis  ON scores(teacher_id, exam_id, percentage);
    `
  }

  private migration003(): string {
    return `
      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  }

  private migration004(): string {
    // The exam preview/export UI renders the exam as sections (with section
    // names, per-section instructions and marks), but only the flattened
    // question list was being persisted, so exams reopened from history lost
    // all section structure and showed zero everywhere. Store the sections
    // JSON alongside the flattened questions so both shapes are available.
    return `
      ALTER TABLE exams ADD COLUMN sections TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE exams ADD COLUMN duration INTEGER;
    `
  }

  private migration005(): string {
    // Offline OMR + QR auto-marking pipeline. Stores batches of scanned
    // answer sheets, per-sheet detection/scoring state, and an audit trail
    // linking each auto-recorded score back to its detected answers, overrides,
    // and source image.
    return `
      CREATE TABLE IF NOT EXISTS omr_batches (
        id          TEXT PRIMARY KEY,
        teacher_id  TEXT NOT NULL,
        exam_id     TEXT,
        total       INTEGER NOT NULL DEFAULT 0,
        processed   INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS omr_sheets (
        id               TEXT PRIMARY KEY,
        batch_id         TEXT NOT NULL REFERENCES omr_batches(id) ON DELETE CASCADE,
        exam_id          TEXT,
        student_id       TEXT,
        status           TEXT NOT NULL,
        reason           TEXT,
        qr_payload       TEXT,
        sheet_confidence REAL NOT NULL DEFAULT 0,
        detected_answers TEXT NOT NULL DEFAULT '[]',
        overrides        TEXT NOT NULL DEFAULT '{}',
        raw_score        REAL NOT NULL DEFAULT 0,
        max_score        REAL NOT NULL DEFAULT 0,
        percentage       REAL NOT NULL DEFAULT 0,
        grade            TEXT,
        image_path       TEXT NOT NULL,
        created_at       INTEGER NOT NULL,
        finalized_at     INTEGER
      );

      CREATE TABLE IF NOT EXISTS omr_audit (
        id               TEXT PRIMARY KEY,
        score_id         TEXT NOT NULL,
        sheet_id         TEXT NOT NULL,
        exam_id          TEXT NOT NULL,
        student_id       TEXT NOT NULL,
        detected_answers TEXT NOT NULL DEFAULT '[]',
        sheet_confidence REAL NOT NULL DEFAULT 0,
        overrides        TEXT NOT NULL DEFAULT '[]',
        image_path       TEXT NOT NULL,
        created_at       INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_omr_sheets_batch ON omr_sheets(batch_id);
      CREATE INDEX IF NOT EXISTS idx_omr_audit_score  ON omr_audit(score_id);
    `
  }

  // ── Teacher ─────────────────────────────────────────────────────

  getTeacher(): Teacher | null {
    const row = this.db.prepare('SELECT * FROM teachers LIMIT 1').get() as any
    return row ? this.rowToTeacher(row) : null
  }

  saveTeacher(data: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>): Teacher {
    const now = Date.now()
    const id = uuid()
    this.db.prepare(`
      INSERT INTO teachers (id, name, email, school_id, school_name, subjects, class_levels, language_pref, pin_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.email ?? null, data.schoolId ?? null, data.schoolName ?? null,
      JSON.stringify(data.subjects), JSON.stringify(data.classLevels),
      data.languagePref, data.pin ?? null, now, now)
    return this.getTeacher()!
  }

  updateTeacher(updates: Partial<Teacher>): Teacher {
    const existing = this.getTeacher()
    if (!existing) throw new Error('No teacher profile found')
    const now = Date.now()
    this.db.prepare(`
      UPDATE teachers SET
        name = ?, email = ?, school_name = ?, subjects = ?, class_levels = ?,
        language_pref = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updates.name ?? existing.name,
      updates.email ?? existing.email ?? null,
      updates.schoolName ?? existing.schoolName ?? null,
      JSON.stringify(updates.subjects ?? existing.subjects),
      JSON.stringify(updates.classLevels ?? existing.classLevels),
      updates.languagePref ?? existing.languagePref,
      now, existing.id
    )
    return this.getTeacher()!
  }

  private rowToTeacher(row: any): Teacher {
    return {
      id: row.id, name: row.name, email: row.email,
      schoolId: row.school_id, schoolName: row.school_name,
      subjects: JSON.parse(row.subjects ?? '[]'),
      classLevels: JSON.parse(row.class_levels ?? '[]'),
      languagePref: row.language_pref,
      pin: row.pin_hash,
      createdAt: row.created_at, updatedAt: row.updated_at
    }
  }

  // ── Lessons ─────────────────────────────────────────────────────

  saveLesson(plan: LessonPlan, teacherId: string, language: 'en' | 'sw' | 'bilingual'): Lesson {
    const now = Date.now()
    const id = plan.id || uuid()
    this.db.prepare(`
      INSERT OR REPLACE INTO lessons
        (id, teacher_id, subject, topic, subtopic, class_level, duration_mins, language, content, is_starred, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?)
    `).run(id, teacherId, plan.subject, plan.topic, plan.subtopic ?? null,
      plan.classLevel, plan.durationMins, language, JSON.stringify(plan), now, now)
    return this.getLesson(id)!
  }

  getLessons(teacherId: string, filters: { subject?: string; classLevel?: string; search?: string } = {}): Lesson[] {
    let query = 'SELECT * FROM lessons WHERE teacher_id = ?'
    const params: any[] = [teacherId]

    if (filters.subject) { query += ' AND subject = ?'; params.push(filters.subject) }
    if (filters.classLevel) { query += ' AND class_level = ?'; params.push(filters.classLevel) }
    if (filters.search) {
      query += ' AND (topic LIKE ? OR subject LIKE ?)'
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }
    query += ' ORDER BY updated_at DESC'

    return (this.db.prepare(query).all(...params) as any[]).map(this.rowToLesson)
  }

  getLesson(id: string): Lesson | null {
    const row = this.db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as any
    return row ? this.rowToLesson(row) : null
  }

  deleteLesson(id: string): void {
    this.db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  }

  starLesson(id: string, starred: boolean): void {
    this.db.prepare('UPDATE lessons SET is_starred = ? WHERE id = ?').run(starred ? 1 : 0, id)
  }

  private rowToLesson(row: any): Lesson {
    return {
      id: row.id, teacherId: row.teacher_id, subject: row.subject,
      topic: row.topic, subtopic: row.subtopic, classLevel: row.class_level,
      durationMins: row.duration_mins, language: row.language,
      content: JSON.parse(row.content), isStarred: !!row.is_starred,
      tags: JSON.parse(row.tags ?? '[]'),
      createdAt: row.created_at, updatedAt: row.updated_at
    }
  }

  // ── Exams ────────────────────────────────────────────────────────

  saveExam(paper: ExamPaper, teacherId: string): Exam {
    const now = Date.now()
    const id = paper.id || uuid()
    const topics = [...new Set(paper.sections.flatMap(s => s.questions.map(q => q.topic)))]
    this.db.prepare(`
      INSERT OR REPLACE INTO exams
        (id, teacher_id, title, subject, class_level, exam_type, topics, duration_mins, duration, total_marks,
         instructions, questions, sections, marking_scheme, language, is_starred, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, teacherId, paper.title, paper.subject, paper.classLevel,
      paper.examType, JSON.stringify(topics), paper.duration, paper.duration, paper.totalMarks,
      JSON.stringify(paper.instructions),
      JSON.stringify(paper.sections.flatMap(s => s.questions)),
      JSON.stringify(paper.sections),
      JSON.stringify(paper.markingScheme), paper.language, now, now)
    return this.getExam(id)!
  }

  getExams(teacherId: string, filters: { subject?: string; classLevel?: string } = {}): Exam[] {
    let query = 'SELECT * FROM exams WHERE teacher_id = ?'
    const params: any[] = [teacherId]

    if (filters.subject) { query += ' AND subject = ?'; params.push(filters.subject) }
    if (filters.classLevel) { query += ' AND class_level = ?'; params.push(filters.classLevel) }
    query += ' ORDER BY created_at DESC'

    return (this.db.prepare(query).all(...params) as any[]).map(this.rowToExam)
  }

  getExam(id: string): Exam | null {
    const row = this.db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as any
    return row ? this.rowToExam(row) : null
  }

  deleteExam(id: string): void {
    this.db.prepare('DELETE FROM exams WHERE id = ?').run(id)
  }

  private rowToExam(row: any): Exam {
    return {
      id: row.id, teacherId: row.teacher_id, title: row.title,
      subject: row.subject, classLevel: row.class_level, examType: row.exam_type,
      topics: JSON.parse(row.topics ?? '[]'), durationMins: row.duration_mins,
      duration: row.duration ?? row.duration_mins,
      totalMarks: row.total_marks, instructions: JSON.parse(row.instructions ?? '[]'),
      questions: JSON.parse(row.questions ?? '[]'),
      sections: JSON.parse(row.sections ?? '[]'),
      markingScheme: JSON.parse(row.marking_scheme ?? '[]'),
      language: row.language, sourceDocId: row.source_doc_id,
      isStarred: !!row.is_starred,
      createdAt: row.created_at, updatedAt: row.updated_at
    }
  }

  // ── Students ─────────────────────────────────────────────────────

  saveStudent(student: Omit<Student, 'id' | 'createdAt'>): Student {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO students (id, teacher_id, name, reg_number, class_level, stream, gender, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, student.teacherId, student.name, student.regNumber ?? null,
      student.classLevel, student.stream ?? null, student.gender ?? null,
      student.isActive ? 1 : 0, now)
    return this.getStudent(id)!
  }

  importStudents(students: Omit<Student, 'id' | 'createdAt' | 'teacherId'>[], teacherId: string): number {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO students (id, teacher_id, name, reg_number, class_level, stream, gender, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMany = this.db.transaction((rows) => {
      let count = 0
      for (const s of rows) {
        insert.run(uuid(), teacherId, s.name, s.regNumber ?? null,
          s.classLevel, s.stream ?? null, s.gender ?? null, 1, Date.now())
        count++
      }
      return count
    })
    return insertMany(students) as number
  }

  getStudents(teacherId: string, classLevel?: string): Student[] {
    if (classLevel) {
      return (this.db.prepare('SELECT * FROM students WHERE teacher_id = ? AND class_level = ? AND is_active = 1 ORDER BY name')
        .all(teacherId, classLevel) as any[]).map(this.rowToStudent)
    }
    return (this.db.prepare('SELECT * FROM students WHERE teacher_id = ? AND is_active = 1 ORDER BY class_level, name')
      .all(teacherId) as any[]).map(this.rowToStudent)
  }

  getStudent(id: string): Student | null {
    const row = this.db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any
    return row ? this.rowToStudent(row) : null
  }

  deleteStudent(id: string): void {
    this.db.prepare('UPDATE students SET is_active = 0 WHERE id = ?').run(id)
  }

  private rowToStudent(row: any): Student {
    return {
      id: row.id, teacherId: row.teacher_id, name: row.name,
      regNumber: row.reg_number, classLevel: row.class_level,
      stream: row.stream, gender: row.gender, isActive: !!row.is_active,
      createdAt: row.created_at
    }
  }

  // ── Scores ───────────────────────────────────────────────────────

  saveScore(score: Omit<Score, 'id' | 'createdAt'>): Score {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(`
      INSERT OR REPLACE INTO scores
        (id, student_id, exam_id, teacher_id, raw_score, max_score, percentage, grade,
         question_scores, ai_feedback, teacher_comment, marked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, score.studentId, score.examId, score.teacherId,
      score.rawScore, score.maxScore, score.percentage, score.grade,
      JSON.stringify(score.questionScores ?? []),
      score.aiFeedback ? JSON.stringify(score.aiFeedback) : null,
      score.teacherComment ?? null, score.markedAt, now)
    return { ...score, id, createdAt: now }
  }

  getScores(examId: string): Score[] {
    return (this.db.prepare(`
      SELECT s.*, st.name as student_name FROM scores s
      JOIN students st ON s.student_id = st.id
      WHERE s.exam_id = ? ORDER BY st.name
    `).all(examId) as any[]).map(this.rowToScore)
  }

  getStudentScores(studentId: string): Score[] {
    return (this.db.prepare('SELECT * FROM scores WHERE student_id = ? ORDER BY marked_at DESC')
      .all(studentId) as any[]).map(this.rowToScore)
  }

  /**
   * Look up an existing score for a specific student + exam pair. The `scores`
   * table has no unique (student_id, exam_id) constraint, so this is used by the
   * OMR finalize flow to detect a pre-existing score before replacing it
   * (Req 12.4). Returns the most recent match, or null when none exists.
   */
  getScoreByStudentExam(studentId: string, examId: string): Score | null {
    const row = this.db.prepare(
      'SELECT * FROM scores WHERE student_id = ? AND exam_id = ? ORDER BY marked_at DESC LIMIT 1'
    ).get(studentId, examId) as any
    return row ? this.rowToScore(row) : null
  }

  /**
   * Overwrite an existing score record (identified by id) in place, keeping the
   * same row while replacing its scoring fields. Used by the OMR confirm-replace
   * flow when the teacher approves replacing an existing student+exam score
   * (Req 12.5).
   */
  replaceScore(existingId: string, score: Omit<Score, 'id' | 'createdAt'>): Score {
    const existing = this.db.prepare('SELECT * FROM scores WHERE id = ?').get(existingId) as any
    if (!existing) throw new Error(`No score found with id ${existingId}`)
    this.db.prepare(`
      UPDATE scores SET
        student_id = ?, exam_id = ?, teacher_id = ?, raw_score = ?, max_score = ?,
        percentage = ?, grade = ?, question_scores = ?, ai_feedback = ?,
        teacher_comment = ?, marked_at = ?
      WHERE id = ?
    `).run(score.studentId, score.examId, score.teacherId,
      score.rawScore, score.maxScore, score.percentage, score.grade,
      JSON.stringify(score.questionScores ?? []),
      score.aiFeedback ? JSON.stringify(score.aiFeedback) : null,
      score.teacherComment ?? null, score.markedAt, existingId)
    return { ...score, id: existingId, createdAt: existing.created_at }
  }

  private rowToScore(row: any): Score {
    return {
      id: row.id, studentId: row.student_id, examId: row.exam_id,
      teacherId: row.teacher_id, rawScore: row.raw_score, maxScore: row.max_score,
      percentage: row.percentage, grade: row.grade,
      questionScores: JSON.parse(row.question_scores ?? '[]'),
      aiFeedback: row.ai_feedback ? JSON.parse(row.ai_feedback) : undefined,
      teacherComment: row.teacher_comment, markedAt: row.marked_at,
      createdAt: row.created_at
    }
  }

  // ── Report Comments ──────────────────────────────────────────────

  saveReport(data: Omit<ReportComment, 'id' | 'createdAt' | 'updatedAt'>): ReportComment {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(`
      INSERT OR REPLACE INTO report_comments
        (id, teacher_id, student_id, term, year, comment_text, strengths, areas_growth,
         recommendation, ai_generated, is_finalized, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.teacherId, data.studentId, data.term, data.year,
      data.commentText, JSON.stringify(data.strengths), JSON.stringify(data.areasForGrowth),
      data.recommendation, data.aiGenerated ? 1 : 0, data.isFinalized ? 1 : 0, now, now)
    return { ...data, id, createdAt: now, updatedAt: now }
  }

  getReports(teacherId: string, filters: { classLevel?: string; term?: string; year?: number } = {}): ReportComment[] {
    let query = `
      SELECT rc.*, s.name as student_name, s.class_level
      FROM report_comments rc JOIN students s ON rc.student_id = s.id
      WHERE rc.teacher_id = ?
    `
    const params: any[] = [teacherId]
    if (filters.term) { query += ' AND rc.term = ?'; params.push(filters.term) }
    if (filters.year) { query += ' AND rc.year = ?'; params.push(filters.year) }
    query += ' ORDER BY s.name'
    return (this.db.prepare(query).all(...params) as any[]).map(this.rowToReport)
  }

  private rowToReport(row: any): ReportComment {
    return {
      id: row.id, teacherId: row.teacher_id, studentId: row.student_id,
      term: row.term, year: row.year, commentText: row.comment_text,
      strengths: JSON.parse(row.strengths ?? '[]'),
      areasForGrowth: JSON.parse(row.areas_growth ?? '[]'),
      recommendation: row.recommendation ?? '',
      aiGenerated: !!row.ai_generated, isFinalized: !!row.is_finalized,
      createdAt: row.created_at, updatedAt: row.updated_at
    }
  }

  // ── Weakness Analysis ─────────────────────────────────────────────

  getWeaknessData(teacherId: string, classLevel: string, subject?: string): WeaknessReport | null {
    let examQuery = 'SELECT id, total_marks FROM exams WHERE teacher_id = ? AND class_level = ?'
    const examParams: any[] = [teacherId, classLevel]
    if (subject) { examQuery += ' AND subject = ?'; examParams.push(subject) }

    const exams = this.db.prepare(examQuery).all(...examParams) as any[]
    if (exams.length === 0) return null

    const examIds = exams.map(e => e.id)
    const allScores = this.db.prepare(`
      SELECT s.*, st.name as student_name, e.total_marks as exam_max
      FROM scores s
      JOIN students st ON s.student_id = st.id
      JOIN exams e ON s.exam_id = e.id
      WHERE s.exam_id IN (${examIds.map(() => '?').join(',')})
        AND s.teacher_id = ?
    `).all(...examIds, teacherId) as any[]

    if (allScores.length === 0) return null

    // Aggregate by topic from question_scores
    const topicMap = new Map<string, { total: number; count: number; nectaWeight: number }>()

    for (const score of allScores) {
      const qScores = JSON.parse(score.question_scores ?? '[]')
      for (const qs of qScores) {
        const topic = qs.topic ?? 'General'
        const existing = topicMap.get(topic) ?? { total: 0, count: 0, nectaWeight: 0.5 }
        topicMap.set(topic, {
          total: existing.total + (qs.score / qs.maxScore) * 100,
          count: existing.count + 1,
          nectaWeight: existing.nectaWeight
        })
      }
    }

    const topics: TopicPerformance[] = Array.from(topicMap.entries()).map(([topic, data]) => ({
      topic,
      avgScore: Math.round(data.total / data.count),
      attempts: data.count,
      nectaWeight: data.nectaWeight,
      trend: 'stable' as const
    }))

    const classAverage = allScores.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / allScores.length

    const students = this.getStudents(teacherId, classLevel)
    const studentAvgs = new Map<string, number>()
    for (const score of allScores) {
      const prev = studentAvgs.get(score.student_id) ?? 0
      studentAvgs.set(score.student_id, prev + (score.percentage ?? 0))
    }

    const studentsAtRisk = students
      .map(s => {
        const total = studentAvgs.get(s.id) ?? 0
        const examCount = allScores.filter(sc => sc.student_id === s.id).length
        const avg = examCount > 0 ? total / examCount : 0
        return { id: s.id, name: s.name, avgScore: Math.round(avg), weakestTopic: 'General' }
      })
      .filter(s => s.avgScore < 45)
      .sort((a, b) => a.avgScore - b.avgScore)

    return {
      classLevel,
      subject: subject ?? 'All Subjects',
      weakestTopics: topics.filter(t => t.avgScore < 45).sort((a, b) => a.avgScore - b.avgScore).slice(0, 5),
      strongestTopics: topics.filter(t => t.avgScore >= 60).sort((a, b) => b.avgScore - a.avgScore).slice(0, 5),
      studentsAtRisk,
      classAverage: Math.round(classAverage),
      examReadinessScore: Math.min(100, Math.round(classAverage * 1.1)),
      suggestedFocusAreas: topics.filter(t => t.avgScore < 50 && t.nectaWeight > 0.6),
      actionableInsights: []
    }
  }

  // ── Analytics ────────────────────────────────────────────────────

  getAnalytics(teacherId: string): LocalAnalytics {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    const lessonsGenerated = (this.db.prepare(
      'SELECT COUNT(*) as c FROM lessons WHERE teacher_id = ? AND created_at > ?'
    ).get(teacherId, weekAgo) as any).c

    const examsCreated = (this.db.prepare(
      'SELECT COUNT(*) as c FROM exams WHERE teacher_id = ? AND created_at > ?'
    ).get(teacherId, weekAgo) as any).c

    const studentsMarked = (this.db.prepare(
      'SELECT COUNT(DISTINCT student_id) as c FROM scores WHERE teacher_id = ? AND created_at > ?'
    ).get(teacherId, weekAgo) as any).c

    const reportsWritten = (this.db.prepare(
      'SELECT COUNT(*) as c FROM report_comments WHERE teacher_id = ? AND created_at > ?'
    ).get(teacherId, weekAgo) as any).c

    const totalLessons = (this.db.prepare('SELECT COUNT(*) as c FROM lessons WHERE teacher_id = ?').get(teacherId) as any).c
    const totalExams = (this.db.prepare('SELECT COUNT(*) as c FROM exams WHERE teacher_id = ?').get(teacherId) as any).c
    const totalStudents = (this.db.prepare('SELECT COUNT(*) as c FROM students WHERE teacher_id = ? AND is_active = 1').get(teacherId) as any).c
    const totalReports = (this.db.prepare('SELECT COUNT(*) as c FROM report_comments WHERE teacher_id = ?').get(teacherId) as any).c

    const TIME_SAVINGS = { lesson: 90, exam: 120, marking: 8, report: 5 }
    const hoursEstimatedSaved = Math.round(
      (lessonsGenerated * TIME_SAVINGS.lesson +
        examsCreated * TIME_SAVINGS.exam +
        studentsMarked * TIME_SAVINGS.marking +
        reportsWritten * TIME_SAVINGS.report) / 60
    )

    return {
      weeklyStats: { lessonsGenerated, examsCreated, studentsMarked, reportsWritten, hoursEstimatedSaved },
      topSubjects: [],
      mostUsedFeature: 'lesson',
      totalLessons, totalExams, totalStudents, totalReports
    }
  }

  // ── Settings ─────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
  }

  // ── Uploaded Documents ───────────────────────────────────────────

  saveDocument(doc: Omit<UploadedDocument, 'id' | 'createdAt'>): UploadedDocument {
    const id = uuid()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO uploaded_documents
        (id, teacher_id, filename, file_type, file_path, extracted_text, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, doc.teacherId, doc.filename, doc.fileType, doc.filePath,
      doc.extractedText ?? null, doc.purpose, now)
    return { ...doc, id, createdAt: now }
  }

  getDocument(id: string): UploadedDocument | null {
    const row = this.db.prepare(
      'SELECT * FROM uploaded_documents WHERE id = ?'
    ).get(id) as any
    if (!row) return null
    return {
      id: row.id,
      teacherId: row.teacher_id,
      filename: row.filename,
      fileType: row.file_type,
      filePath: row.file_path,
      extractedText: row.extracted_text ?? undefined,
      purpose: row.purpose,
      createdAt: row.created_at
    }
  }

  // ── Curriculum ───────────────────────────────────────────────────

  getCurriculumTopics(subject: string, classLevel: string): any[] {
    return this.db.prepare(
      'SELECT * FROM curriculum_topics WHERE subject = ? AND class_level = ? ORDER BY chapter, topic'
    ).all(subject, classLevel) as any[]
  }

  /** Parsed curriculum topics for a subject (optionally a single class level). */
  getCurriculum(subject: string, classLevel?: string): CurriculumTopic[] {
    const rows = classLevel
      ? this.getCurriculumTopics(subject, classLevel)
      : (this.db.prepare(
          'SELECT * FROM curriculum_topics WHERE subject = ? ORDER BY class_level, chapter'
        ).all(subject) as any[])
    return rows.map(r => this.parseCurriculumRow(r))
  }

  /** True once the curriculum table has been seeded. */
  hasCurriculum(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as n FROM curriculum_topics').get() as any
    return (row?.n ?? 0) > 0
  }

  private parseCurriculumRow(r: any): CurriculumTopic {
    const safeParse = (v: any): string[] => {
      if (Array.isArray(v)) return v
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
    }
    return {
      id: r.id,
      subject: r.subject,
      classLevel: r.class_level,
      chapter: r.chapter ?? 0,
      topic: r.topic,
      subtopics: safeParse(r.subtopics),
      nectaWeight: r.necta_weight ?? 0.5,
      keywords: safeParse(r.keywords),
      textbookRef: r.textbook_ref ?? ''
    }
  }

  seedCurriculum(topics: any[]): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO curriculum_topics
        (id, subject, class_level, chapter, topic, subtopics, necta_weight, keywords, textbook_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMany = this.db.transaction(() => {
      for (const t of topics) {
        insert.run(t.id ?? uuid(), t.subject, t.classLevel, t.chapter ?? null,
          t.topic, JSON.stringify(t.subtopics ?? []), t.nectaWeight ?? 0.5,
          JSON.stringify(t.keywords ?? []), t.textbookRef ?? null)
      }
    })
    insertMany()
  }

  // ── Generation Log ────────────────────────────────────────────────

  logGeneration(data: {
    teacherId: string; feature: string; paramsHash: string;
    tokensUsed: number; durationMs: number; modelUsed: string
  }): void {
    this.db.prepare(`
      INSERT INTO generation_log (id, teacher_id, feature, params_hash, tokens_used, duration_ms, model_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), data.teacherId, data.feature, data.paramsHash,
      data.tokensUsed, data.durationMs, data.modelUsed, Date.now())
  }
}
