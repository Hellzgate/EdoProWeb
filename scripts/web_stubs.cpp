/* 웹 빌드용 스텁: 기존 배포본을 갱신하는 RepoManager(libgit2 의존)를 무력화한다.
 * 브라우저에서는 git clone 이 불가능하므로 리포 관리는 서버가 대행한다.
 */
#include "repo_manager.h"

namespace ygo {

RepoManager::RepoManager() {}
RepoManager::~RepoManager() {}

size_t RepoManager::GetUpdatingReposNumber() const { return 0; }

std::vector<const GitRepo*> RepoManager::GetAllRepos() const { return {}; }

std::vector<const GitRepo*> RepoManager::GetReadyRepos() { return {}; }

std::map<std::string, int> RepoManager::GetRepoStatus() { return {}; }

void RepoManager::LoadRepositoriesFromJson(const nlohmann::json& configs) { (void)configs; }

bool RepoManager::TerminateIfNothingLoaded() { return false; }

}
