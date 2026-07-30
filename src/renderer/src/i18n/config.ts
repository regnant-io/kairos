// src/renderer/src/i18n/config.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const en = {
  translation: {
    // Nav
    'nav.dashboard': 'Dashboard',
    'nav.lesson': 'Lesson Planner',
    'nav.exam': 'Exam Generator',
    'nav.marking': 'Marking Assistant',
    'nav.omr': 'OMR Marking',
    'nav.reports': 'Report Writer',
    'nav.analytics': 'Class Insights',
    'nav.settings': 'Settings',

    // Dashboard
    'dashboard.greeting': 'Good {{time}}, {{name}}',
    'dashboard.time.morning': 'morning',
    'dashboard.time.afternoon': 'afternoon',
    'dashboard.time.evening': 'evening',
    'dashboard.subtitle': 'AI Teacher Copilot — Ready to save you time',
    'dashboard.quick_start': 'Quick Start',
    'dashboard.recent': 'Recent Work',
    'dashboard.stats.lessons': 'Lessons',
    'dashboard.stats.exams': 'Exams',
    'dashboard.stats.students': 'Students',
    'dashboard.stats.reports': 'Reports',
    'dashboard.hours_saved': '{{hours}} hrs saved this week',
    'dashboard.ai_ready': 'AI is ready',
    'dashboard.ai_loading': 'Loading AI model...',
    'dashboard.ai_error': 'AI unavailable',

    // Lesson Planner
    'lesson.title': 'Lesson Planner',
    'lesson.subtitle': 'Generate a complete, NECTA-aligned lesson plan in seconds',
    'lesson.subject': 'Subject',
    'lesson.topic': 'Topic',
    'lesson.topic_placeholder': 'e.g. Photosynthesis',
    'lesson.subtopic': 'Subtopic (optional)',
    'lesson.class_level': 'Class Level',
    'lesson.duration': 'Duration (minutes)',
    'lesson.language': 'Language',
    'lesson.teaching_style': 'Teaching Style',
    'lesson.resources': 'Available Resources',
    'lesson.prior_knowledge': 'Prior Knowledge',
    'lesson.generate': 'Generate Lesson Plan',
    'lesson.generating': 'Generating...',
    'lesson.save': 'Save Lesson',
    'lesson.export_pdf': 'Export PDF',
    'lesson.export_docx': 'Export Word',
    'lesson.objectives': 'Objectives',
    'lesson.time_plan': 'Time Plan',
    'lesson.content': 'Content',
    'lesson.activities': 'Teaching Activities',
    'lesson.homework': 'Homework',
    'lesson.assessment': 'Assessment',
    'lesson.materials': 'Materials',
    'lesson.references': 'References',
    'lesson.history': 'Lesson History',
    'lesson.saved': 'Lesson saved!',

    // Exam Generator
    'exam.title': 'Exam Generator',
    'exam.subtitle': 'Create NECTA-style exams and quizzes instantly',
    'exam.subject': 'Subject',
    'exam.topics': 'Topics to Include',
    'exam.class_level': 'Class Level',
    'exam.exam_type': 'Exam Type',
    'exam.question_types': 'Question Types',
    'exam.total_marks': 'Total Marks',
    'exam.duration': 'Duration (minutes)',
    'exam.difficulty': 'Difficulty',
    'exam.necta_style': 'NECTA Format',
    'exam.upload_doc': 'Generate from Document',
    'exam.generate': 'Generate Exam',
    'exam.generating': 'Generating...',
    'exam.preview': 'Exam Preview',
    'exam.marking_scheme': 'Marking Scheme',
    'exam.save': 'Save Exam',
    'exam.export': 'Export',
    'exam.history': 'Exam History',

    // Marking
    'marking.title': 'Marking Assistant',
    'marking.subtitle': 'AI-assisted marking with instant feedback',
    'marking.select_exam': 'Select Exam',
    'marking.select_student': 'Select Student',
    'marking.student_answer': 'Student Answer',
    'marking.strictness': 'Marking Strictness',
    'marking.mark': 'Mark Answer',
    'marking.score': 'Score',
    'marking.feedback': 'Feedback for Student',
    'marking.points_awarded': 'Points Awarded',
    'marking.points_missed': 'Points Missed',
    'marking.override': 'Override Score',
    'marking.save': 'Save Mark',
    'marking.batch': 'Batch Mark',
    'marking.progress': 'Marking Progress',

    // Reports
    'reports.title': 'Report Writer',
    'reports.subtitle': 'Generate professional report comments for every student',
    'reports.select_class': 'Select Class',
    'reports.term': 'Term',
    'reports.year': 'Year',
    'reports.tone': 'Comment Tone',
    'reports.length': 'Comment Length',
    'reports.generate_all': 'Generate All Reports',
    'reports.generate_one': 'Generate Comment',
    'reports.preview': 'Preview Comments',
    'reports.export': 'Export Reports',
    'reports.finalize': 'Finalize',

    // Analytics
    'analytics.title': 'Class Insights',
    'analytics.subtitle': 'Track performance and identify student weaknesses',
    'analytics.select_class': 'Select Class',
    'analytics.select_subject': 'Select Subject',
    'analytics.analyze': 'Analyze Performance',
    'analytics.class_avg': 'Class Average',
    'analytics.necta_ready': 'NECTA Readiness',
    'analytics.at_risk': 'Students At Risk',
    'analytics.weak_topics': 'Weakest Topics',
    'analytics.strong_topics': 'Strongest Topics',
    'analytics.insights': 'AI Insights',

    // Settings
    'settings.title': 'Settings',
    'settings.profile': 'Teacher Profile',
    'settings.name': 'Full Name',
    'settings.school': 'School Name',
    'settings.subjects': 'Subjects You Teach',
    'settings.class_levels': 'Class Levels',
    'settings.language': 'App Language',
    'settings.ai_model': 'AI Model',
    'settings.backup': 'Backup & Sync',
    'settings.save': 'Save Settings',
    'settings.system_info': 'System Info',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.done': 'Done',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.all': 'All',
    'common.none': 'None',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.or': 'or',
    'common.and': 'and',
    'common.marks': '{{n}} marks',
    'common.minutes': '{{n}} minutes',
    'common.students': '{{n}} students',

    // AI Status
    'ai.ready': 'AI Ready',
    'ai.loading': 'Loading model...',
    'ai.generating': 'Generating...',
    'ai.error': 'AI Error — Restart',
    'ai.offline': 'AI Offline'
  }
}

const sw = {
  translation: {
    // Nav
    'nav.dashboard': 'Dashibodi',
    'nav.lesson': 'Mpango wa Somo',
    'nav.exam': 'Tengeneza Mtihani',
    'nav.marking': 'Kusahihisha',
    'nav.omr': 'Kusahihisha kwa OMR',
    'nav.reports': 'Maoni ya Ripoti',
    'nav.analytics': 'Uchambuzi wa Darasa',
    'nav.settings': 'Mipangilio',

    // Dashboard
    'dashboard.greeting': '{{time}} nzuri, {{name}}',
    'dashboard.time.morning': 'Asubuhi',
    'dashboard.time.afternoon': 'Mchana',
    'dashboard.time.evening': 'Jioni',
    'dashboard.subtitle': 'Msaidizi wa AI kwa Walimu',
    'dashboard.ai_ready': 'AI iko tayari',
    'dashboard.ai_loading': 'Inapakia modeli...',

    // Lesson
    'lesson.generate': 'Tengeneza Mpango wa Somo',
    'lesson.generating': 'Inatengeneza...',
    'lesson.title': 'Mpango wa Somo',
    'lesson.subtitle': 'Tengeneza mpango kamili wa somo kwa sekunde',
    'lesson.subject': 'Somo',
    'lesson.topic': 'Mada',
    'lesson.class_level': 'Kiwango cha Darasa',
    'lesson.duration': 'Muda (dakika)',

    // Exam
    'exam.title': 'Tengeneza Mtihani',
    'exam.generate': 'Tengeneza Mtihani',
    'exam.generating': 'Inatengeneza...',

    // Common
    'common.save': 'Hifadhi',
    'common.cancel': 'Ghairi',
    'common.loading': 'Inapakia...',
    'common.error': 'Kuna tatizo',
    'ai.ready': 'AI Iko Tayari',
    'ai.generating': 'Inatengeneza...',
    'ai.error': 'Hitilafu ya AI'
  }
}

i18n.use(initReactI18next).init({
  resources: { en, sw },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
