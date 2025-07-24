export interface SubmoduleInfo {
  path: string
  url: string
  branch?: string
  currentCommit: string
  latestCommit: string
  needsUpdate: boolean
}

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
}

export interface UpdateResult {
  submodule: string
  updated: boolean
  fromCommit: string
  toCommit: string
  error?: string
}