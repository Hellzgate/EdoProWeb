/* 웹 빌드용 RepoManager 스텁
 *  - 브라우저에서는 git clone 이 불가능 → 서버(/api/repos)가 동기화하고,
 *    게임의 "저장소" 탭에는 **서버가 받아둔 리포지토리 목록**을 그대로 보여준다.
 *  - 목록은 셸이 preRun 에 window.__repos 로 넣어준다.
 */
#include "repo_manager.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif
#include <cstdlib>
#include <forward_list>
#include <string>
#include <vector>

namespace ygo {

namespace {

std::forward_list<GitRepo> g_repos;
bool g_loaded = false;

void loadReposOnce() {
	if (g_loaded)
		return;
	g_loaded = true;
#ifdef __EMSCRIPTEN__
	EM_ASM({ window.__reposJson = JSON.stringify(window.__repos || []); });
	char* buf = reinterpret_cast<char*>(EM_ASM_INT({ return stringToNewUTF8(window.__reposJson || "[]"); }));
	if (!buf)
		return;
	auto j = nlohmann::json::parse(buf, nullptr, false);
	std::free(buf);
	if (j.is_discarded() || !j.is_array())
		return;
	for (auto& e : j) {
		if (!e.is_object())
			continue;
		GitRepo r;
		r.repo_name = e.value("name", std::string());
		r.repo_path = e.value("path", std::string());
		r.url = e.value("url", std::string());
		r.ready = true;
		r.should_update = false;   // 웹에서는 서버가 갱신
		int files = e.value("files", 0);
		std::string head = e.value("head", std::string());
		r.history.full_history.push_back(std::string("웹: 서버가 동기화함") +
			(files > 0 ? (" · 파일 " + std::to_string(files) + "개") : std::string()) +
			(head.empty() ? std::string() : (" · " + head)));
		r.history.partial_history.push_back("최신 상태입니다 (서버 자동 갱신: 6시간)");
		g_repos.push_front(std::move(r));
	}
#endif
}

} // namespace

RepoManager::RepoManager() {}
RepoManager::~RepoManager() {}

size_t RepoManager::GetUpdatingReposNumber() const {
	loadReposOnce();
	return 0;
}

std::vector<const GitRepo*> RepoManager::GetAllRepos() const {
	loadReposOnce();
	std::vector<const GitRepo*> out;
	for (auto& r : g_repos)
		out.push_back(&r);
	return out;
}

std::vector<const GitRepo*> RepoManager::GetReadyRepos() {
	/* IMPORTANT: EDOPro 는 메인 루프(Draw)에서 매 프레임
	   ParseGithubRepositories(GetReadyRepos()) 를 호출한다.
	   여기서 항상 목록을 돌려주면 매 프레임 lflist 재파싱 + 금제 목록 누적(수천 개)이
	   발생해 게임이 매우 느려지고 금제 콤보가 깨진다.
	   → 최초 1회만 돌려주고 이후에는 빈 목록(파싱/갱신은 서버가 담당). */
	loadReposOnce();
	static bool consumed_once = false;
	std::vector<const GitRepo*> out;
	if (consumed_once)
		return out;
	consumed_once = true;
	for (auto& r : g_repos) {
		out.push_back(&r);
	}
	return out;
}

std::map<std::string, int> RepoManager::GetRepoStatus() {
	loadReposOnce();
	std::map<std::string, int> out;
	for (auto& r : g_repos)
		out[r.repo_path] = 100;   // 이미 서버가 받아둔 상태 = 100%
	return out;
}

void RepoManager::LoadRepositoriesFromJson(const nlohmann::json& configs) { (void)configs; }

bool RepoManager::TerminateIfNothingLoaded() { return false; }

}
