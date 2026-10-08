import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, FileQuestion, Filter, Search, X } from 'lucide-react'
import { ipc } from '../hooks/useIPC'
import { useExamStore } from '../stores'
import { Badge, PageHeader, Select, Spinner } from '../components/ui/Primitives'
import type { Exam, Question } from '@shared/db-types'

type BankEntry = { exam: Exam; question: Question; key: string }

export function QuestionBankPage() {
  const navigate = useNavigate()
  const { setCurrentExam } = useExamStore()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    ipc('db:get-exams').then(data => setExams(data ?? [])).finally(() => setLoading(false))
  }, [])

  const entries = useMemo<BankEntry[]>(() => exams.flatMap(exam => {
    const questions = exam.questions?.length ? exam.questions : exam.sections?.flatMap(section => section.questions) ?? []
    return questions.map((question, index) => ({ exam, question, key: `${exam.id}:${question.id || index}` }))
  }), [exams])

  const subjects = Array.from(new Set(exams.map(exam => exam.subject).filter(Boolean))).sort()
  const filtered = entries.filter(({ exam, question }) => {
    const matchesText = `${question.text} ${question.topic} ${exam.title}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (!subject || exam.subject === subject) && (!difficulty || question.difficulty === difficulty)
  })
  const selected = filtered.find(entry => entry.key === selectedKey) ?? filtered[0]

  function openExam(exam: Exam) {
    setCurrentExam(exam)
    navigate('/exam')
  }

  return <div className="operator-page operator-bank-page">
    <div className="operator-eyebrow"><span className="operator-eyebrow-rule" /> ASSESSMENT LIBRARY / QUESTION BANK</div>
    <PageHeader title="Question bank" subtitle="Inspect questions and marking guidance from saved exams."
      actions={<button className="operator-action-primary" onClick={() => navigate('/exam')}>Create an exam <ArrowRight size={16} /></button>} />

    <div className="operator-bank-summary"><strong>{entries.length}</strong><span>QUESTIONS INDEXED</span><i />
      <strong>{exams.length}</strong><span>SOURCE EXAMS</span><i /><strong>{subjects.length}</strong><span>SUBJECTS</span></div>

    <div className="operator-bank-layout">
      <section className="operator-panel operator-bank-list">
        <div className="operator-bank-filterbar">
          <label className="operator-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search questions, topics, exams" aria-label="Search questions" />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label>
          <div className="operator-bank-selects"><Filter size={15} /><Select value={subject} onChange={setSubject} options={subjects.map(value => ({ value, label: value }))} placeholder="All subjects" />
            <Select value={difficulty} onChange={setDifficulty} options={['easy', 'medium', 'hard'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} placeholder="All levels" /></div>
        </div>
        <div className="operator-bank-list-heading"><span>{filtered.length} RESULTS</span><span>SELECT TO INSPECT</span></div>
        {loading ? <div className="operator-loading"><Spinner size={20} /> Loading questions</div> : filtered.length ? filtered.map(({ exam, question, key }) =>
          <button className={`operator-question-row ${selected?.key === key ? 'active' : ''}`} key={key} onClick={() => setSelectedKey(key)}>
            <span className="operator-question-number">Q{String(question.number).padStart(2, '0')}</span>
            <span className="operator-question-row-copy"><strong>{question.text}</strong><small>{exam.subject} <span>·</span> {question.topic || 'Unspecified topic'} <span>·</span> {exam.title}</small></span>
            <span className="operator-question-marks">{question.marks}M</span>
          </button>) : <div className="operator-empty-rows"><FileQuestion size={23} /><strong>{entries.length ? 'No matching questions' : 'No saved questions yet'}</strong><span>{entries.length ? 'Try a broader search or remove a filter.' : 'Save an exam to build your question library.'}</span></div>}
      </section>

      <aside className="operator-panel operator-question-detail">
        {selected ? <>
          <div className="operator-detail-topline"><span>QUESTION INSPECTOR</span><span>{selected.question.marks} MARKS</span></div>
          <div className="operator-detail-id">{selected.exam.subject} / {selected.exam.classLevel} / Q{selected.question.number}</div>
          <h2>{selected.question.text}</h2>
          {selected.question.options?.length ? <div className="operator-option-list">{selected.question.options.map(option => <div key={option.label}><b>{option.label}</b><span>{option.text}</span></div>)}</div> : null}
          <div className="operator-detail-tags"><Badge label={selected.question.type.replace(/_/g, ' ')} color="primary" /><Badge label={selected.question.difficulty} color="slate" /><Badge label={selected.question.bloomsLevel || 'objective'} color="slate" /></div>
          <div className="operator-detail-section"><span>EXPECTED ANSWER</span><p>{selected.question.expectedAnswer || 'No answer recorded.'}</p></div>
          <div className="operator-detail-section"><span>MARKING GUIDANCE</span><p>{selected.question.markingGuide || 'No guidance recorded.'}</p></div>
          <div className="operator-detail-footer"><div><BookOpen size={15} /><span>{selected.exam.title}</span></div><button onClick={() => openExam(selected.exam)}>Open source exam <ArrowRight size={15} /></button></div>
        </> : <div className="operator-empty-rows"><FileQuestion size={23} /><strong>Select a question</strong><span>Question details and marking guidance appear here.</span></div>}
      </aside>
    </div>
  </div>
}
