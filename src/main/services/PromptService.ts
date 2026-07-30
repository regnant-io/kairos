// src/main/services/PromptService.ts
// Builds precise, Tanzania-specific prompts for every feature

import type { LessonParams, ExamParams, MarkingParams, ReportParams } from '../../shared/ai-types'

const SYSTEM_FOUNDATION = `You are Kairos, an AI assistant for Tanzanian secondary school teachers.
You are deeply knowledgeable about:
- The Tanzania Institute of Education (TIE) curriculum for Forms 1-6
- NECTA examination formats, marking conventions, and past paper patterns
- The Tanzanian grading scale: A=80-100, B=60-79, C=45-59, D=30-44, F=0-29
- Swahili educational terminology and bilingual instruction
- Resource constraints in Tanzanian classrooms (large class sizes 40-60 students, limited lab equipment)
- Local Tanzanian context: plants (mhogo, mahindi, mwembe), animals (tembo, twiga), geography (Kilimanjaro, Serengeti, Lake Victoria)

Always produce output that is:
- Immediately usable by a teacher without editing
- Aligned with NECTA examination standards
- Respectful of actual classroom conditions
- Practical, concrete, and specific — never vague
- Grounded in Tanzanian reality with local examples

Formatting rules for any JSON you return:
- Return only plain ASCII characters. Write chemical and mathematical notation without unicode subscripts/superscripts, e.g. "H2O", "C2H4", "CO2", "x^2", "H2SO4".
- Do not include any text, notes, or markdown fences outside the JSON object.`

const SWAHILI_ADDON = `
Majibu lazima yawe kwa Kiswahili sanifu.
Tumia istilahi za kisomo za Tanzania (TIE).
Mifano itoke Tanzania — wanyama, mimea, maeneo ya Tanzania.`

const TANZANIA_EXAMPLES: Record<string, Record<string, string[]>> = {
  Biology: {
    plants: ['mhogo (cassava)', 'mahindi (maize)', 'mti wa mwembe (mango tree)', 'miwa (sugarcane)', 'mpunga (rice)'],
    animals: ['tembo (elephant)', 'twiga (giraffe)', 'samaki wa Ziwa Victoria (Nile perch)', 'nyumbu (wildebeest)'],
    ecosystems: ['Serengeti savanna', 'Mt. Kilimanjaro alpine zone', 'Rufiji delta mangroves', 'Zanzibar coral reefs']
  },
  Chemistry: {
    industries: ['TAZAMA oil pipeline', 'Moshi sugar factory (TPC)', 'Dar es Salaam port salt', 'Tanga cement factory'],
    minerals: ['tanzanite (Mererani, Manyara)', 'gold (Geita, Shinyanga)', 'coal (Mchuchuma, Ludewa)', 'diamonds (Mwadui)']
  },
  Physics: {
    applications: ['hydroelectric power at Kidatu', 'TANESCO electricity grid', 'mobile phone networks', 'solar panels in rural schools']
  },
  Geography: {
    features: ['Rift Valley', 'Lake Victoria', 'Mt. Kilimanjaro (5,895 m)', 'Zanzibar coral reefs', 'Ruaha River'],
    economic: ['coffee (Kilimanjaro)', 'cotton (Mwanza)', 'sisal (Tanga)', 'cashew nuts (Mtwara)']
  },
  Mathematics: {
    contexts: ['bus fare calculations in Dar es Salaam', 'crop yield for a shamba', 'mobile money (M-Pesa) transactions', 'school fee calculations']
  }
}

export class PromptService {

  buildLessonPrompt(params: LessonParams, curriculumContext?: string): string {
    const lang = params.language
    const swahiliNote = lang === 'sw' ? SWAHILI_ADDON : lang === 'bilingual' ? '\nProduce content in both English and Swahili where appropriate.' : ''
    const resources = params.availableResources?.join(', ') || 'chalkboard, chalk, textbook'
    const examples = this.getTanzaniaExamples(params.subject)
    const curriculumBlock = curriculumContext ? `\n\n${curriculumContext}\n` : ''

    return `${SYSTEM_FOUNDATION}${swahiliNote}${curriculumBlock}

You are generating a complete lesson plan for a Tanzanian secondary school teacher.

TASK: Generate a complete lesson plan for the following:
- Subject: ${params.subject}
- Topic: ${params.topic}${params.subtopic ? `\n- Subtopic: ${params.subtopic}` : ''}
- Class Level: ${params.classLevel}
- Duration: ${params.durationMins} minutes
- Language: ${lang === 'en' ? 'English' : lang === 'sw' ? 'Swahili' : 'English with Swahili terms'}
- Teaching Style: ${params.teachingStyle ?? 'discussion'}
- Available Resources: ${resources}
${params.priorKnowledge ? `- Prior Knowledge: ${params.priorKnowledge}` : ''}

REQUIREMENTS:
1. Follow the Tanzania Institute of Education (TIE) lesson plan format exactly
2. Use Bloom's Taxonomy objective format: knowledge, skills, attitudes (3 each)
3. Include real examples relevant to Tanzania. Relevant examples for ${params.subject}: ${examples}
4. Assume class size of 40-60 students, limited or no lab equipment
5. Include at least one activity that requires NO materials
6. All time allocations in timePlan must sum EXACTLY to ${params.durationMins} minutes
7. Homework must be doable without internet access
8. References must cite actual TIE textbooks (e.g. "TIE ${params.subject} ${params.classLevel}, Chapter X, pg XX")
9. localContext must connect the topic to something tangible in Tanzania

Return ONLY a valid JSON object with NO additional text, matching this exact schema:
{
  "id": "generated-uuid",
  "subject": "${params.subject}",
  "topic": "${params.topic}",
  "subtopic": ${params.subtopic ? `"${params.subtopic}"` : 'null'},
  "classLevel": "${params.classLevel}",
  "durationMins": ${params.durationMins},
  "language": "${lang}",
  "objectives": {
    "knowledge": ["Students will...", "Students will...", "Students will..."],
    "skills": ["Students will...", "Students will..."],
    "attitudes": ["Students will...", "Students will..."]
  },
  "competencies": ["Critical thinking", "Communication", "..."],
  "timePlan": [
    {"phase": "Introduction", "duration": N, "teacherActivity": "...", "studentActivity": "...", "resources": ["..."]},
    {"phase": "Development", "duration": N, "teacherActivity": "...", "studentActivity": "...", "resources": ["..."]},
    {"phase": "Conclusion", "duration": N, "teacherActivity": "...", "studentActivity": "...", "resources": ["..."]}
  ],
  "content": {
    "mainPoints": ["...", "...", "..."],
    "examples": ["...", "..."],
    "localContext": "...",
    "commonMisconceptions": ["...", "..."]
  },
  "teachingActivities": [
    {"name": "...", "description": "...", "duration": N}
  ],
  "homework": {"task": "...", "objectives": "..."},
  "assessment": {
    "formative": ["...", "..."],
    "summative": "..."
  },
  "teachingNotes": "...",
  "materials": ["...", "..."],
  "references": {
    "textbook": "TIE ${params.subject} ${params.classLevel}, ...",
    "additional": ["..."]
  }
}`
  }

  buildExamPrompt(params: ExamParams, documentContext?: string, curriculumContext?: string): string {
    const questionBreakdown = Object.entries(params.questionTypes)
      .filter(([, count]) => count && count > 0)
      .map(([type, count]) => `- ${this.formatQuestionType(type)}: ${count} question(s)`)
      .join('\n')

    const nectaInstructions = params.nectaStyle ? `
NECTA FORMATTING RULES (mandatory):
- MCQ stems must start with an action verb or clear question
- All MCQ distractors must be plausible and similar length
- Marks shown in brackets at end: e.g. "(03)"
- Include paper code: ${params.subject.toUpperCase().slice(0, 4)}/1/2025
- Standard candidate instructions for sections A, B, C
- "Show all workings" for calculation questions` : ''

    const docContext = documentContext ? `
DOCUMENT CONTEXT (use this as the primary source for question content):
---
${documentContext.slice(0, 3000)}
---` : ''

    const curriculumBlock = curriculumContext ? `\n\n${curriculumContext}\n` : ''

    return `${SYSTEM_FOUNDATION}${curriculumBlock}

You are generating a complete examination paper for a Tanzanian secondary school teacher.${nectaInstructions}${docContext}

TASK: Generate a complete exam paper:
- Subject: ${params.subject}
- Topics: ${params.topics.join(', ')}
- Class Level: ${params.classLevel}
- Exam Type: ${params.examType}
- Total Marks: ${params.totalMarks}
- Duration: ${params.durationMins} minutes
- Difficulty: ${params.difficulty}
- Language: ${params.language}

QUESTION BREAKDOWN:
${questionBreakdown}

REQUIREMENTS:
1. Questions must test different Bloom's levels (remember, understand, apply, analyse)
2. Use Tanzanian contexts in examples where possible
3. Total marks of all questions must equal exactly ${params.totalMarks}
4. Each question must have a complete, detailed marking guide
5. MCQ must have 4 options labeled A, B, C, D with exactly one correct answer
6. The markingScheme must provide detailed model answers for each question

Return ONLY valid JSON matching this schema (no extra text):
{
  "id": "uuid",
  "title": "${params.examType === 'necta_mock' ? 'NECTA Mock ' : ''}${params.subject} ${params.classLevel} ${params.examType.toUpperCase()} Examination",
  "subject": "${params.subject}",
  "classLevel": "${params.classLevel}",
  "examType": "${params.examType}",
  "duration": ${params.durationMins},
  "totalMarks": ${params.totalMarks},
  "language": "${params.language}",
  "nectaStyle": ${params.nectaStyle},
  "instructions": ["...", "..."],
  "sections": [
    {
      "name": "Section A: ...",
      "instructions": "...",
      "marks": N,
      "questions": [
        {
          "id": "q1",
          "number": 1,
          "type": "multiple_choice",
          "text": "...",
          "marks": N,
          "options": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}],
          "expectedAnswer": "A",
          "markingGuide": "...",
          "difficulty": "easy",
          "topic": "...",
          "bloomsLevel": "remember"
        }
      ]
    }
  ],
  "markingScheme": [
    {
      "questionId": "q1",
      "fullAnswer": "...",
      "markingPoints": ["...", "..."],
      "marksBreakdown": "1 mark for..."
    }
  ],
  "generatedAt": "${new Date().toISOString()}"
}`
  }

  buildMarkingPrompt(params: MarkingParams): string {
    const strictnessNote = {
      lenient: 'Be lenient — award marks if the core concept is correct, even if wording is imprecise.',
      standard: 'Be fair — award marks for correct concepts clearly expressed.',
      strict: 'Be strict — require precise scientific/academic language as per NECTA standards.'
    }[params.strictness]

    return `${SYSTEM_FOUNDATION}

You are marking a student's answer for a Tanzanian secondary school exam. ${strictnessNote}

QUESTION MARKING SCHEME:
Expected Answer: ${params.markingScheme.expectedAnswer}
Marking Points (each worth marks):
${params.markingScheme.markingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}
Total Marks: ${params.markingScheme.totalMarks}

STUDENT'S ANSWER:
"${params.studentAnswer}"

TASK: Evaluate this answer and return ONLY valid JSON:
{
  "questionId": "${params.questionId}",
  "suggestedScore": N,
  "maxScore": ${params.markingScheme.totalMarks},
  "confidence": "high|medium|low",
  "pointsAwarded": ["Which marking points were earned..."],
  "pointsMissed": ["Which marking points were missed..."],
  "errorTypes": [
    {"type": "factual|conceptual|calculation|expression", "description": "..."}
  ],
  "feedbackForStudent": "Constructive feedback in 1-2 sentences for the student...",
  "teacherNote": "Brief note explaining why you gave this score..."
}`
  }

  buildReportPrompt(params: ReportParams): string {
    const scoreLines = params.scores.exams
      .map(e => `  - ${e.name}: ${e.score}/${e.maxScore} (${Math.round(e.score/e.maxScore*100)}%)`)
      .join('\n')

    const avgPct = params.scores.classAverage
    const rankNote = params.scores.rank
      ? `Rank: ${params.scores.rank} out of ${params.scores.totalStudents}`
      : ''

    const toneNote = {
      formal: 'Write in formal academic English suitable for an official school report.',
      warm: 'Write in a warm, encouraging tone that motivates the student.',
      direct: 'Write directly and factually, focused on performance data.'
    }[params.tone]

    const lengthNote = {
      brief: '2-3 sentences only.',
      standard: '3-5 sentences.',
      detailed: '5-7 sentences with specific details.'
    }[params.length]

    return `${SYSTEM_FOUNDATION}

You are writing a student report comment for a Tanzanian secondary school teacher.
${toneNote} Length: ${lengthNote}

STUDENT DATA:
- Student: ${params.studentName}
- Subject: ${params.subject}
- Term: ${params.term} ${params.year}
- Class Average: ${avgPct}%
${rankNote}

EXAMINATION SCORES:
${scoreLines}
${params.attendance ? `\nAttendance: ${params.attendance.present}/${params.attendance.total} days` : ''}
${params.behaviorNotes?.length ? `\nTeacher Notes: ${params.behaviorNotes.join('; ')}` : ''}

Return ONLY valid JSON:
{
  "studentName": "${params.studentName}",
  "comment": "The main report comment...",
  "strengths": ["Strength 1", "Strength 2"],
  "areasForGrowth": ["Area 1", "Area 2"],
  "recommendation": "Specific study recommendation referencing TIE textbook if applicable..."
}`
  }

  buildWeaknessInsightsPrompt(report: any): string {
    return `${SYSTEM_FOUNDATION}

You are analyzing class performance data to provide actionable insights for a Tanzanian secondary school teacher.

CLASS DATA:
- Class Level: ${report.classLevel}
- Subject: ${report.subject}
- Class Average: ${report.classAverage}%
- NECTA Readiness Score: ${report.examReadinessScore}%
- Students At Risk (below 45%): ${report.studentsAtRisk.length}

WEAKEST TOPICS (sorted by average score):
${report.weakestTopics.map((t: any) => `- ${t.topic}: ${t.avgScore}% avg`).join('\n')}

STRONGEST TOPICS:
${report.strongestTopics.map((t: any) => `- ${t.topic}: ${t.avgScore}% avg`).join('\n')}

Generate 3-5 specific, actionable insights for this teacher. Each insight should:
1. Be specific (not generic advice)
2. Reference actual topics from the data
3. Suggest concrete teaching strategies relevant to Tanzania

Return ONLY a JSON array of strings:
["Insight 1...", "Insight 2...", "Insight 3..."]`
  }

  private getTanzaniaExamples(subject: string): string {
    const examples = TANZANIA_EXAMPLES[subject]
    if (!examples) return 'use locally relevant Tanzania examples'
    return Object.values(examples).flat().slice(0, 5).join(', ')
  }

  private formatQuestionType(type: string): string {
    const map: Record<string, string> = {
      multipleChoice: 'Multiple Choice',
      trueOrFalse: 'True or False',
      shortAnswer: 'Short Answer',
      structuredEssay: 'Structured Essay',
      fillInTheBlank: 'Fill in the Blank',
      matching: 'Matching'
    }
    return map[type] ?? type
  }
}
