import { config } from '../config/env.config.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';

export interface S3ObjectResult {
  body: Buffer;
  contentType: string;
}

const MIME_BY_EXT: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

let bucketInitialized = false;

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function encodeS3Path(rawPath: string): string {
  return rawPath
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function buildS3TargetUrl(objectKey?: string): { canonicalUri: string; hostHeader: string; url: string } {
  const bucket = config.s3.bucket;
  const region = config.s3.region || 'us-east-1';
  const rawEndpoint = (config.s3.endpoint || '').trim().replace(/\/+$/, '');
  const cleanKey = objectKey ? objectKey.replace(/^\/+/, '') : '';

  let baseUrl: URL;
  if (rawEndpoint) {
    baseUrl = new URL(rawEndpoint.startsWith('http') ? rawEndpoint : `https://${rawEndpoint}`);
  } else {
    baseUrl = new URL(`https://s3.${region}.amazonaws.com`);
  }

  if (config.s3.forcePathStyle) {
    const rawPath = cleanKey ? `/${bucket}/${cleanKey}` : `/${bucket}`;
    const canonicalUri = encodeS3Path(rawPath);
    const fullUrl = `${baseUrl.origin}${canonicalUri}`;
    return {
      canonicalUri,
      hostHeader: baseUrl.host,
      url: fullUrl,
    };
  }

  const virtualHost = `${bucket}.${baseUrl.host}`;
  const rawPath = cleanKey ? `/${cleanKey}` : '/';
  const canonicalUri = encodeS3Path(rawPath);
  const fullUrl = `${baseUrl.protocol}//${virtualHost}${canonicalUri}`;
  return {
    canonicalUri,
    hostHeader: virtualHost,
    url: fullUrl,
  };
}

function signS3Request(
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
  canonicalUri: string,
  hostHeader: string,
  payloadHash: string,
  contentType?: string
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = config.s3.region || 'us-east-1';
  const service = 's3';

  const headersMap: Record<string, string> = {
    host: hostHeader,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  if (contentType) {
    headersMap['content-type'] = contentType;
  }

  const sortedHeaderKeys = Object.keys(headersMap).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headersMap[k].trim()}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${config.s3.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.s3.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders: Record<string, string> = {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  if (contentType) {
    requestHeaders['Content-Type'] = contentType;
  }

  return requestHeaders;
}

export function inferMimeTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function resolvePublicS3Url(key: string): string {
  const cleanKey = key.replace(/^\/+/, '');
  const publicBase = (config.s3.publicUrl || '').trim().replace(/\/+$/, '');
  if (publicBase) {
    return `${publicBase}/${cleanKey}`;
  }
  return `/uploads/${cleanKey}`;
}

export async function ensureS3Bucket(): Promise<boolean> {
  if (bucketInitialized) return true;
  try {
    const target = buildS3TargetUrl();
    const emptyHash = sha256Hex('');
    const headHeaders = signS3Request('HEAD', target.canonicalUri, target.hostHeader, emptyHash);

    const headRes = await fetch(target.url, {
      headers: headHeaders,
      method: 'HEAD',
      signal: AbortSignal.timeout(3500),
    });

    if (headRes.ok) {
      bucketInitialized = true;
      return true;
    }

    if (headRes.status === 404) {
      const putHeaders = signS3Request('PUT', target.canonicalUri, target.hostHeader, emptyHash);
      const putRes = await fetch(target.url, {
        headers: putHeaders,
        method: 'PUT',
        signal: AbortSignal.timeout(5000),
      });
      if (putRes.ok || putRes.status === 409) {
        bucketInitialized = true;
        logger.app.info(`Bucket S3 '${config.s3.bucket}' inicializado exitosamente.`);
        return true;
      }
    }
    return false;
  } catch (err) {
    logger.app.error('Error al verificar o crear bucket en S3:', err);
    return false;
  }
}

export async function checkS3Connection(): Promise<void> {
  const ready = await ensureS3Bucket();
  if (ready) {
    logger.app.info(`Almacenamiento S3 conectado correctamente (Bucket: ${config.s3.bucket}).`);
  } else {
    logger.app.error(`No se pudo conectar al servicio S3 en ${config.s3.endpoint || 'AWS S3'}.`);
  }
}

export async function uploadS3Object(key: string, body: Buffer, contentType?: string): Promise<string> {
  const cleanKey = key.replace(/^\/+/, '');
  const resolvedMime = contentType || inferMimeTypeFromKey(cleanKey);

  await ensureS3Bucket();
  const target = buildS3TargetUrl(cleanKey);
  const payloadHash = sha256Hex(body);
  const headers = signS3Request('PUT', target.canonicalUri, target.hostHeader, payloadHash, resolvedMime);

  const response = await fetch(target.url, {
    body: new Uint8Array(body),
    headers,
    method: 'PUT',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    logger.app.error(`Fallo HTTP ${response.status} al subir objeto '${cleanKey}' a S3.`);
    throw new Error('Error al almacenar el archivo en el servidor de objetos S3.');
  }

  logger.app.info(`Objeto almacenado en S3 exitosamente: s3://${config.s3.bucket}/${cleanKey}`);
  return resolvePublicS3Url(cleanKey);
}

export async function getS3Object(key: string): Promise<S3ObjectResult | null> {
  const cleanKey = key.replace(/^\/+/, '').replace(/^uploads\/+/, '');

  try {
    const target = buildS3TargetUrl(cleanKey);
    const emptyHash = sha256Hex('');
    const headers = signS3Request('GET', target.canonicalUri, target.hostHeader, emptyHash);

    const response = await fetch(target.url, {
      headers,
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const arrayBuf = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || inferMimeTypeFromKey(cleanKey);
      return {
        body: Buffer.from(arrayBuf),
        contentType,
      };
    }
  } catch (err) {
    logger.app.error(`Error al obtener objeto '${cleanKey}' desde S3:`, err);
  }

  return null;
}

export async function deleteS3Object(key: string): Promise<void> {
  const cleanKey = key.replace(/^\/+/, '').replace(/^uploads\/+/, '');

  try {
    const target = buildS3TargetUrl(cleanKey);
    const emptyHash = sha256Hex('');
    const headers = signS3Request('DELETE', target.canonicalUri, target.hostHeader, emptyHash);

    await fetch(target.url, {
      headers,
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.app.warn(`Advertencia al eliminar objeto '${cleanKey}' de S3:`, err);
  }
}
