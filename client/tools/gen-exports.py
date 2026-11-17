#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ocgapi.h → emcc EXPORTS 목록.  이 코어는 `OCGAPI <ret> OCG_...(args);` 형식이다."""

import re
import sys

path = sys.argv[1]
src = open(path, encoding="utf-8", errors="replace").read()

names = []
# OCGAPI 로 시작하는 선언 (한 줄)
for m in re.finditer(r"^\s*OCGAPI\s+[^;{]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", src, re.M):
    names.append(m.group(1))
# 혹시 남아 있는 평범한 extern 선언도 포함
for m in re.finditer(
    r"^\s*extern\s+\w[^;{]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", src, re.M
):
    names.append(m.group(1))

seen, out = set(), []
for n in names:
    if n not in seen:
        seen.add(n)
        out.append(n)

print(",".join('"_%s"' % n for n in out))
print("# 개수:", len(out), file=sys.stderr)
print("# 목록:", " ".join(out[:12]), "...", file=sys.stderr)
