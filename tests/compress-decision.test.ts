import { describe, expect, it } from 'vitest'
import {
  COMPRESSIBLE_CLASSES, MIN_SAVING_RATIO, classifyPdf, decide, excludedReason, pickSample, sniffKind, summarize,
  type ContentClass, type DecisionInput, type FileKind, type ResultRow,
} from '@/lib/compress/decision'

const bytes = (...b: number[]) => Uint8Array.from(b)
const ascii = (s: string) => Uint8Array.from(Array.from(s).map((c) => c.charCodeAt(0)))

describe('sniffKind — by magic number, never by name or Content-Type', () => {
  it('recognises the formats the bucket can hold', () => {
    expect(sniffKind(ascii('%PDF-1.7\n'))).toBe('pdf')
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('jpeg')
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png')
    expect(sniffKind(bytes(0, 0, 0, 0x18, ...ascii('ftypheic')))).toBe('heic')
    expect(sniffKind(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')))).toBe('webp')
    expect(sniffKind(ascii('GIF89a'))).toBe('gif')
  })
  it('anything else — including an empty or one-byte buffer — is unknown', () => {
    expect(sniffKind(bytes())).toBe('unknown')
    expect(sniffKind(bytes(0xff))).toBe('unknown')
    expect(sniffKind(ascii('hello world, not a file'))).toBe('unknown')
  })
})

describe('classifyPdf — text vs scanned', () => {
  const base = { pages: 2, fileBytes: 100_000 }
  it('a text invoice (plenty of text, little image weight) is pdf-text', () => {
    expect(classifyPdf({ ...base, textChars: 1500, imageBytes: 8_000, imageCount: 1 })).toBe('pdf-text')
  })
  it('a page photo with an OCR layer is image-dominant → pdf-scanned-ocr (its images are the thing to shrink)', () => {
    expect(classifyPdf({ ...base, textChars: 1500, imageBytes: 90_000, imageCount: 2 })).toBe('pdf-scanned-ocr')
  })
  it('images and no text layer → pdf-scanned', () => {
    expect(classifyPdf({ ...base, textChars: 0, imageBytes: 95_000, imageCount: 2 })).toBe('pdf-scanned')
    expect(classifyPdf({ ...base, textChars: 30, imageBytes: 95_000, imageCount: 2 })).toBe('pdf-scanned') // 15 chars/page is not a text layer
  })
  it('neither text nor images → pdf-other', () => {
    expect(classifyPdf({ ...base, textChars: 0, imageBytes: 0, imageCount: 0 })).toBe('pdf-other')
  })
  it('exactly 80 characters per page counts as text; 79 does not', () => {
    expect(classifyPdf({ pages: 1, fileBytes: 1000, textChars: 80, imageBytes: 0, imageCount: 0 })).toBe('pdf-text')
    expect(classifyPdf({ pages: 1, fileBytes: 1000, textChars: 79, imageBytes: 0, imageCount: 0 })).toBe('pdf-other')
  })
})

describe('decide — replace only when it is safe AND worth it', () => {
  const ok: DecisionInput = { source: 'manual', kind: 'jpeg', contentClass: 'jpeg', beforeBytes: 1000, preSkip: null, afterBytes: 600, integrityOk: true }
  const skipReason = (i: Partial<DecisionInput>) => {
    const d = decide({ ...ok, ...i })
    return d.action === 'skip' ? d.reason : 'REPLACE'
  }

  it('40% lighter and intact → replace, with the saving worked out', () => {
    expect(decide(ok)).toEqual({ action: 'replace', savingBytes: 400, savingPct: 40 })
  })
  it('the threshold is MORE than 15%: exactly 15% is skipped, a hair over is replaced', () => {
    expect(MIN_SAVING_RATIO).toBe(0.15)
    expect(skipReason({ afterBytes: 850 })).toBe('below-threshold')
    expect(skipReason({ afterBytes: 849 })).toBe('REPLACE')
    expect(skipReason({ afterBytes: 900 })).toBe('below-threshold')
  })
  it('a result that is not lighter is skipped, however it came out', () => {
    expect(skipReason({ afterBytes: 1000 })).toBe('not-smaller')
    expect(skipReason({ afterBytes: 1300 })).toBe('not-smaller')
  })
  it('a failed integrity check beats any saving — and so does "never ran"', () => {
    expect(skipReason({ integrityOk: false, afterBytes: 100 })).toBe('integrity-failed')
    expect(skipReason({ integrityOk: null, afterBytes: 100 })).toBe('integrity-failed')
  })
  it('no engine output → engine-failed', () => {
    expect(skipReason({ afterBytes: null, integrityOk: null })).toBe('engine-failed')
  })
  it('a scan-source row is never touched, whatever else is true', () => {
    expect(skipReason({ source: 'scan', afterBytes: 10 })).toBe('source-scan')
  })
  it('a rule that forbids touching the file (signed, encrypted, already within target) beats the arithmetic', () => {
    expect(skipReason({ kind: 'pdf', contentClass: 'pdf-scanned', preSkip: 'signed-pdf', afterBytes: 10 })).toBe('signed-pdf')
    expect(skipReason({ kind: 'pdf', contentClass: 'pdf-scanned', preSkip: 'encrypted-pdf', afterBytes: null, integrityOk: null })).toBe('encrypted-pdf')
    expect(skipReason({ preSkip: 'within-target', afterBytes: null, integrityOk: null })).toBe('within-target')
  })
  it('only a JPEG and a scanned PDF without text are ever replaced; every other class is skipped however well it compressed', () => {
    expect([...COMPRESSIBLE_CLASSES]).toEqual(['jpeg', 'pdf-scanned'])
    const reasons: Array<[ContentClass, string]> = [
      ['pdf-signed', 'signed-pdf'],
      ['pdf-text', 'text-layer-pdf'],
      ['pdf-scanned-ocr', 'text-layer-pdf'],
      ['pdf-other', 'class-excluded'],
    ]
    for (const [contentClass, reason] of reasons) {
      expect(excludedReason(contentClass)).toBe(reason)
      // a 95% saving that passed its integrity check changes nothing: the class decides first
      expect(skipReason({ kind: 'pdf', contentClass, afterBytes: 50, integrityOk: true })).toBe(reason)
    }
    expect(excludedReason('jpeg')).toBeNull()
    expect(excludedReason('pdf-scanned')).toBeNull()
    expect(skipReason({ kind: 'pdf', contentClass: 'pdf-scanned', afterBytes: 50 })).toBe('REPLACE')
  })
  it('a signed PDF stays "signed-pdf" even if a caller also marks it by class; the standing pre-skip reason wins', () => {
    expect(skipReason({ kind: 'pdf', contentClass: 'pdf-text', preSkip: 'signed-pdf', afterBytes: 10 })).toBe('signed-pdf')
  })
  it('PNG / HEIC / WEBP / GIF / unknown have no engine → unsupported-type, not an error', () => {
    for (const kind of ['png', 'heic', 'webp', 'gif', 'unknown'] as FileKind[]) expect(skipReason({ kind })).toBe('unsupported-type')
  })
  it('an empty "before" never divides by zero', () => {
    expect(skipReason({ beforeBytes: 0, afterBytes: 0 })).toBe('not-smaller')
  })
})

describe('pickSample — the --limit sample', () => {
  const item = (key: string, kind: FileKind, size: number) => ({ key, kind, bytes: size })
  const items = [item('j1', 'jpeg', 500), item('j2', 'jpeg', 900), item('j3', 'jpeg', 100), item('p1', 'pdf', 300), item('p2', 'pdf', 700)]

  it('alternates between kinds, biggest first inside each', () => {
    expect(pickSample(items, 4).map((i) => i.key)).toEqual(['j2', 'p2', 'j1', 'p1'])
  })
  it('a sample of 2 still has one of each kind', () => {
    expect(new Set(pickSample(items, 2).map((i) => i.kind))).toEqual(new Set(['jpeg', 'pdf']))
  })
  it('asking for more than exists returns everything, once', () => {
    expect(pickSample(items, 50)).toHaveLength(5)
    expect(new Set(pickSample(items, 50).map((i) => i.key)).size).toBe(5)
  })
  it('is deterministic: same input, same order — even with tied sizes', () => {
    const tied = [item('b', 'pdf', 10), item('a', 'pdf', 10), item('c', 'jpeg', 10)]
    expect(pickSample(tied, 3).map((i) => i.key)).toEqual(pickSample([...tied].reverse(), 3).map((i) => i.key))
  })
  it('a limit of 0 or less selects nothing; an empty list is fine', () => {
    expect(pickSample(items, 0)).toEqual([])
    expect(pickSample([], 5)).toEqual([])
  })
})

describe('summarize', () => {
  const rows: ResultRow[] = [
    { contentClass: 'jpeg', beforeBytes: 1000, decision: { action: 'replace', savingBytes: 600, savingPct: 60 } },
    { contentClass: 'jpeg', beforeBytes: 200, decision: { action: 'skip', reason: 'within-target' } },
    { contentClass: 'pdf-text', beforeBytes: 5000, decision: { action: 'skip', reason: 'signed-pdf' } },
    { contentClass: 'pdf-text', beforeBytes: 3000, decision: { action: 'replace', savingBytes: 1000, savingPct: 33.3 } },
  ]
  it('"after" is the bucket weight once the decisions are applied: replaced at the new size, skipped as they were', () => {
    const s = Object.fromEntries(summarize(rows).map((x) => [x.contentClass, x]))
    expect(s.jpeg).toMatchObject({ count: 2, before: 1200, after: 600, replaced: 1, skipped: 1, skippedBy: { 'within-target': 1 } })
    expect(s['pdf-text']).toMatchObject({ count: 2, before: 8000, after: 7000, replaced: 1, skipped: 1, skippedBy: { 'signed-pdf': 1 } })
  })
  it('orders the biggest class first', () => {
    expect(summarize(rows).map((x) => x.contentClass)).toEqual(['pdf-text', 'jpeg'])
  })
})
