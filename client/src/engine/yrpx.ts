/**
 * .yrpX 리더 — DESIGN-V2 P0.
 * 구조: 헤더(32/72B) → 이름(40B×N, UTF-16LE) → duel flags(u32/u64) → [u8 msg][u32 len][len] 반복
 * 압축(flag 0x1)은 LZMA1 — 해제기는 **주입**받는다(브라우저 번들에 LZMA 를 넣지 않는다).
 */

export const REPLAY_FLAG = {
  COMPRESSED: 0x1,
  TAG: 0x2,
  DECODED: 0x4,
  SINGLE_MODE: 0x8,
  LUA64: 0x10,
  NEWREPLAY: 0x20,
  HAND_TEST: 0x40,
  DIRECT_SEED: 0x80,
  DUELFLAG64: 0x100,
  EXTENDED_HEADER: 0x200,
} as const;

export const YRPX_ID = 0x58707279; // 'yrpX'
const YRP1_ID = 0x31707279; // 'yrp1'
const BASE_HEADER = 32;
const EXT_HEADER = 72;
const NAME_BYTES = 40;
const LZMA_PROPS = 5;
const MAX_OUT = 128 * 1024 * 1024;

export interface ReplayPacket {
  message: number;
  data: Uint8Array;
}

export interface ReplayFile {
  version: number;
  flags: number;
  names: string[];
  duelFlags: number;
  packets: ReplayPacket[];
  turns: number;
  compressed: boolean;
  /** 파싱 후 남은 바이트(정상 파일은 0) */
  trailing: number;
  fileBytes: number;
  bodyBytes: number;
}

export class ReplayError extends Error {}

class Reader {
  pos = 0;
  private readonly b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  get remaining(): number {
    return this.b.length - this.pos;
  }
  u8(): number {
    if (this.pos >= this.b.length) throw new ReplayError('EOF(u8)');
    return this.b[this.pos++]!;
  }
  u32(): number {
    if (this.pos + 4 > this.b.length) throw new ReplayError('EOF(u32)');
    const p = this.pos;
    this.pos += 4;
    return (this.b[p]! | (this.b[p + 1]! << 8) | (this.b[p + 2]! << 16) | (this.b[p + 3]! << 24)) >>> 0;
  }
  u64(): number {
    const lo = this.u32();
    const hi = this.u32();
    return hi * 0x100000000 + lo;
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.b.length) throw new ReplayError('EOF(' + n + 'B)');
    const out = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  skip(n: number): void {
    this.pos = Math.min(this.b.length, this.pos + n);
  }
  /** UTF-16LE 고정 길이, NUL 이후는 버린다. */
  utf16Fixed(n: number): string {
    const raw = this.bytes(n);
    let end = raw.length;
    for (let i = 0; i + 1 < raw.length; i += 2) {
      if (raw[i] === 0 && raw[i + 1] === 0) {
        end = i;
        break;
      }
    }
    return new TextDecoder('utf-16le').decode(raw.subarray(0, end));
  }
}

export type Decompressor = (body: Uint8Array, props: Uint8Array, outSize: number) => Uint8Array;

/** LZMA1 원시 스트림 `.lzma` 컨테이너 래핑(브라우저/Node 공용). */
export function wrapLzma(body: Uint8Array, props: Uint8Array, outSize: number): Uint8Array {
  const wrapped = new Uint8Array(13 + body.length);
  wrapped.set(props.subarray(0, LZMA_PROPS), 0);
  new DataView(wrapped.buffer).setBigUint64(5, BigInt(outSize), true);
  wrapped.set(body, 13);
  return wrapped;
}

export function parseYrpx(bytes: Uint8Array, decompress?: Decompressor): ReplayFile {
  if (bytes.length < BASE_HEADER) throw new ReplayError('헤더 부족(' + bytes.length + 'B)');
  const r = new Reader(bytes);

  const id = r.u32();
  if (id === YRP1_ID) throw new ReplayError('구형식(.yrp)은 지원하지 않습니다');
  if (id !== YRPX_ID) throw new ReplayError('리플레이가 아닙니다 (0x' + id.toString(16) + ')');

  const version = r.u32();
  const flags = r.u32();
  r.skip(4); // timestamp
  const dataSize = r.u32();
  r.skip(4); // hash
  const props = r.bytes(8).slice(0, LZMA_PROPS);
  let headerSize = BASE_HEADER;
  if (flags & REPLAY_FLAG.EXTENDED_HEADER) {
    if (bytes.length < EXT_HEADER) throw new ReplayError('확장 헤더 잘림');
    r.skip(40);
    headerSize = EXT_HEADER;
  }

  const compressed = (flags & REPLAY_FLAG.COMPRESSED) !== 0;
  let body: Uint8Array;
  if (compressed) {
    if (!decompress) {
      throw new ReplayError('압축 리플레이(.yrpX)는 해제기가 필요합니다 — Node 도구로 .json 내보내기를 쓰세요');
    }
    if (dataSize <= 0 || dataSize > MAX_OUT) throw new ReplayError('비정상 압축 크기: ' + dataSize);
    const compSize = bytes.length - headerSize;
    body = decompress(bytes.subarray(headerSize, headerSize + compSize), props, dataSize);
  } else {
    body = bytes.subarray(headerSize);
  }

  const br = new Reader(body);
  const names: string[] = [];
  const readSide = () => {
    const count = flags & REPLAY_FLAG.NEWREPLAY ? br.u32() : flags & REPLAY_FLAG.TAG ? 2 : 1;
    if (count > 16) throw new ReplayError('플레이어 수 비정상: ' + count);
    for (let i = 0; i < count; i++) names.push(br.utf16Fixed(NAME_BYTES));
  };
  if (flags & REPLAY_FLAG.SINGLE_MODE) {
    names.push(br.utf16Fixed(NAME_BYTES));
    names.push(br.utf16Fixed(NAME_BYTES));
  } else {
    readSide();
    readSide();
  }

  const duelFlags = flags & REPLAY_FLAG.DUELFLAG64 ? br.u64() : br.u32();

  const packets: ReplayPacket[] = [];
  let turns = 0;
  while (br.remaining > 0) {
    if (br.remaining < 5) break;
    const message = br.u8();
    const len = br.u32();
    if (len > br.remaining) break;
    const data = br.bytes(len);
    packets.push({ message, data });
    if (message === 40) turns++; // MSG_NEW_TURN
  }

  return {
    version,
    flags,
    names,
    duelFlags,
    packets,
    turns,
    compressed,
    trailing: br.remaining,
    fileBytes: bytes.length,
    bodyBytes: body.length,
  };
}
