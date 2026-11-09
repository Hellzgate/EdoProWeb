/* curl 스텁: 웹 빌드에서는 업데이터/이미지 다운로더를 쓰지 않는다(브라우저/서버가 대행).
 * gframe.cpp 등이 curl 타입/상수만 참조하므로 컴파일·링크용 최소 정의를 제공한다. */
#ifndef EDLITE_CURL_H
#define EDLITE_CURL_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LIBCURL_VERSION_NUM 0x081100 /* 8.17.0 로 표기 */
#define LIBCURL_VERSION "8.17.0"

typedef void CURL;
typedef enum CURLcode_e { CURLE_OK = 0, CURLE_UNSUPPORTED_PROTOCOL = 1, CURLE_FAILED_INIT = 2, CURLE_COULDNT_CONNECT = 7, CURLE_HTTP_RETURNED_ERROR = 22, CURLE_WRITE_ERROR = 23 } CURLcode;
#define CURL_ERROR_SIZE 256
typedef int CURLoption;
typedef int CURLINFO;
typedef int CURLMcode;



enum {
	CURLOPT_WRITEDATA = 10001,
	CURLOPT_URL = 10002,
	CURLOPT_HEADERDATA = 10029,
	CURLOPT_WRITEFUNCTION = 20011,
	CURLOPT_HEADERFUNCTION = 20079,
	CURLOPT_USERAGENT = 10018,
	CURLOPT_NOPROXY = 10177,
	CURLOPT_CAINFO = 10065,
	CURLOPT_FOLLOWLOCATION = 52,
	CURLOPT_NOSIGNAL = 99,
	CURLOPT_SSL_VERIFYPEER = 64,
	CURLOPT_SSL_VERIFYHOST = 81,
	CURLOPT_TIMEOUT = 13,
	CURLOPT_CONNECTTIMEOUT = 78,
	CURLOPT_HTTPGET = 80,
	CURLOPT_XFERINFOFUNCTION = 20219,
	CURLOPT_XFERINFODATA = 10057,
	CURLOPT_NOPROGRESS = 43
};

enum {
	CURLINFO_RESPONSE_CODE = 0x200002,
	CURLINFO_CONTENT_LENGTH_DOWNLOAD = 0x300003
};

#ifndef CURLOPT_FAILONERROR
#define CURLOPT_FAILONERROR 45
#define CURLOPT_ERRORBUFFER 10010
#define CURLOPT_NOSIGNAL 99
#define CURLOPT_FOLLOWLOCATION 52
#define CURLOPT_SSL_VERIFYPEER 64
#define CURLOPT_SSL_VERIFYHOST 81
#define CURLOPT_TIMEOUT 13
#define CURLOPT_CONNECTTIMEOUT 78
#define CURLOPT_HTTPGET 80
#define CURLOPT_WRITEFUNCTION 20011
#define CURLOPT_HEADERFUNCTION 20079
#define CURLOPT_XFERINFOFUNCTION 20219
#define CURLOPT_XFERINFODATA 10057
#define CURLOPT_NOPROGRESS 43
#define CURLOPT_WRITEDATA 10001
#define CURLOPT_HEADERDATA 10029
#define CURLOPT_USERAGENT 10018
#define CURLOPT_URL 10002
#define CURLOPT_NOPROXY 10177
#define CURLOPT_CAINFO 10065
#endif

enum { CURL_GLOBAL_SSL = 1, CURL_GLOBAL_DEFAULT = 3 };

typedef size_t (*curl_write_callback)(char* ptr, size_t size, size_t nmemb, void* userdata);
typedef int (*curl_xferinfo_callback)(void* clientp, long long dltotal, long long dlnow, long long ultotal, long long ulnow);

const char* curl_easy_strerror(CURLcode code);
CURLcode curl_global_init(long flags);
void curl_global_cleanup(void);
CURL* curl_easy_init(void);
void curl_easy_cleanup(CURL* handle);
CURLcode curl_easy_setopt(CURL* handle, CURLoption option, ...);
CURLcode curl_easy_perform(CURL* handle);
CURLcode curl_easy_getinfo(CURL* handle, CURLINFO info, ...);
const char* curl_version(void);

#ifdef __cplusplus
}
#endif
#endif /* EDLITE_CURL_H */
