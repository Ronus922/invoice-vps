// The receipt-scan vocabulary shared by the routes, the DB layer and the client.
// No I/O, no React: the form, the routes and the unit tests read the same numbers.
//
// Ported from the visitor-scan module of ALMOG Billing (docs/visitor-scan.md there),
// with the receipt-specific changes listed in docs/receipt-scan.md.

import type { DocType } from '@/lib/doc-type'

/** A phone photo is 2–8 MB; this is far above it and far below nginx's / Next's 20MB body limit. */
export const MAX_SCAN_IMAGE_BYTES = 15 * 1024 * 1024

/** The long side the stored / OCR'd photo is shrunk to (never enlarged). */
export const SCAN_IMAGE_MAX_SIDE = 1600
/** The ladder's second rung: if the lowest quality at 1600px is still over the target, 1280px. Never smaller. */
export const SCAN_IMAGE_FALLBACK_SIDE = 1280
/** The weight the stored photo aims for. Readability of the amounts comes first: the floor may exceed it. */
export const SCAN_IMAGE_TARGET_BYTES = 300 * 1024
/** JPEG qualities tried in this order at each size: 82, then steps of 6 down to 64. Nothing below 64.
 *  JPEG and not WebP/PNG on purpose: the receipt is sent to the accountant and has to open on any computer. */
export const SCAN_IMAGE_QUALITIES = [82, 76, 70, 64] as const;

/** The browser shrinks the CROP to this before uploading, so a 12MP photo does not cross a mobile
 *  connection at full size; the server then brings it down to 1600px. */
export const CLIENT_UPLOAD_MAX_SIDE = 2000;
export const CLIENT_UPLOAD_JPEG_QUALITY = 0.88;

/** A supermarket receipt is tall and narrow (1:4, 1:6 and beyond). Shrinking its LONG side to 1600px
 *  would leave a 270px-wide strip whose digits nobody can read, so the long-side cap yields to a
 *  minimum SHORT side: scanTargetSize keeps the short side at `MIN_SHORT_RATIO` of the cap and lets the
 *  long side grow up to `MAX_LONG_FACTOR` times the cap. A normal photo is not affected. */
export const MIN_SHORT_RATIO = 0.5625; // 900px at the 1600px cap, 1125px at the client's 2000px
export const MAX_LONG_FACTOR = 2.5; // 4000px at the 1600px cap, 5000px at the client's 2000px

export interface PixelSize {
  w: number;
  h: number;
}

/** The size a `w`×`h` picture is drawn at for a given long-side cap `side`: shrunk, never enlarged,
 *  and — for a tall/narrow strip — kept at a readable width (see MIN_SHORT_RATIO). */
export function scanTargetSize(w: number, h: number, side: number): PixelSize {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long <= 0 || short <= 0) return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  let k = Math.min(1, side / long);
  if (short * k < side * MIN_SHORT_RATIO) {
    k = Math.max(k, Math.min(1, (side * MIN_SHORT_RATIO) / short, (side * MAX_LONG_FACTOR) / long));
  }
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Below this the form marks a field for a second look (yellow). */
export const OCR_LOW_CONFIDENCE = 0.7;

/** The fields the OCR reads and the form edits, in form order. The names are the invoices table's own
 *  (`date` = doc_date, `pretax` = amount before VAT), so a scanned row needs no translation. */
export const SCAN_FIELDS = [
  'doc_type', 'vendor', 'vendor_tax_id', 'doc_number', 'date', 'pretax', 'vat', 'total', 'currency', 'payment_method',
] as const;
export type ScanField = (typeof SCAN_FIELDS)[number];

/** The form's / the OCR result's values. Every value is a string ('' = not read) so the form can be
 *  pre-filled without null handling; `date` is `YYYY-MM-DD` (an <input type="date"> value) — it becomes
 *  the table's DD/MM/YYYY only on save (see toStoredDate). */
export interface ScanValues {
  doc_type: DocType;
  vendor: string;
  vendor_tax_id: string;
  doc_number: string;
  date: string;
  pretax: string;
  vat: string;
  total: string;
  currency: string;
  payment_method: string;
}

export const EMPTY_SCAN_VALUES: ScanValues = {
  doc_type: 'unknown', vendor: '', vendor_tax_id: '', doc_number: '', date: '',
  pretax: '', vat: '', total: '', currency: 'ILS', payment_method: '',
};

export type ScanConfidence = Partial<Record<ScanField, number>>;

/** Fields the OCR returns that no screen shows or edits; they ride along from the OCR result to the save. */
export interface ScanPassthrough {
  description: string;
  category: string;
}

export interface OcrResponse {
  /** false = the OCR could not run or could not read; Ronen fills the form by hand. */
  ok: boolean;
  fields: ScanValues;
  passthrough: ScanPassthrough;
  confidence: ScanConfidence;
  /** True when pretax/vat were computed from the total (deriveVatFromTotal), not read. */
  vat_derived: boolean;
  /** The compressed photo (JPEG, no metadata) as base64 — the very bytes the save step stores
   *  (it posts them back and the server keeps them as they are), so the preview matches. */
  image_base64: string;
  image_type: string;
  /** Its weight in bytes — what `invoices.image_bytes` will hold. */
  image_bytes: number;
}

/** The existing row a scan collides with, as the screen shows it before anything is saved. */
export interface DuplicateInfo {
  id: string;
  vendor: string;
  doc_number: string;
  doc_type: DocType;
  date: string | null;
  total: number | null;
  currency: string | null;
  source: string | null;
  created_at: string;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  invoice: 'חשבונית מס',
  receipt: 'קבלה',
  invoice_receipt: 'חשבונית מס-קבלה',
  credit_note: 'חשבונית זיכוי',
  other: 'חשבונית עסקה / מסמך אחר — לבדיקה',
  unknown: 'לא ידוע',
};
