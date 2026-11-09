/* libevent-lite (emscripten): WebSocket 백엔드
 * 브라우저에는 TCP 소켓이 없으므로 bufferevent_socket_connect 는
 * WS 브리지(ws://<base>/ws?host=..&port=..) 로 연결한다.
 */
#include <event2/event.h>

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include <arpa/inet.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/websocket.h>
#endif

#define EVBUF_INIT 65536

struct event_base { int dummy; };
struct event {
	event_base* base;
	evutil_socket_t fd;
	short what;
	event_callback_fn cb;
	void* arg;
	int added;
	double deadline_ms;   /* EV_TIMEOUT 용 */
};
struct evbuffer { unsigned char* data; size_t len; size_t cap; };
struct bufferevent {
	event_base* base;
	evutil_socket_t fd;
	short enabled;
	bufferevent_data_cb readcb;
	bufferevent_data_cb writecb;
	bufferevent_event_cb evcb;
	void* arg;
	evbuffer in;
	evbuffer out;
	int connected;
	int failed;
#ifdef __EMSCRIPTEN__
	EMSCRIPTEN_WEBSOCKET_T ws;
#endif
};
struct evconnlistener { event_base* base; evconnlistener_cb cb; void* arg; evutil_socket_t fd; };

/* ---- 전역 루프 제어 ---- */
static int g_loop_break = 0;
static int g_in_dispatch = 0;

/* ---- evbuffer ---- */
static void buf_reserve(evbuffer* b, size_t need) {
	if(b->cap >= need) return;
	size_t cap = b->cap ? b->cap : EVBUF_INIT;
	while(cap < need) cap *= 2;
	b->data = (unsigned char*)realloc(b->data, cap);
	b->cap = cap;
}
static void buf_append(evbuffer* b, const void* data, size_t len) {
	if(!len) return;
	buf_reserve(b, b->len + len);
	memcpy(b->data + b->len, data, len);
	b->len += len;
}
size_t evbuffer_get_length(const evbuffer* buf) { return buf ? buf->len : 0; }
int evbuffer_remove(evbuffer* buf, void* data, size_t datlen) {
	if(!buf || !data) return -1;
	size_t n = datlen < buf->len ? datlen : buf->len;
	memcpy(data, buf->data, n);
	if(n < buf->len) memmove(buf->data, buf->data + n, buf->len - n);
	buf->len -= n;
	return (int)n;
}
int evbuffer_copyout(evbuffer* buf, void* data, size_t datlen) {
	if(!buf || !data) return -1;
	size_t n = datlen < buf->len ? datlen : buf->len;
	memcpy(data, buf->data, n);
	return (int)n;
}
void evbuffer_drain(evbuffer* buf, size_t len) {
	if(!buf) return;
	if(len > buf->len) len = buf->len;
	if(len < buf->len) memmove(buf->data, buf->data + len, buf->len - len);
	buf->len -= len;
}

/* ---- base ---- */
event_base* event_base_new(void) { return (event_base*)calloc(1, sizeof(event_base)); }
void event_base_free(event_base* b) { free(b); }
int event_base_loopbreak(event_base* b) { (void)b; g_loop_break = 1; return 0; }
int event_base_loopexit(event_base* b, const struct timeval* tv) { (void)b; (void)tv; g_loop_break = 1; return 0; }

static double now_ms(void) {
#ifdef __EMSCRIPTEN__
	return emscripten_get_now();
#else
	return 0.0;
#endif
}

static void run_timers(void) {
	double t = now_ms();
	/* 단순 구현: 등록된 타이머는 전역 목록이 없으므로 event_add 시각에 바로 검사 */
	(void)t;
}

int event_base_loop(event_base* b, int flags) {
	/* [web] 메인 루프에서 호출되는 비차단 펌프: 여기서 sleep 하지 않는다 */
	(void)b; (void)flags;
	return 0;
}

int evlite_loop_break_requested(void) { return g_loop_break; }
void evlite_reset_break(void) { g_loop_break = 0; }

int event_base_dispatch(event_base* b) {
	(void)b;
	g_loop_break = 0;
	g_in_dispatch = 1;
	while(!g_loop_break) {
#ifdef __EMSCRIPTEN__
		emscripten_sleep(1);   /* 브라우저 이벤트(WS 콜백) 처리 */
#endif
	}
	g_in_dispatch = 0;
	return 0;
}

/* ---- event/timer ---- */
event* event_new(event_base* b, evutil_socket_t fd, short what, event_callback_fn cb, void* arg) {
	event* e = (event*)calloc(1, sizeof(event));
	if(!e) return 0;
	e->base = b; e->fd = fd; e->what = what; e->cb = cb; e->arg = arg;
	return e;
}
int event_add(event* e, const struct timeval* tv) {
	if(!e) return -1;
	e->added = 1;
	if((e->what & EV_TIMEOUT) && tv) {
		e->deadline_ms = now_ms() + tv->tv_sec * 1000.0 + tv->tv_usec / 1000.0;
	}
	return 0;
}
int event_del(event* e) { if(!e) return -1; e->added = 0; return 0; }
void event_free(event* e) { free(e); }
void event_get_assignment(const event* e, event_base** base, evutil_socket_t* fd, short* what, event_callback_fn* cb, void** arg) {
	if(base) *base = e ? e->base : 0;
	if(fd) *fd = e ? e->fd : -1;
	if(what) *what = e ? e->what : 0;
	if(cb) *cb = e ? e->cb : 0;
	if(arg) *arg = e ? e->arg : 0;
}

/* ---- util ---- */
void evutil_closesocket(evutil_socket_t fd) { (void)fd; }
int evutil_make_socket_nonblocking(evutil_socket_t fd) { (void)fd; return 0; }
int evutil_make_listen_socket_reuseable(evutil_socket_t fd) { (void)fd; return 0; }
int evutil_inet_pton(int af, const char* src, void* dst) {
	if(af != AF_INET || !src || !dst) return 0;
	return inet_pton(AF_INET, src, dst) == 1 ? 1 : 0;
}
const char* evutil_inet_ntop(int af, const void* src, char* dst, size_t size) {
	if(af != AF_INET || !src || !dst) return 0;
	return inet_ntop(AF_INET, src, dst, (socklen_t)size);
}
int evutil_getaddrinfo(const char* nodename, const char* servname, const evutil_addrinfo* hints, evutil_addrinfo** res) {
	(void)nodename; (void)servname; (void)hints;
	if(res) *res = 0;
	return -1; /* 브라우저에서는 DNS 불가 → IP 리터럴만 지원 */
}
void evutil_freeaddrinfo(evutil_addrinfo* ai) { (void)ai; }

/* ---- bufferevent + WebSocket ---- */
#ifdef __EMSCRIPTEN__
static EM_BOOL ws_onopen(int type, const EmscriptenWebSocketOpenEvent* e, void* ud) {
	(void)type; (void)e;
	bufferevent* bev = (bufferevent*)ud;
	bev->connected = 1;
	if(bev->evcb) bev->evcb(bev, BEV_EVENT_CONNECTED, bev->arg);
	return EM_TRUE;
}
static EM_BOOL ws_onmessage(int type, const EmscriptenWebSocketMessageEvent* e, void* ud) {
	(void)type;
	bufferevent* bev = (bufferevent*)ud;
	if(e && e->numBytes > 0) {
		buf_append(&bev->in, e->data, e->numBytes);
		if(bev->readcb) bev->readcb(bev, bev->arg);
	}
	return EM_TRUE;
}
static EM_BOOL ws_onerror(int type, const EmscriptenWebSocketErrorEvent* e, void* ud) {
	(void)type; (void)e;
	bufferevent* bev = (bufferevent*)ud;
	bev->failed = 1;
	if(bev->evcb) bev->evcb(bev, BEV_EVENT_ERROR, bev->arg);
	g_loop_break = 1;
	return EM_TRUE;
}
static EM_BOOL ws_onclose(int type, const EmscriptenWebSocketCloseEvent* e, void* ud) {
	(void)type; (void)e;
	bufferevent* bev = (bufferevent*)ud;
	if(bev->evcb) bev->evcb(bev, BEV_EVENT_EOF, bev->arg);
	g_loop_break = 1;
	return EM_TRUE;
}

static void ws_connect(bufferevent* bev, const char* host, unsigned short port) {
	char url[512];
	/* 브리지 주소는 페이지에서 지정 가능: window.EDOPRO_WS_BASE */
	char base[256];
	base[0] = 0;
	EM_ASM({
		var b = (typeof window !== 'undefined' && window.EDOPRO_WS_BASE) ? window.EDOPRO_WS_BASE : 'ws://127.0.0.1:9001/ws';
		stringToUTF8(b, $0, 256);
	}, base);
	snprintf(url, sizeof(url), "%s?host=%s&port=%u", base, host, (unsigned)port);
	fprintf(stderr, "[ws] connect %s\n", url);

	EmscriptenWebSocketCreateAttributes attr;
	emscripten_websocket_init_create_attributes(&attr);
	attr.url = url;
	attr.protocols = NULL;
	attr.createOnMainThread = EM_TRUE;
	EMSCRIPTEN_WEBSOCKET_T ws = emscripten_websocket_new(&attr);
	if(ws <= 0) {
		fprintf(stderr, "[ws] create failed\n");
		bev->failed = 1;
		if(bev->evcb) bev->evcb(bev, BEV_EVENT_ERROR, bev->arg);
		g_loop_break = 1;
		return;
	}
	bev->ws = ws;
	emscripten_websocket_set_onopen_callback(ws, bev, ws_onopen);
	emscripten_websocket_set_onmessage_callback(ws, bev, ws_onmessage);
	emscripten_websocket_set_onerror_callback(ws, bev, ws_onerror);
	emscripten_websocket_set_onclose_callback(ws, bev, ws_onclose);
}
#endif

bufferevent* bufferevent_socket_new(event_base* b, evutil_socket_t fd, int options) {
	(void)options;
	bufferevent* bev = (bufferevent*)calloc(1, sizeof(bufferevent));
	if(!bev) return 0;
	bev->base = b; bev->fd = fd;
	return bev;
}

int bufferevent_socket_connect(bufferevent* bev, const struct sockaddr* sa, int socklen) {
	(void)socklen;
	if(!bev || !sa) return -1;
	if(sa->sa_family != AF_INET) {
		fprintf(stderr, "[ws] only IPv4 supported\n");
		if(bev->evcb) bev->evcb(bev, BEV_EVENT_ERROR, bev->arg);
		g_loop_break = 1;
		return -1;
	}
	const struct sockaddr_in* sin = (const struct sockaddr_in*)sa;
	char host[64];
	inet_ntop(AF_INET, &sin->sin_addr, host, sizeof(host));
	unsigned short port = ntohs(sin->sin_port);
#ifdef __EMSCRIPTEN__
	ws_connect(bev, host, port);
#else
	fprintf(stderr, "[ws] non-emscripten build: connect %s:%u (stub)\n", host, port);
	if(bev->evcb) bev->evcb(bev, BEV_EVENT_ERROR, bev->arg);
#endif
	return 0;
}

void bufferevent_setcb(bufferevent* bev, bufferevent_data_cb r, bufferevent_data_cb w, bufferevent_event_cb e, void* arg) {
	if(!bev) return;
	bev->readcb = r; bev->writecb = w; bev->evcb = e; bev->arg = arg;
}
int bufferevent_enable(bufferevent* bev, short ev) { if(!bev) return -1; bev->enabled |= ev; return 0; }
int bufferevent_disable(bufferevent* bev, short ev) { if(!bev) return -1; bev->enabled &= (short)~ev; return 0; }

void bufferevent_free(bufferevent* bev) {
	if(!bev) return;
#ifdef __EMSCRIPTEN__
	if(bev->ws > 0) {
		emscripten_websocket_close(bev->ws, 1000, "bye");
		emscripten_websocket_delete(bev->ws);
		bev->ws = 0;
	}
#endif
	free(bev->in.data);
	free(bev->out.data);
	free(bev);
}

int bufferevent_write(bufferevent* bev, const void* data, size_t size) {
	if(!bev || !data) return -1;
#ifdef __EMSCRIPTEN__
	if(bev->ws > 0) {
		return emscripten_websocket_send_binary(bev->ws, (void*)data, size) == EMSCRIPTEN_RESULT_SUCCESS ? 0 : -1;
	}
#endif
	return -1;
}

int bufferevent_flush(bufferevent* bev, short iotype, enum bufferevent_flush_mode mode) { (void)bev; (void)iotype; (void)mode; return 0; }
evbuffer* bufferevent_get_input(bufferevent* bev) { return bev ? &bev->in : 0; }

/* ---- listener (서버 기능은 웹에서 미사용) ---- */
evconnlistener* evconnlistener_new(event_base* b, evconnlistener_cb cb, void* ptr, unsigned flags, int backlog, evutil_socket_t fd) {
	(void)flags; (void)backlog;
	evconnlistener* l = (evconnlistener*)calloc(1, sizeof(evconnlistener));
	if(!l) return 0;
	l->base = b; l->cb = cb; l->arg = ptr; l->fd = fd;
	return l;
}
evconnlistener* evconnlistener_new_bind(event_base* b, evconnlistener_cb cb, void* ptr, unsigned flags, int backlog, const struct sockaddr* sa, int socklen) {
	(void)sa; (void)socklen;
	return evconnlistener_new(b, cb, ptr, flags, backlog, -1);
}
void evconnlistener_free(evconnlistener* l) { free(l); }
int evconnlistener_disable(evconnlistener* l) { (void)l; return 0; }
void evconnlistener_set_error_cb(evconnlistener* l, evconnlistener_errorcb cb) { (void)l; (void)cb; }

int evthread_use_pthreads(void) { return 0; }
void libevent_global_shutdown(void) {}
int pthread_setname_np(unsigned long thread, const char* name) { (void)thread; (void)name; return 0; }
