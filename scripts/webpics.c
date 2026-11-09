/* 카드 이미지를 동기 fetch 로 받아 MEMFS 에 저장 (C 로 분리해 FILE* 타입 문제 회피) */
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <emscripten/fetch.h>

int web_fetch_pic(int code, int type) {
	const char* dir = (type == 1) ? "/pics/field/" : ((type == 2) ? "/pics/cover/" : "/pics/");
	char path[160];
	char url[64];

	snprintf(path, sizeof(path), "%s%d.jpg", dir, code);
	FILE* t = fopen(path, "rb");
	if(t) {
		fclose(t);
		return 1;
	}

	mkdir("/pics", 0777);
	if(type == 1)
		mkdir("/pics/field", 0777);
	if(type == 2)
		mkdir("/pics/cover", 0777);

	snprintf(url, sizeof(url), "/img/%d.jpg", code);

	emscripten_fetch_attr_t attr;
	emscripten_fetch_attr_init(&attr);
	strcpy(attr.requestMethod, "GET");
	attr.attributes = EMSCRIPTEN_FETCH_LOAD_TO_MEMORY | EMSCRIPTEN_FETCH_SYNCHRONOUS;

	emscripten_fetch_t* f = emscripten_fetch(&attr, url);
	if(!f)
		return 0;

	int ok = 0;
	if(f->status == 200 && f->numBytes > 800) {
		FILE* w = fopen(path, "wb");
		if(w) {
			fwrite(f->data, 1, (size_t)f->numBytes, w);
			fclose(w);
			ok = 1;
		}
	}
	emscripten_fetch_close(f);
	return ok;
}
