#ifndef SOUND_MINIAUDIO_H
#define SOUND_MINIAUDIO_H
#include "../sound_threaded_backend.h"

class SoundMiniaudioBase;

#ifdef __EMSCRIPTEN__
/* 웹(emscripten)에는 pthread 가 없어 std::thread 기반 래퍼를 쓸 수 없다.
   메인 스레드에서 직접 도는 백엔드를 만든다. */
std::unique_ptr<SoundBackend> MakeMiniaudioBackendDirect();
using SoundMiniaudio = SoundThreadedBackendHelper<SoundMiniaudioBase>;
#else
using SoundMiniaudio = SoundThreadedBackendHelper<SoundMiniaudioBase>;
#endif

#endif //SOUND_MINIAUDIO_H
