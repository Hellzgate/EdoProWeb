#!/usr/bin/env python3
"""web/ 정적 파일을 미리 압축한다 (.gz, .br).

서버는 Accept-Encoding 에 따라 .br → .gz → 원본 순으로 고른다.
 - 실측(1.24.x): wasm 30.1MB → gz 13.4 / br 8.9 · data 107.9MB → gz 52.6 / br 45.0
 - 부팅 전송량: 81.3MB → 54.2MB (-33%)

사용:  python3 scripts/precompress.py [web디렉터리]
"""
import gzip
import os
import sys
import time

try:
    import brotli
except ImportError:  # 이미지에는 pip 로 설치한다
    brotli = None

FILES = ("edopro-full.js", "edopro-full.wasm", "edopro-full.data")
# q9 은 wasm/data 합쳐 약 40초 — 배포 때 한 번만 돌리면 되므로 품질 우선
QUALITY = 9


def main():
    web = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "web")
    web = os.path.abspath(web)
    for name in FILES:
        src = os.path.join(web, name)
        if not os.path.isfile(src):
            print("  skip (없음) %s" % name)
            continue
        raw = open(src, "rb").read()
        t0 = time.time()
        gz = gzip.compress(raw, 6)
        open(src + ".gz", "wb").write(gz)
        t1 = time.time()
        line = "  %-20s raw %6.1fMB  gz %6.1fMB (%.1fs)" % (name, len(raw) / 1048576, len(gz) / 1048576, t1 - t0)
        if brotli:
            br = brotli.compress(raw, quality=QUALITY, lgwin=24)
            open(src + ".br", "wb").write(br)
            line += "  br %6.1fMB (%.1fs)" % (len(br) / 1048576, time.time() - t1)
        print(line)


if __name__ == "__main__":
    main()
