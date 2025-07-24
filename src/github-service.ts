import { Octokit } from '@octokit/rest'
import { GitHubConfig } from './types.js'

export class GitHubService {
  private octokit: Octokit

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({
      auth: config.token,
    })
  }

  public async getLatestCommit(
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      const response = await this.octokit.repos.getBranch({
        owner,
        repo,
        branch,
      })

      return response.data.commit.sha
    } catch (error) {
      // Try 'master' if 'main' fails
      if (branch === 'main') {
        try {
          const response = await this.octokit.repos.getBranch({
            owner,
            repo,
            branch: 'master',
          })
          return response.data.commit.sha
        } catch (masterError) {
          throw new Error(`Failed to get latest commit for ${owner}/${repo}: ${error}`)
        }
      }
      throw new Error(`Failed to get latest commit for ${owner}/${repo}: ${error}`)
    }
  }

  public async getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
      const response = await this.octokit.repos.get({
        owner,
        repo,
      })

      return response.data.default_branch || 'main'
    } catch (error) {
      console.warn(`Could not determine default branch, using 'main': ${error}`)
      return 'main'
    }
  }
}