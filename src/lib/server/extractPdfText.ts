import "server-only";

const DEFAULT_MAX_TEXT_CHARS = 24_000;

export type PdfExtractionErrorCode =
  | "PDF_EMPTY_TEXT"
  | "PDF_UNSUPPORTED_FORMAT"
  | "PDF_TEXT_EXTRACTION_FAILED";

export type PdfExtractionResult =
  | {
      ok: true;
      text: string;
      method: "pdf-parse-node";
    }
  | {
      ok: false;
      errorCode: PdfExtractionErrorCode;
      message: string;
      debugMessage?: string;
      method: "pdf-parse-node";
    };

const EXTRACTION_FAILED_MESSAGE =
  "อ่านไฟล์ PDF ไม่สำเร็จ ลองใช้ PDF ที่เลือกข้อความได้ หรือรอรองรับภาพผลตรวจในเวอร์ชันถัดไป";

export async function extractPdfText(
  buffer: Buffer,
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
): Promise<PdfExtractionResult> {
  const method = "pdf-parse-node" as const;

  if (!hasPdfMagicBytes(buffer)) {
    return {
      ok: false,
      errorCode: "PDF_UNSUPPORTED_FORMAT",
      message: "ไฟล์นี้ไม่ใช่ PDF ที่รองรับ กรุณาเลือกไฟล์ PDF ผลตรวจสุขภาพอีกครั้ง",
      method,
    };
  }

  try {
    // Keep pdfjs outside the Next server bundle so its worker resolves from
    // the installed package instead of a missing .next server chunk.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const text = result.text.trim().slice(0, maxTextChars);
      if (!text) {
        return {
          ok: false,
          errorCode: "PDF_EMPTY_TEXT",
          message: EXTRACTION_FAILED_MESSAGE,
          debugMessage: "PDF contained no selectable text",
          method,
        };
      }
      return { ok: true, text, method };
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    return {
      ok: false,
      errorCode: "PDF_TEXT_EXTRACTION_FAILED",
      message: EXTRACTION_FAILED_MESSAGE,
      debugMessage: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      method,
    };
  }
}

function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
