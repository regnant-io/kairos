// src/main/services/ExportService.ts
// Exports lesson plans, exams, and reports to PDF and DOCX

import { join, dirname } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { v4 as uuid } from 'uuid'
import type { ExportPayload, AnswerSheetContent } from '../../shared/ai-types'
import type { LessonPlan, ExamPaper, ReportComment } from '../../shared/db-types'

export class ExportService {

  getExportsDir(): string {
    const dir = join(app.getPath('userData'), 'exports')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  async exportToPDF(payload: ExportPayload): Promise<string> {
    const html = this.buildHTML(payload)
    const outPath = join(this.getExportsDir(), `${this.safeFilename(payload.title)}-${Date.now()}.pdf`)

    // Use Electron's built-in print-to-PDF via BrowserWindow
    // In production: spawn a hidden BrowserWindow and print to PDF
    // For now, write HTML that user can print from browser
    const htmlPath = outPath.replace('.pdf', '.html')
    writeFileSync(htmlPath, html, 'utf-8')

    // Try to use puppeteer-core if available (bundled with electron)
    try {
      const { BrowserWindow } = require('electron')
      const win = new BrowserWindow({ show: false, webPreferences: { javascript: true } })
      await win.loadURL(`file://${htmlPath}`)
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 }
      })
      win.close()
      writeFileSync(outPath, pdfBuffer)
      return outPath
    } catch {
      // Fallback: return the HTML file (user can print)
      return htmlPath
    }
  }

  async exportToDOCX(payload: ExportPayload): Promise<string> {
    // Build a simple DOCX using the docx library or raw XML
    const outPath = join(this.getExportsDir(), `${this.safeFilename(payload.title)}-${Date.now()}.docx`)

    try {
      const docx = require('docx')
      const doc = this.buildDOCX(payload, docx)
      const buffer = await docx.Packer.toBuffer(doc)
      writeFileSync(outPath, buffer)
      return outPath
    } catch {
      // Fallback to HTML
      return this.exportToPDF(payload)
    }
  }

  // ── HTML Builder ──────────────────────────────────────────────────

  private buildHTML(payload: ExportPayload): string {
    // Answer sheets use a dedicated full-page, absolutely-positioned template so the
    // fiducial markers land at the true sheet corners and every element derives from
    // the shared SheetLayout geometry. Still routed through exportToPDF's
    // BrowserWindow -> printToPDF machinery.
    if (payload.type === 'answer_sheet') {
      return this.buildAnswerSheetHTML(payload.content as AnswerSheetContent, payload)
    }

    const header = this.buildHTMLHeader(payload)
    let body = ''

    if (payload.type === 'lesson') {
      body = this.buildLessonHTML(payload.content as LessonPlan)
    } else if (payload.type === 'exam') {
      body = this.buildExamHTML(payload.content as ExamPaper, payload.includeMarkingScheme)
    } else if (payload.type === 'marking_scheme') {
      body = this.buildMarkingSchemeHTML(payload.content as ExamPaper)
    } else if (payload.type === 'report') {
      const reports = Array.isArray(payload.content) ? payload.content as ReportComment[] : []
      body = this.buildReportsHTML(reports)
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #111; line-height: 1.5; }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm; }
    h1 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
    h2 { font-size: 13pt; margin-top: 16px; margin-bottom: 6px; border-bottom: 1px solid #333; padding-bottom: 2px; }
    h3 { font-size: 11pt; margin-top: 10px; margin-bottom: 4px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { border: 1px solid #666; padding: 4px 8px; text-align: left; font-size: 10pt; }
    th { background: #eee; font-weight: bold; }
    .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; }
    .school-name { font-size: 14pt; font-weight: bold; }
    .section { margin-bottom: 16px; }
    .question { margin: 12px 0; page-break-inside: avoid; }
    .q-num { font-weight: bold; }
    .marks { float: right; font-style: italic; }
    .options { margin-left: 20px; }
    .option { margin: 2px 0; }
    .answer-line { border-bottom: 1px solid #999; margin: 4px 0; height: 20px; }
    .marking-scheme { background: #f5f5f5; border: 1px dashed #999; padding: 8px; margin: 4px 0; }
    ul { margin-left: 20px; }
    li { margin: 2px 0; }
    .footer { text-align: center; font-size: 9pt; color: #666; margin-top: 20px; border-top: 1px solid #ccc; padding-top: 8px; }
    @media print { .page { padding: 0; } body { font-size: 10pt; } }
  </style>
</head>
<body>
<div class="page">
  ${header}
  ${body}
  <div class="footer">Generated by Kairos — AI Teacher Copilot | ${new Date().toLocaleDateString()}</div>
</div>
</body>
</html>`
  }

  // ── Answer-Sheet Builder (OMR) ────────────────────────────────────

  /**
   * Renders a printable OMR answer sheet from the shared SheetLayout geometry.
   *
   * All coordinates are sheet-normalized (0..1) and converted straight to CSS `%`
   * within a fixed A4-aspect `.sheet` container, so the printed positions match what
   * the OMR engine expects when it re-derives geometry from the same layout version:
   * - four fiducial markers rendered as solid black squares at the sheet corners (Req 6.1),
   * - the QR image placed in `layout.qrArea` (Req 2.1),
   * - one numbered row per objective question with the exam question number in the
   *   left gutter (Req 1.6) and a labeled empty circle for each option (Req 1.3, 1.4).
   */
  private buildAnswerSheetHTML(content: AnswerSheetContent, payload: ExportPayload): string {
    const { layout, qrDataUrl, exam, studentName } = content

    // Sheet-normalized (0..1) -> CSS percentage, trimmed to a stable precision.
    const pct = (n: number): string => (n * 100).toFixed(4)

    const fiducials = layout.fiducials
      .map(
        (f) =>
          `<div class="fiducial" style="left:${pct(f.cx)}%;top:${pct(f.cy)}%;"></div>`
      )
      .join('\n    ')

    const qr = `<img class="qr" alt="Answer sheet QR code" src="${qrDataUrl}" style="left:${pct(
      layout.qrArea.x
    )}%;top:${pct(layout.qrArea.y)}%;width:${pct(layout.qrArea.w)}%;" />`

    const rows = layout.rows
      .map((row) => {
        // Every bubble in a row shares the same center Y; the left gutter number sits
        // at that same vertical position, just to the left of the bubble band.
        const cy = row.bubbles.length > 0 ? row.bubbles[0].cy : 0
        const num = `<div class="q-num" style="left:8%;top:${pct(cy)}%;">${row.number}</div>`
        const bubbles = row.bubbles
          .map(
            (b) =>
              `<div class="bubble" style="left:${pct(b.cx)}%;top:${pct(
                b.cy
              )}%;">${b.optionLabel}</div>`
          )
          .join('')
        return `    ${num}${bubbles}`
      })
      .join('\n')

    const studentLine = studentName ? studentName : '__________________________'

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    /* A4-aspect canvas: normalized 0..1 coordinates map directly to % within it. */
    .sheet {
      position: relative;
      width: 100%;
      aspect-ratio: 210 / 297;
      background: #fff;
    }
    /* Solid black corner squares used by the engine for registration (Req 6.1). */
    .fiducial {
      position: absolute;
      width: 6mm;
      height: 6mm;
      background: #000;
      transform: translate(-50%, -50%);
    }
    /* QR positioned at the top-left of layout.qrArea (Req 2.1). */
    .qr {
      position: absolute;
      height: auto;
      image-rendering: pixelated;
    }
    .header {
      position: absolute;
      left: 5%;
      top: 3%;
      width: 60%;
    }
    .header .title { font-size: 15pt; font-weight: bold; }
    .header .meta { font-size: 10pt; margin-top: 2px; }
    .header .student { font-size: 10pt; margin-top: 6px; }
    .instructions {
      position: absolute;
      left: 5%;
      top: 26%;
      width: 90%;
      font-size: 8.5pt;
      color: #333;
    }
    /* Exam question number shown to the student in the left gutter (Req 1.6). */
    .q-num {
      position: absolute;
      transform: translate(-50%, -50%);
      font-size: 10pt;
      font-weight: bold;
    }
    /* Labeled empty option circle. */
    .bubble {
      position: absolute;
      width: 5mm;
      height: 5mm;
      border: 0.4mm solid #000;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8pt;
      line-height: 1;
    }
    @media print {
      html, body { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="title">${exam.title}</div>
      <div class="meta">${exam.subject} &nbsp;&bull;&nbsp; ${exam.classLevel}</div>
      <div class="student">Name: ${studentLine}</div>
    </div>
    <div class="instructions">Fill in one bubble per question completely using a dark pencil. Do not fold or mark outside the bubbles.</div>
    ${fiducials}
    ${qr}
${rows}
  </div>
</body>
</html>`
  }

  private buildHTMLHeader(payload: ExportPayload): string {
    return `<div class="header">
  ${payload.schoolName ? `<div class="school-name">${payload.schoolName}</div>` : ''}
  <h1>${payload.title}</h1>
  ${payload.teacherName ? `<div>Teacher: ${payload.teacherName}</div>` : ''}
  <div>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</div>`
  }

  private buildLessonHTML(plan: LessonPlan): string {
    const timePlanRows = (plan.timePlan ?? []).map(tp => `
      <tr>
        <td><strong>${tp.phase}</strong></td>
        <td>${tp.duration} min</td>
        <td>${tp.teacherActivity}</td>
        <td>${tp.studentActivity}</td>
        <td>${(tp.resources ?? []).join(', ')}</td>
      </tr>`).join('')

    return `
<div class="section">
  <h2>Learning Objectives</h2>
  <h3>Knowledge</h3>
  <ul>${(plan.objectives?.knowledge ?? []).map(o => `<li>${o}</li>`).join('')}</ul>
  <h3>Skills</h3>
  <ul>${(plan.objectives?.skills ?? []).map(o => `<li>${o}</li>`).join('')}</ul>
  <h3>Attitudes</h3>
  <ul>${(plan.objectives?.attitudes ?? []).map(o => `<li>${o}</li>`).join('')}</ul>
</div>

<div class="section">
  <h2>Time Plan</h2>
  <table>
    <thead><tr><th>Phase</th><th>Time</th><th>Teacher Activity</th><th>Student Activity</th><th>Resources</th></tr></thead>
    <tbody>${timePlanRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Content</h2>
  ${plan.content?.localContext ? `<p><strong>Local Context:</strong> ${plan.content.localContext}</p>` : ''}
  <h3>Main Points</h3>
  <ul>${(plan.content?.mainPoints ?? []).map(p => `<li>${p}</li>`).join('')}</ul>
  <h3>Tanzanian Examples</h3>
  <ul>${(plan.content?.examples ?? []).map(e => `<li>${e}</li>`).join('')}</ul>
  <h3>Common Misconceptions to Address</h3>
  <ul>${(plan.content?.commonMisconceptions ?? []).map(m => `<li>${m}</li>`).join('')}</ul>
</div>

<div class="section">
  <h2>Assessment</h2>
  <h3>Formative (during lesson)</h3>
  <ul>${(plan.assessment?.formative ?? []).map(a => `<li>${a}</li>`).join('')}</ul>
  <h3>Summative (end of lesson)</h3>
  <p>${plan.assessment?.summative ?? ''}</p>
</div>

<div class="section">
  <h2>Homework</h2>
  <p><strong>Task:</strong> ${plan.homework?.task ?? ''}</p>
  <p><strong>Objective:</strong> ${plan.homework?.objectives ?? ''}</p>
</div>

<div class="section">
  <h2>Materials Required</h2>
  <ul>${(plan.materials ?? []).map(m => `<li>${m}</li>`).join('')}</ul>
</div>

<div class="section">
  <h2>References</h2>
  <p>${plan.references?.textbook ?? ''}</p>
  <ul>${(plan.references?.additional ?? []).map(r => `<li>${r}</li>`).join('')}</ul>
</div>`
  }

  private buildExamHTML(paper: ExamPaper, includeScheme = false): string {
    const sections = (paper.sections ?? []).map((section, si) => {
      const questions = (section.questions ?? []).map((q, qi) => {
        let qHtml = `<div class="question">
          <p><span class="q-num">${q.number}.</span> ${q.text} <span class="marks">(${q.marks} mark${q.marks !== 1 ? 's' : ''})</span></p>`

        if (q.type === 'multiple_choice' && q.options) {
          qHtml += `<div class="options">${q.options.map(o =>
            `<div class="option">${o.label}. ${o.text}</div>`
          ).join('')}</div>`
        } else if (q.type === 'short_answer') {
          qHtml += `<div class="answer-line"></div><div class="answer-line"></div>`
        } else if (q.type === 'structured_essay') {
          qHtml += Array(6).fill('<div class="answer-line"></div>').join('')
        } else if (q.type === 'fill_in_the_blank') {
          qHtml += `<p>Answer: ___________________________</p>`
        }

        if (includeScheme) {
          qHtml += `<div class="marking-scheme"><strong>Answer:</strong> ${q.expectedAnswer}</div>`
        }

        qHtml += '</div>'
        return qHtml
      }).join('')

      return `<div class="section">
        <h2>${section.name}</h2>
        <p><em>${section.instructions}</em></p>
        ${questions}
      </div>`
    }).join('')

    const examInfo = `
      <p>Subject: <strong>${paper.subject}</strong> &nbsp;&nbsp; Class: <strong>${paper.classLevel}</strong></p>
      <p>Duration: <strong>${paper.duration} minutes</strong> &nbsp;&nbsp; Total Marks: <strong>${paper.totalMarks}</strong></p>
      <h3>Instructions to Candidates:</h3>
      <ol>${(paper.instructions ?? []).map(i => `<li>${i}</li>`).join('')}</ol>
    `

    return examInfo + sections
  }

  private buildMarkingSchemeHTML(paper: ExamPaper): string {
    const entries = (paper.markingScheme ?? []).map(entry => `
      <div class="question">
        <h3>Question ${entry.questionId}</h3>
        <p><strong>Full Answer:</strong> ${entry.fullAnswer}</p>
        <p><strong>Marking Points:</strong></p>
        <ul>${(entry.markingPoints ?? []).map(p => `<li>${p}</li>`).join('')}</ul>
        <p><strong>Marks:</strong> ${entry.marksBreakdown}</p>
      </div>`).join('<hr>')

    return `<h2>MARKING SCHEME — ${paper.title}</h2>${entries}`
  }

  private buildReportsHTML(reports: ReportComment[]): string {
    return reports.map(r => `
      <div class="section" style="page-break-inside: avoid; border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 12px;">
        <p><strong>Student:</strong> ${r.studentId} &nbsp;&nbsp; <strong>Term:</strong> ${r.term} ${r.year}</p>
        <p>${r.commentText}</p>
        ${r.recommendation ? `<p><em>Recommendation: ${r.recommendation}</em></p>` : ''}
      </div>`).join('')
  }

  private buildDOCX(payload: ExportPayload, docx: any): any {
    // Basic DOCX structure
    const { Document, Paragraph, TextRun, HeadingLevel } = docx
    const children: any[] = [
      new Paragraph({ text: payload.title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `Generated: ${new Date().toLocaleDateString()}` })
    ]

    if (payload.type === 'lesson') {
      const plan = payload.content as LessonPlan
      children.push(
        new Paragraph({ text: 'Learning Objectives', heading: HeadingLevel.HEADING_2 }),
        ...(plan.objectives?.knowledge ?? []).map(o => new Paragraph({ text: `• ${o}` }))
      )
    }

    return new Document({ sections: [{ children }] })
  }

  private safeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').slice(0, 50)
  }
}
