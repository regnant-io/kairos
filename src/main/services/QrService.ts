// src/main/services/QrService.ts
// QR payload codec (pure, canonical JSON round-trip) + QR image decode wrapper.
//
// Determinism boundary: `encodeText`/`parse` are pure and exact inverses.
// The impure edges are `encode` (renders a PNG via the `qrcode` package) and
// `decode` (wraps `jsqr` over an RGBA pixel buffer). See design §2 (QrService).

import jsQR from 'jsqr'
import type { QrPayload } from '@shared/omr-types'
import { UNASSIGNED } from '@shared/omr-types'

// `qrcode` ships no type declarations and is a CommonJS module, so it is loaded
// via require (mirrors how ExportService loads `docx`/`electron`).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode')

// ─── SUPPORTING TYPES ──────────────────────────────────────────────

/** A 2D point in image-pixel coordinates. */
export interface Point {
  x: number
  y: number
}

/** A decoded image as a flat RGBA buffer plus dimensions (jsqr's input shape). */
export interface RgbaImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Result of decoding a QR from an image: payload + corner anchors, or nulls on failure. */
export interface QrDecodeResult {
  payload: QrPayload | null
  corners: Point[] | null
}

// ─── SERVICE ───────────────────────────────────────────────────────

export class QrService {
  /**
   * Canonical JSON encoding of a payload (pure). Keys are emitted in a fixed
   * order (v, examId, studentId) so the string is deterministic and `parse`
   * is an exact inverse.
   */
  encodeText(payload: QrPayload): string {
    return JSON.stringify({
      v: payload.v,
      examId: payload.examId,
      studentId: payload.studentId
    })
  }

  /**
   * Inverse of `encodeText` (pure). Returns the payload when the text is valid
   * canonical JSON with all required fields; returns null on any malformed or
   * missing-field input.
   */
  parse(text: string): QrPayload | null {
    if (typeof text !== 'string' || text.length === 0) return null

    let obj: unknown
    try {
      obj = JSON.parse(text)
    } catch {
      return null
    }

    if (typeof obj !== 'object' || obj === null) return null

    const { v, examId, studentId } = obj as Record<string, unknown>

    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    if (typeof examId !== 'string' || examId.length === 0) return null
    if (typeof studentId !== 'string' || studentId.length === 0) return null

    return { v, examId, studentId }
  }

  /**
   * Render the payload to a PNG data URL for embedding in the answer-sheet HTML.
   * Impure: delegates to the `qrcode` package.
   */
  async encode(payload: QrPayload): Promise<string> {
    const text = this.encodeText(payload)
    const dataUrl: string = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      type: 'image/png'
    })
    return dataUrl
  }

  /**
   * Decode a QR from an RGBA image buffer. On success returns the parsed payload
   * (or null if the QR content is not a valid payload) together with the four
   * corner points, which double as alignment anchors for the engine. When no QR
   * can be located, returns { payload: null, corners: null } so the caller can
   * mark the sheet `qr_unreadable` (Req 5.1).
   */
  decode(img: RgbaImage): QrDecodeResult {
    let result: ReturnType<typeof jsQR> = null
    try {
      result = jsQR(img.data, img.width, img.height)
    } catch {
      result = null
    }

    if (!result) {
      return { payload: null, corners: null }
    }

    const loc = result.location
    const corners: Point[] = [
      { x: loc.topLeftCorner.x, y: loc.topLeftCorner.y },
      { x: loc.topRightCorner.x, y: loc.topRightCorner.y },
      { x: loc.bottomRightCorner.x, y: loc.bottomRightCorner.y },
      { x: loc.bottomLeftCorner.x, y: loc.bottomLeftCorner.y }
    ]

    return { payload: this.parse(result.data), corners }
  }
}

// Re-export the sentinel so callers building payloads can import it alongside the service.
export { UNASSIGNED }
