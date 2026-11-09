#ifndef EDLITE_SYS_SENDFILE_H
#define EDLITE_SYS_SENDFILE_H
/* emscripten 에는 sendfile 이 없다 → 호출부 컴파일용 최소 정의 */
#include <sys/types.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

static inline ssize_t sendfile(int out_fd, int in_fd, off_t* offset, size_t count) {
	(void)out_fd; (void)in_fd; (void)offset; (void)count;
	return (ssize_t)-1;
}

#ifdef __cplusplus
}
#endif
#endif
