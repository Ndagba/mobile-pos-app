import zlib from 'zlib';
import { gzipJson } from '../../src/api/middleware/gzipJson.middleware';

function fakeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    headersSent: false,
    body: undefined as any,
    jsonBody: undefined as any,
    setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
    getHeader: (k: string) => headers[k.toLowerCase()],
    end: (b: Buffer) => (res.body = b),
    json: (b: any) => {
      res.jsonBody = b;
      return res;
    },
    headers,
  };
  return res;
}

describe('gzipJson middleware', () => {
  const big = { status: 'success', data: Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'Goldberg lager' })) };

  it('gzips large JSON when the client accepts gzip', () => {
    const res = fakeRes();
    const next = jest.fn();
    gzipJson({ headers: { 'accept-encoding': 'gzip, deflate' } } as any, res, next);
    expect(next).toHaveBeenCalled();
    res.json(big);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(zlib.gunzipSync(res.body).toString('utf8'))).toEqual(big);
    expect(res.jsonBody).toBeUndefined();
  });

  it('leaves small bodies and non-gzip clients alone', () => {
    const small = fakeRes();
    gzipJson({ headers: { 'accept-encoding': 'gzip' } } as any, small, jest.fn());
    small.json({ ok: true });
    expect(small.jsonBody).toEqual({ ok: true });
    expect(small.headers['content-encoding']).toBeUndefined();

    const plain = fakeRes();
    gzipJson({ headers: {} } as any, plain, jest.fn());
    plain.json(big);
    expect(plain.jsonBody).toEqual(big);
  });
});
