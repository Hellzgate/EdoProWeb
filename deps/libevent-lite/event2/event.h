/* libevent-lite: EDOPro 의 libevent 사용면(event/listener/bufferevent/buffer/thread)을
 * wasm(emscripten) 에서 컴파일·링크하기 위한 최소 shim.
 * 지금 단계는 "컴파일/링크 검증"용 스텁이며, 실제 소켓 I/O 는 다음 단계에서
 * WebSocket 백엔드로 교체한다(브라우저에는 TCP 소켓이 없다).
 */
#ifndef EDLITE_EVENT_H
#define EDLITE_EVENT_H

#include <sys/types.h>
#include <sys/time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netdb.h>
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int evutil_socket_t;
typedef struct addrinfo evutil_addrinfo;

#define EV_TIMEOUT   0x01
#define EV_READ      0x02
#define EV_WRITE     0x04
#define EV_SIGNAL    0x08
#define EV_PERSIST   0x10
#define EV_ET        0x20

#define EVLOOP_ONCE      0x01
#define EVLOOP_NONBLOCK  0x02

#define LEV_OPT_LEAVE_SOCKETS_BLOCKING 0x0010
#define LEV_OPT_CLOSE_ON_FREE          0x0001
#define LEV_OPT_CLOSE_ON_EXEC          0x0002
#define LEV_OPT_REUSEABLE              0x0004
#define LEV_OPT_DISABLED               0x0020

#define BEV_EVENT_READING   0x01
#define BEV_EVENT_WRITING   0x02
#define BEV_EVENT_EOF       0x10
#define BEV_EVENT_ERROR     0x20
#define BEV_EVENT_TIMEOUT   0x40
#define BEV_EVENT_CONNECTED 0x80

enum bufferevent_flush_mode {
	BEV_NORMAL = 0,
	BEV_FLUSH = 1,
	BEV_FINISHED = 2
};


#define EVUTIL_INVALID_SOCKET (-1)
typedef socklen_t ev_socklen_t;
#ifndef EVUTIL_AI_ADDRCONFIG
#define EVUTIL_AI_ADDRCONFIG 0x0020
#endif
#ifndef EVUTIL_AI_PASSIVE
#define EVUTIL_AI_PASSIVE 0x0001
#endif
#ifndef EVUTIL_AI_NUMERICHOST
#define EVUTIL_AI_NUMERICHOST 0x0004
#endif
#ifndef BEV_OPT_CLOSE_ON_FREE
#define BEV_OPT_CLOSE_ON_FREE 0x01
#define BEV_OPT_THREADSAFE 0x02
#define BEV_OPT_DEFER_CALLBACKS 0x04
#define BEV_OPT_UNLOCK_CALLBACKS 0x08
#endif
#ifndef EVUTIL_ERR_CONNECT_REFUSED
#define EVUTIL_ERR_CONNECT_REFUSED 111
#endif

typedef struct event_base event_base;
typedef struct event event;
typedef struct bufferevent bufferevent;
typedef struct evbuffer evbuffer;
typedef struct evconnlistener evconnlistener;

typedef void (*event_callback_fn)(evutil_socket_t, short, void*);
typedef void (*bufferevent_data_cb)(bufferevent*, void*);
typedef void (*bufferevent_event_cb)(bufferevent*, short, void*);
typedef void (*evconnlistener_cb)(evconnlistener*, evutil_socket_t, struct sockaddr*, int, void*);
typedef void (*evconnlistener_errorcb)(evconnlistener*, void*);

/* base */
event_base* event_base_new(void);
void event_base_free(event_base*);
int event_base_dispatch(event_base*);
int event_base_loop(event_base*, int flags);
int event_base_loopbreak(event_base*);
int event_base_loopexit(event_base*, const struct timeval*);

/* event */
event* event_new(event_base*, evutil_socket_t, short, event_callback_fn, void*);
int event_add(event*, const struct timeval*);
int event_del(event*);
void event_free(event*);
void event_get_assignment(const event*, event_base**, evutil_socket_t*, short*, event_callback_fn*, void**);

/* util */
void evutil_closesocket(evutil_socket_t);
int evutil_make_socket_nonblocking(evutil_socket_t);
int evutil_make_listen_socket_reuseable(evutil_socket_t);
int evutil_inet_pton(int af, const char* src, void* dst);
const char* evutil_inet_ntop(int af, const void* src, char* dst, size_t size);
int evutil_getaddrinfo(const char* nodename, const char* servname, const evutil_addrinfo* hints, evutil_addrinfo** res);
void evutil_freeaddrinfo(evutil_addrinfo* ai);

/* bufferevent */
bufferevent* bufferevent_socket_new(event_base*, evutil_socket_t, int options);
int bufferevent_socket_connect(bufferevent*, const struct sockaddr*, int socklen);
void bufferevent_setcb(bufferevent*, bufferevent_data_cb readcb, bufferevent_data_cb writecb, bufferevent_event_cb eventcb, void* cbarg);
int bufferevent_enable(bufferevent*, short event);
int bufferevent_disable(bufferevent*, short event);
void bufferevent_free(bufferevent*);
int bufferevent_write(bufferevent*, const void* data, size_t size);
int bufferevent_flush(bufferevent*, short iotype, enum bufferevent_flush_mode mode);
evbuffer* bufferevent_get_input(bufferevent*);

/* evbuffer */
size_t evbuffer_get_length(const evbuffer*);
int evbuffer_remove(evbuffer*, void* data, size_t datlen);
int evbuffer_copyout(evbuffer*, void* data, size_t datlen);
void evbuffer_drain(evbuffer*, size_t len);

/* listener */
evconnlistener* evconnlistener_new(event_base*, evconnlistener_cb cb, void* ptr, unsigned flags, int backlog, evutil_socket_t fd);
evconnlistener* evconnlistener_new_bind(event_base*, evconnlistener_cb cb, void* ptr, unsigned flags, int backlog, const struct sockaddr*, int socklen);
void evconnlistener_free(evconnlistener*);
int evconnlistener_disable(evconnlistener*);
void evconnlistener_set_error_cb(evconnlistener*, evconnlistener_errorcb cb);

/* thread */
int evthread_use_pthreads(void);
void libevent_global_shutdown(void);

#ifdef __cplusplus
}
#endif
#endif /* EDLITE_EVENT_H */
