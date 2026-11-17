/** `lzma-purejs` 는 타입 선언이 없다 — 사용하는 표면만 선언한다(CJS default). */
declare module 'lzma-purejs' {
  type Bytes = Uint8Array | number[] | ArrayBuffer;

  interface LzmaPure {
    /** `.lzma` 컨테이너(props 5B + u64 크기 + 스트림)를 해제한다. */
    decompressFile(input: Bytes): Uint8Array | number[];
    compressFile(input: Bytes): Uint8Array | number[];
    version: string;
  }

  const api: LzmaPure;
  export default api;
}
