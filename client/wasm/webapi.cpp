/*
 * webapi.cpp — ocgcore 를 JS 에서 쉽게 쓰기 위한 얇은 C 심.
 * (ocgapi.h 실측: OCG_CreateDuel(OCG_Duel*, const OCG_DuelOptions*),
 *  OCG_DuelSetResponse(OCG_Duel, const void*, uint32_t), OCG_DestroyDuel(OCG_Duel))
 */
#include "ocgapi.h"
#include <cstring>

static OCG_DuelOptions g_opts;

extern "C" {

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
    int rc = OCG_CreateDuel(&duel, &g_opts);
    if (rc != 0)
        return -rc;
    return static_cast<int>(reinterpret_cast<long>(duel));
}

int web_start_duel(OCG_Duel duel) { return duel ? OCG_StartDuel(duel) : -1; }
int web_process(OCG_Duel duel) { return duel ? OCG_DuelProcess(duel) : -1; }
int web_get_message(OCG_Duel duel, unsigned char* buf, int len)
{
    return duel ? OCG_DuelGetMessage(duel, buf, static_cast<uint32_t>(len)) : -1;
}
int web_set_response_int(OCG_Duel duel, int value)
{
    if (!duel) return -1;
    unsigned char buf[4];
    std::memcpy(buf, &value, 4);
    OCG_DuelSetResponse(duel, buf, 4);
    return 0;
}
int web_set_response_buf(OCG_Duel duel, const void* buf, int len)
{
    if (!duel) return -1;
    OCG_DuelSetResponse(duel, buf, static_cast<uint32_t>(len));
    return 0;
}
void web_destroy_duel(OCG_Duel duel) { if (duel) OCG_DestroyDuel(duel); }

} /* extern "C" */
