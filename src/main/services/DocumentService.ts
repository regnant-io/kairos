// src/main/services/DocumentService.ts
// Parses teacher-uploaded documents: PDF, DOCX, Images (OCR)

import { readFile, existsSync } from 'fs'
import { promisify } from 'util'
import { extname, basename } from 'path'
import { v4 as uuid } from 'uuid'
import type { ParsedDocument } from '../../shared/ai-types'

const readFileAsync = promisify(readFile)

export class DocumentService {

  async parseDocument(filePath: string): Promise<ParsedDocument> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const ext = extname(filePath).toLowerCase()
    const filename = basename(filePath)

    switch (ext) {
      case '.pdf':
        return this.parsePDF(filePath, filename)
      case '.docx':
      case '.doc':
        return this.parseDOCX(filePath, filename)
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.bmp':
      case '.tiff':
      case '.tif':
        return this.parseImage(filePath, filename)
      case '.txt':
        return this.parseTXT(filePath, filename)
      default:
        throw new Error(`Unsupported file type: ${ext}`)
    }
  }

  private async parsePDF(filePath: string, filename: string): Promise<ParsedDocument> {
    const pdfParse = require('pdf-parse')
    const buffer = await readFileAsync(filePath)
    const data = await pdfParse(buffer)

    return {
      id: uuid(),
      filename,
      fileType: 'pdf',
      extractedText: this.cleanText(data.text),
      pageCount: data.numpages,
      wordCount: this.countWords(data.text)
    }
  }

  private async parseDOCX(filePath: string, filename: string): Promise<ParsedDocument> {
    const mammoth = require('mammoth')
    const buffer = await readFileAsync(filePath)
    const result = await mammoth.extractRawText({ buffer })

    return {
      id: uuid(),
      filename,
      fileType: 'docx',
      extractedText: this.cleanText(result.value),
      wordCount: this.countWords(result.value)
    }
  }

  private async parseImage(filePath: string, filename: string): Promise<ParsedDocument> {
    const { createWorker } = require('tesseract.js')
    const worker = await createWorker(['eng', 'swa'])

    try {
      const { data: { text } } = await worker.recognize(filePath)
      return {
        id: uuid(),
        filename,
        fileType: 'image',
        extractedText: this.cleanText(text),
        wordCount: this.countWords(text)
      }
    } finally {
      await worker.terminate()
    }
  }

  private async parseTXT(filePath: string, filename: string): Promise<ParsedDocument> {
    const text = await readFileAsync(filePath, 'utf-8')
    return {
      id: uuid(),
      filename,
      fileType: 'docx', // treat as docx for downstream
      extractedText: this.cleanText(text),
      wordCount: this.countWords(text)
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length
  }

  // Chunk text for embedding / context injection
  chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
    const words = text.split(/\s+/)
    const chunks: string[] = []

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ')
      if (chunk.trim()) chunks.push(chunk)
    }

    return chunks
  }

  // Get most relevant chunks for a query (simple keyword matching fallback)
  getRelevantChunks(text: string, query: string, maxChunks = 3): string {
    const chunks = this.chunkText(text, 400)
    const queryWords = query.toLowerCase().split(/\s+/)

    const scored = chunks.map(chunk => {
      const lower = chunk.toLowerCase()
      const score = queryWords.reduce((sum, word) => {
        return sum + (lower.includes(word) ? 1 : 0)
      }, 0)
      return { chunk, score }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(s => s.chunk)
      .join('\n\n')
  }
}
