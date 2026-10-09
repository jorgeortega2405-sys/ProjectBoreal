import { generateAvatarSvg } from '../services/avatar.service.js';
import { Request, Response } from 'express';

export function handleAvatarRequest(req: Request, res: Response): void {
  const name = String(req.query.name || req.query.username || 'Admin').trim();
  const size = Number(req.query.size) || 80;

  const svg = generateAvatarSvg(name, size);

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(svg);
}
