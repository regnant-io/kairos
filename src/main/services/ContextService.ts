// src/main/services/ContextService.ts
// Provides context awareness for AI chat using simple indexing

import type { DatabaseService } from './DatabaseService'
import type { Lesson, Exam, Student, ReportComment } from '../../shared/db-types'

export class ContextService {
  constructor(private db: DatabaseService) {}

  /**
   * Get relevant context for AI chat based on the user's message
   */
  async getRelevantContext(message: string): Promise<string> {
    const contexts: string[] = []
    const messageLower = message.toLowerCase()

    // Get teacher info
    const teacher = this.db.getTeacher()
    if (teacher) {
      contexts.push(`Teacher: ${teacher.name}`)
      contexts.push(`School: ${teacher.schoolName || 'Not specified'}`)
      contexts.push(`Subjects: ${teacher.subjects?.join(', ') || 'Not specified'}`)
      contexts.push(`Class Levels: ${teacher.classLevels?.join(', ') || 'Not specified'}`)
    }

    // Check if asking about lessons
    if (teacher && this.isAskingAbout(messageLower, ['lesson', 'teach', 'plan', 'topic'])) {
      const lessons = this.db.getLessons(teacher.id)
      if (lessons.length > 0) {
        contexts.push(`\nRecent Lessons (${lessons.length} total):`)
        lessons.slice(0, 5).forEach(lesson => {
          contexts.push(`- ${lesson.subject}: ${lesson.topic} (${lesson.classLevel})`)
        })
      }
    }

    // Check if asking about exams
    if (teacher && this.isAskingAbout(messageLower, ['exam', 'test', 'assessment', 'question'])) {
      const exams = this.db.getExams(teacher.id)
      if (exams.length > 0) {
        contexts.push(`\nRecent Exams (${exams.length} total):`)
        exams.slice(0, 5).forEach(exam => {
          contexts.push(`- ${exam.subject}: ${exam.title} (${exam.classLevel}, ${exam.totalMarks} marks)`)
        })
      }
    }

    // Check if asking about students
    if (teacher && this.isAskingAbout(messageLower, ['student', 'class', 'pupil', 'learner'])) {
      const students = this.db.getStudents(teacher.id)
      if (students.length > 0) {
        const byClass = this.groupByClass(students)
        contexts.push(`\nStudents (${students.length} total):`)
        Object.entries(byClass).forEach(([classLevel, count]) => {
          contexts.push(`- ${classLevel}: ${count} students`)
        })
      }
    }

    // Check if asking about specific subject
    const subjects = ['mathematics', 'physics', 'chemistry', 'biology', 'english', 'kiswahili', 'history', 'geography']
    if (teacher) {
      for (const subject of subjects) {
        if (messageLower.includes(subject)) {
          const subjectLessons = this.db.getLessons(teacher.id, { subject: this.capitalizeFirst(subject) })
          if (subjectLessons.length > 0) {
            contexts.push(`\n${this.capitalizeFirst(subject)} - ${subjectLessons.length} lessons created`)
          }
        }
      }
    }

    // Check if asking about analytics/performance
    if (this.isAskingAbout(messageLower, ['performance', 'analytics', 'progress', 'score', 'grade'])) {
      const analytics = this.db.getAnalytics(teacher?.id || '')
      if (analytics) {
        contexts.push(`\nAnalytics:`)
        contexts.push(`- Total Lessons: ${analytics.totalLessons}`)
        contexts.push(`- Total Exams: ${analytics.totalExams}`)
        contexts.push(`- Total Students: ${analytics.totalStudents}`)
      }
    }

    return contexts.length > 0 ? contexts.join('\n') : ''
  }

  /**
   * Get full context for specific entities (for detailed queries)
   */
  async getDetailedContext(entityType: 'lesson' | 'exam' | 'student', id: string): Promise<string> {
    switch (entityType) {
      case 'lesson': {
        const lesson = this.db.getLesson(id)
        if (!lesson) return ''
        return `Lesson: ${lesson.topic}\nSubject: ${lesson.subject}\nClass: ${lesson.classLevel}\nDuration: ${lesson.durationMins} mins\nObjectives: ${JSON.stringify(lesson.objectives)}`
      }
      case 'exam': {
        const exam = this.db.getExam(id)
        if (!exam) return ''
        return `Exam: ${exam.title}\nSubject: ${exam.subject}\nClass: ${exam.classLevel}\nMarks: ${exam.totalMarks}\nQuestions: ${exam.questions?.length || 0}`
      }
      case 'student': {
        const teacher = this.db.getTeacher()
        if (!teacher) return ''
        const students = this.db.getStudents(teacher.id)
        const student = students.find(s => s.id === id)
        if (!student) return ''
        return `Student: ${student.name}\nClass: ${student.classLevel}\nReg: ${student.regNumber || 'N/A'}`
      }
      default:
        return ''
    }
  }

  /**
   * Build authoritative TIE curriculum context for a subject/class level.
   * When focusTopics are given (a lesson topic or exam topics), the matching
   * syllabus entries are surfaced first so generation stays syllabus-accurate
   * and cites the correct TIE textbook references. Returns '' if no data.
   */
  getCurriculumContext(subject?: string, classLevel?: string, focusTopics?: string[]): string {
    if (!subject) return ''

    let topics = this.db.getCurriculum(subject, classLevel)
    if (!topics || topics.length === 0) return ''

    const focus = (focusTopics ?? []).map(t => t.toLowerCase()).filter(Boolean)

    // Score each syllabus entry by overlap with the requested focus topics.
    const score = (t: any): number => {
      if (focus.length === 0) return 0
      const hay = [t.topic, ...(t.subtopics ?? []), ...(t.keywords ?? [])]
        .join(' ')
        .toLowerCase()
      return focus.reduce((s, f) => s + (hay.includes(f) || f.includes(t.topic.toLowerCase()) ? 1 : 0), 0)
    }

    const ranked = [...topics].sort((a, b) => {
      const d = score(b) - score(a)
      if (d !== 0) return d
      return (b.nectaWeight ?? 0) - (a.nectaWeight ?? 0)
    })

    // If we have focus matches, keep only the relevant ones; otherwise show the
    // highest-weighted syllabus topics as general grounding (capped for tokens).
    const hasMatches = focus.length > 0 && score(ranked[0]) > 0
    const selected = (hasMatches ? ranked.filter(t => score(t) > 0) : ranked).slice(0, 6)

    const lines = selected.map(t => {
      const weightPct = Math.round((t.nectaWeight ?? 0) * 100)
      const subs = (t.subtopics ?? []).join('; ')
      return `- ${t.topic} (${t.classLevel}, NECTA weight ${weightPct}%)\n  Subtopics: ${subs}\n  Textbook: ${t.textbookRef}`
    })

    return `OFFICIAL TIE CURRICULUM (authoritative — align content and cite these exact textbook references):\n${lines.join('\n')}`
  }

  private isAskingAbout(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword))
  }

  private groupByClass(students: Student[]): Record<string, number> {
    return students.reduce((acc, student) => {
      acc[student.classLevel] = (acc[student.classLevel] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}
