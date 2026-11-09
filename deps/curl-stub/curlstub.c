/* emscripten 환경에 없는 리눅스 헤더/함수 최소 shim */
#include <curl/curl.h>
#include <stddef.h>
#include <stdarg.h>

/* ---- curl 스텁 구현 (모두 실패 반환) ---- */
const char* curl_easy_strerror(CURLcode code) {
	(void)code;
	return "curl disabled in web build";
}
CURLcode curl_global_init(long flags) { (void)flags; return CURLE_OK; }
void curl_global_cleanup(void) {}
CURL* curl_easy_init(void) { return 0; }
void curl_easy_cleanup(CURL* handle) { (void)handle; }
CURLcode curl_easy_setopt(CURL* handle, CURLoption option, ...) { (void)handle; (void)option; return CURLE_FAILED_INIT; }
CURLcode curl_easy_perform(CURL* handle) { (void)handle; return CURLE_FAILED_INIT; }
CURLcode curl_easy_getinfo(CURL* handle, CURLINFO info, ...) { (void)handle; (void)info; return CURLE_FAILED_INIT; }
const char* curl_version(void) { return "curl/8.17.0 (disabled)"; }
