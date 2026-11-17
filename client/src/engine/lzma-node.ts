/**
 * Node/테스트용 LZMA 해제기.
 * 브라우저 번들에는 포함하지 않는다(용량·AMD interop 문제) — 클라이언트는 서버/사전 해제를 쓴다.
 *
 * 실측(2026-11-17): `lzma` 패키지는 번들에서 `__dirname` 참조로 죽고,
 * `lzma-purejs` 는 AMD 래퍼가 번들에서 `define.apply` 로 죽는다.
 * → 둘 다 **Node 전용**으로만 쓴다. 브라우저는 tools/export.ts 의 .json 경로.
 */
import lzmaPkg from 'lzma-purejs';
import { wrapLzma, ReplayError, type Decompressor } from './yrpx.ts';

export const nodeDecompress: Decompressor = (body, props, outSize) => {
  const wrapped = wrapLzma(body, props, outSize);
  let out: unknown;
  try {
    out = lzmaPkg.decompressFile(wrapped);
  } catch (e) {
    throw new ReplayError('LZMA 해제 실패: ' + (e as Error).message);
  }
  const u8 = out instanceof Uint8Array ? out : Uint8Array.from(out as number[]);
  if (u8.length !== outSize) throw new ReplayError('LZMA 길이 불일치 ' + u8.length + ' != ' + outSize);
  return u8;
};
