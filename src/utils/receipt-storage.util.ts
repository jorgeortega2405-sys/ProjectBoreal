import crypto from 'crypto';

export interface ProcessedReceipt {
  buffer: Buffer;
  extension: string;
  fileHash: string;
  fileName: string;
}

export interface ReceiptProcessResult {
  error?: string;
  receipt?: ProcessedReceipt;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function processReceiptBuffer(orderUuid: string, imageBase64: string): ReceiptProcessResult {
  const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const rawBase64 = matches && matches.length === 3 ? matches[2] : imageBase64;
  const buffer = Buffer.from(rawBase64, 'base64');

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      error: 'El comprobante excede el tamaño máximo permitido de 5 MB.',
    };
  }

  let ext = '';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    ext = 'jpg';
  } else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    ext = 'png';
  } else if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP'
  ) {
    ext = 'webp';
  } else if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
    ext = 'pdf';
  } else {
    return {
      error: 'El formato del archivo no es válido. Solo se aceptan imágenes JPG, PNG, WebP o documentos PDF.',
    };
  }

  const fileName = `receipt-${orderUuid}-${Date.now()}.${ext}`;
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    receipt: {
      buffer,
      extension: ext,
      fileHash,
      fileName,
    },
  };
}
