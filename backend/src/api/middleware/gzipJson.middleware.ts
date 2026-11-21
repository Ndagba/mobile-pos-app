import { Request, Response, NextFunction } from 'express';
import zlib from 'zlib';

/**
 * Gzip JSON responses for clients that accept it (phones on slow mobile data).
 *
 * Built on Node's own zlib so the deploy needs no new npm package (production
 * uploads only dist/ + prisma/). Only `res.json` bodies above 1 KB are
 * compressed; everything else (static files, small bodies) is untouched.
 * React Native (OkHttp / NSURLSession), browsers and supertest all decompress
 * transparently.
 */
const MIN_BYTES = 1024;

export function gzipJson(req: Request, res: Response, next: NextFunction) {
  const accepts = String(req.headers['accept-encoding'] || '');
  if (!/\bgzip\b/.test(accepts)) return next();

  const originalJson = res.json.bind(res);
  res.json = (body?: any) => {
    if (res.headersSent || res.getHeader('Content-Encoding')) return originalJson(body);
    const raw = Buffer.from(JSON.stringify(body) ?? 'null', 'utf8');
    if (raw.length < MIN_BYTES) return originalJson(body);
    try {
      const gz = zlib.gzipSync(raw, { level: 6 });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(gz.length));
      res.end(gz);
      return res;
    } catch {
      return originalJson(body);
    }
  };
  next();
}
