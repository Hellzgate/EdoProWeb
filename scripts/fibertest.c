#include <emscripten.h>
#include <emscripten/fiber.h>
#include <stdio.h>

/* 메인 fiber ↔ worker fiber 협조 스위칭 PoC (스레드 없이) */
static emscripten_fiber_t main_fiber;
static emscripten_fiber_t worker_fiber;
static char main_cstack[65536];
static char worker_cstack[65536];
static char main_astack[65536];
static char worker_astack[65536];

static int worker_waiting = 0;
static int worker_done = 0;
static int frame = 0;

static void worker_entry(void* arg) {
	printf("[worker] start\n");
	for (int i = 0; i < 5; i++) {
		printf("[worker] step %d\n", i);
		worker_waiting = 1;
		emscripten_fiber_swap(&worker_fiber, &main_fiber);   /* UI 대기 */
	}
	worker_done = 1;
	printf("[worker] done\n");
	for (;;) {
		emscripten_fiber_swap(&worker_fiber, &main_fiber);
	}
}

static void frame_cb(void* arg) {
	frame++;
	if (frame <= 3 || frame % 120 == 0)
		printf("[main] frame %d\n", frame);
	if (!worker_done && worker_waiting) {
		worker_waiting = 0;                                  /* UI 응답 도착 */
		emscripten_fiber_swap(&main_fiber, &worker_fiber);
	}
	if (worker_done) {
		EM_ASM({ document.getElementById('out').textContent = 'FIBER OK frames=' + $0; }, frame);
	}
}

int main() {
	emscripten_fiber_init_from_current_context(&main_fiber, main_astack, sizeof(main_astack));
	emscripten_fiber_init(&worker_fiber, worker_entry, NULL,
	                      worker_cstack, sizeof(worker_cstack),
	                      worker_astack, sizeof(worker_astack));
	emscripten_set_main_loop_arg(frame_cb, NULL, 0, 1);
	return 0;
}
