/*
 * webapi.cpp — ocgcore 의 C++ 구조체/콜백을 JS 에서 쓰기 쉽게 감싸는 얇은 C 심.
 * JS 는 이 심만 호출한다(구조체 오프셋 계산 금지 — 컴파일러가 하게 둔다).
 */
#include "ocgapi.h"
#include <cstring>

static OCG_DuelOptions g_opts;

extern "C" {

/* 카드/스크립트/로그 콜백은 JS addFunction 이 돌려준 **테이블 인덱스**를 그대로 받는다. */
int web_create_duel(unsigned int s0, unsigned int s1, unsigned int s2, unsigned int s3,
                    unsigned long long flags,
                    int cardReader, int scriptReader, int logHandler, int readerDone,
                    int unsafeLibs)
{
    std::memset(&g_opts, 0, sizeof(g_opts));
    g_opts.seed[0] = s0;
    g_opts.seed[1] = s1;
    g_opts.seed[2] = s2;
    g_opts.seed[3] = s3;
    g_opts.flags = flags;
    g_opts.cardReader = reinterpret_cast<OCG_DataReader>(cardReader);
    g_opts.scriptReader = reinterpret_cast<OCG_ScriptReader>(scriptReader);
    g_opts.logHandler = reinterpret_cast<OCG_LogHandler>(logHandler);
    g_opts.cardReaderDone = reinterpret_cast<OCG_DataReaderDone>(readerDone);
    g_opts.enableUnsafeLibraries = static_cast<uint8_t>(unsafeLibs);

    OCG_Duel duel = nullptr;
    int rc = OCG_CreateDuel(&duel, g_opts);
    if (rc != 0)
        return -rc;
    return reinterpret_cast<int>(duel);
}

int web_start_duel(OCG_Duel duel) { return duel ? OCG_StartDuel(duel) : -1; }
int web_process(OCG_Duel duel) { return duel ? OCG_DuelProcess(duel) : -1; }
int web_get_message(OCG_Duel duel, unsigned char* buf, int len)
{
    return duel ? OCG_DuelGetMessage(duel, buf, static_cast<uint32_t>(len)) : -1;
}
int web_set_responsei(OCG_Duel duel, int idx, int value)
{
    if (!duel) return -1;
    OCG_DuelSetResponse resp{};
    resp.index = static_cast<uint32_t>(idx);
    resp.value = value;
    return OCG_DuelSetResponse(duel, &resp, sizeof(resp));
}
void web_destroy_duel(OCG_Duel duel) { if (duel) OCG_DestroyDuel(duel); }
int web_loader_version(int* major, int* minor) { return 0; }

} /* extern "C" */
