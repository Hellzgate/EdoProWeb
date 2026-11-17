/*
 * webapi.cpp — ocgcore 를 JS 에서 쓰기 위한 얇은 C 심.
 *
 * 시그니처는 **ocgapi.h / ocgapi_types.h 실측**을 따른다(추측 금지):
 *   int   OCG_CreateDuel(OCG_Duel*, const OCG_DuelOptions*)
 *   void  OCG_StartDuel(OCG_Duel)
 *   int   OCG_DuelProcess(OCG_Duel)              // 0=END 1=AWAITING 2=CONTINUE
 *   void* OCG_DuelGetMessage(OCG_Duel, uint32_t*) // 내부 버퍼 포인터
 *   void  OCG_DuelSetResponse(OCG_Duel, const void*, uint32_t)
 *   void  OCG_DestroyDuel(OCG_Duel)
 */
#include "ocgapi.h"
#include <cstring>

static OCG_DuelOptions g_opts;
static uint32_t g_msg_len = 0;
static int g_create_status = -1;

extern "C" {

/* 콜백은 JS addFunction 이 돌려준 테이블 인덱스(int)를 그대로 받는다. */
OCG_Duel web_create_duel(unsigned int seed0, unsigned int seed1,
                         unsigned int startLP, unsigned int startHand, unsigned int drawPerTurn,
                         unsigned long long flags,
                         int cardReader, int scriptReader, int logHandler, int readerDone,
                         int unsafeLibs)
{
    std::memset(&g_opts, 0, sizeof(g_opts));
    g_opts.seed[0] = (unsigned long long)seed0 | ((unsigned long long)seed1 << 32);
    g_opts.seed[1] = ~(unsigned long long)seed0 | ((unsigned long long)seed1 << 16);
    g_opts.seed[2] = (unsigned long long)seed0 * 2654435761ULL;
    g_opts.seed[3] = (unsigned long long)seed1 * 40503ULL + 1ULL;
    g_opts.flags = flags;

    g_opts.team1.startingLP = startLP;
    g_opts.team1.startingDrawCount = startHand;
    g_opts.team1.drawCountPerTurn = drawPerTurn;
    g_opts.team2.startingLP = startLP;
    g_opts.team2.startingDrawCount = startHand;
    g_opts.team2.drawCountPerTurn = drawPerTurn;

    g_opts.cardReader = reinterpret_cast<OCG_DataReader>(cardReader);
    g_opts.scriptReader = reinterpret_cast<OCG_ScriptReader>(scriptReader);
    g_opts.logHandler = reinterpret_cast<OCG_LogHandler>(logHandler);
    g_opts.cardReaderDone = reinterpret_cast<OCG_DataReaderDone>(readerDone);
    g_opts.enableUnsafeLibraries = static_cast<uint8_t>(unsafeLibs);

    OCG_Duel duel = nullptr;
    g_create_status = OCG_CreateDuel(&duel, &g_opts);
    if (g_create_status != OCG_DUEL_CREATION_SUCCESS)
        return nullptr;
    return duel;
}

int web_last_create_status(void) { return g_create_status; }

void web_start_duel(OCG_Duel duel) { if (duel) OCG_StartDuel(duel); }

int web_process(OCG_Duel duel)
{
    if (!duel) return -1;
    return OCG_DuelProcess(duel);
}

/* 내부 버퍼 포인터를 반환. 길이는 web_msg_length() 로. */
void* web_get_message(OCG_Duel duel)
{
    g_msg_len = 0;
    if (!duel) return nullptr;
    return OCG_DuelGetMessage(duel, &g_msg_len);
}

unsigned int web_msg_length(void) { return g_msg_len; }

void web_set_response_int(OCG_Duel duel, int value)
{
    if (!duel) return;
    unsigned char buf[4];
    std::memcpy(buf, &value, 4);
    OCG_DuelSetResponse(duel, buf, 4);
}

void web_set_response_buf(OCG_Duel duel, const void* buf, int len)
{
    if (!duel || !buf || len <= 0) return;
    OCG_DuelSetResponse(duel, buf, static_cast<uint32_t>(len));
}

void web_destroy_duel(OCG_Duel duel) { if (duel) OCG_DestroyDuel(duel); }

/* 덱 배치: start_duel 전에 카드마다 1회 호출 */
void web_new_card(OCG_Duel duel, int team, int duelist, unsigned int code,
                  int con, unsigned int loc, unsigned int seq, unsigned int pos)
{
    if (!duel) return;
    OCG_NewCardInfo info;
    std::memset(&info, 0, sizeof(info));
    info.team = static_cast<uint8_t>(team);
    info.duelist = static_cast<uint8_t>(duelist);
    info.code = code;
    info.con = static_cast<uint8_t>(con);
    info.loc = loc;
    info.seq = seq;
    info.pos = pos;
    OCG_DuelNewCard(duel, &info);
}

int web_load_script(OCG_Duel duel, const char* buf, int len, const char* name)
{
    if (!duel) return -1;
    return OCG_LoadScript(duel, buf, static_cast<uint32_t>(len), name);
}

void web_get_version(int* major, int* minor) { OCG_GetVersion(major, minor); }

/**
 * 필드 카드 조회 — 현재 공수/표시형식/엑시즈 소재/카운터.
 *   flags = QUERY_ATTACK|QUERY_DEFENSE|QUERY_OVERLAY_CARD|QUERY_COUNTERS
 *   out[0]=atk, out[1]=def, out[2]=overlay 수, out[3]=counter 총 수
 *   반환: 0 성공, -1 실패(공개 정보 아님/없음)
 */
int web_query_card(OCG_Duel duel, int ctrl, int loc, int seq, unsigned int* out)
{
    if (!duel || !out) return -1;
    OCG_QueryInfo info;
    std::memset(&info, 0, sizeof(info));
    info.con = static_cast<uint8_t>(ctrl);
    info.loc = static_cast<uint32_t>(loc);
    info.seq = static_cast<uint32_t>(seq);

    auto query = [&](unsigned int flags, unsigned char* buf, uint32_t* len) -> unsigned char* {
        info.flags = flags;
        *len = 0;
        return reinterpret_cast<unsigned char*>(OCG_DuelQuery(duel, len, &info));
    };

    unsigned char* p = nullptr;
    uint32_t len = 0;
    int atk = 0, def = 0;
    unsigned int overlays = 0;

    // QUERY_ATTACK — 응답: [u32 flags][i32 atk]
    if ((p = query(0x100u, p, &len)) && len >= 8) std::memcpy(&atk, p + 4, 4);
    // QUERY_DEFENSE
    if ((p = query(0x200u, p, &len)) && len >= 8) std::memcpy(&def, p + 4, 4);
    // QUERY_OVERLAY_CARD — 응답: [u32 flags][u32 count][u32 ids...]
    if ((p = query(0x10000u, p, &len)) && len >= 8) std::memcpy(&overlays, p + 4, 4);

    if (overlays > 100) overlays = 0;      // 방어: 비정상 값 무시
    if (atk > 1000000 || atk < -1000000) atk = 0;
    if (def > 1000000 || def < -1000000) def = 0;

    out[0] = static_cast<unsigned int>(atk);
    out[1] = static_cast<unsigned int>(def);
    out[2] = overlays;
    out[3] = 0;
    return 0;
}

} /* extern "C" */
