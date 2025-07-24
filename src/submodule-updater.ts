import { SubmoduleParser } from './submodule-parser.js'
import { GitHubService } from './github-service.js'
import { GitService } from './git-service.js'
import { RepositoryService } from './repository-service.js'
import { SubmoduleInfo, UpdateResult, GitHubConfig } from './types.js'
import { existsSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'

export class SubmoduleUpdater {
  private submoduleParser: SubmoduleParser
  private gitService: GitService
  private githubService?: GitHubService
  private githubConfig?: GitHubConfig
  private repositoryService: RepositoryService
  private repoPath: string | undefined

  constructor(githubToken?: string, repoPath?: string) {
    this.submoduleParser = new SubmoduleParser()
    this.repositoryService = new RepositoryService()

    // Store the provided repo path (can be undefined)
    this.repoPath = repoPath

    // Initialize git service - will be updated during initialization
    if (repoPath) {
      this.gitService = new GitService(repoPath)
    } else {
      // Temporary initialization, will be updated in initializeRepository
      this.gitService = new GitService('.')
    }

    if (githubToken) {
      // We'll set the GitHub config later when we have repo info
      this.githubConfig = { token: githubToken, owner: '', repo: '' }
    }
  }

  public async updateSubmodules(repoBranch?: string): Promise<UpdateResult[]> {
    console.log('Starting submodule update process...')

    try {
      // Initialize repository if needed
      await this.initializeRepository(repoBranch)

      // Parse .gitmodules
      const submodules = await this.submoduleParser.parseGitmodules(this.repoPath)

      if (submodules.length === 0) {
        console.log('No submodules found')
        return []
      }

      console.log(`Found ${submodules.length} submodules`)

      // Initialize GitHub service if token is provided
      if (this.githubConfig) {
        this.githubService = new GitHubService(this.githubConfig)
      }

      // Get current commits for all submodules
      for (const submodule of submodules) {
        try {
          submodule.currentCommit = await this.gitService.getCurrentCommit(submodule.path)
          console.log(`Current commit for ${submodule.path}: ${submodule.currentCommit}`)
        } catch (error) {
          console.warn(`Could not get current commit for ${submodule.path}: ${error}`)
          submodule.currentCommit = 'unknown'
        }
      }

      // Get latest commits from GitHub
      if (this.githubService) {
        await this.fetchLatestCommits(submodules)
      }

      // Update submodules that need updating
      const results: UpdateResult[] = []

      for (const submodule of submodules) {
        if (submodule.needsUpdate && submodule.currentCommit !== submodule.latestCommit) {
          const result = await this.updateSingleSubmodule(submodule)
          results.push(result)
        }
      }

      // Push changes if any updates were made
      if (results.some(r => r.updated)) {
        await this.gitService.pushChanges()
      }

      console.log('Submodule update process completed')
      return results

    } catch (error) {
      console.error('Error during submodule update:', error)
      throw error
    } finally {
      // Cleanup temporary repository if using temp folder
      await this.cleanupRepository()
    }
  }

  private async fetchLatestCommits(submodules: SubmoduleInfo[]): Promise<void> {
    if (!this.githubService) return

    console.log('Fetching latest commits from GitHub...')

    for (const submodule of submodules) {
      try {
        const githubInfo = this.submoduleParser.extractGitHubInfo(submodule.url)

        if (!githubInfo) {
          console.warn(`Could not extract GitHub info from URL: ${submodule.url}`)
          continue
        }

        const branch = submodule.branch || await this.githubService.getDefaultBranch(githubInfo.owner, githubInfo.repo)
        const latestCommit = await this.githubService.getLatestCommit(githubInfo.owner, githubInfo.repo, branch)

        submodule.latestCommit = latestCommit
        submodule.needsUpdate = latestCommit !== submodule.currentCommit

        console.log(`Latest commit for ${submodule.path}: ${latestCommit} (needs update: ${submodule.needsUpdate})`)
      } catch (error) {
        console.error(`Failed to get latest commit for ${submodule.path}:`, error)
        submodule.latestCommit = submodule.currentCommit
        submodule.needsUpdate = false
      }
    }
  }

  private async updateSingleSubmodule(submodule: SubmoduleInfo): Promise<UpdateResult> {
    try {
      console.log(`Updating submodule ${submodule.path}...`)

      await this.gitService.updateSubmodule(submodule.path, submodule.latestCommit)
      await this.gitService.commitSubmoduleUpdate(
        submodule.path,
        submodule.currentCommit,
        submodule.latestCommit
      )

      return {
        submodule: submodule.path,
        updated: true,
        fromCommit: submodule.currentCommit,
        toCommit: submodule.latestCommit,
      }
    } catch (error) {
      console.error(`Failed to update submodule ${submodule.path}:`, error)

      return {
        submodule: submodule.path,
        updated: false,
        fromCommit: submodule.currentCommit,
        toCommit: submodule.latestCommit,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  public async setGitHubConfig(config: GitHubConfig): Promise<void> {
    this.githubConfig = config
    this.githubService = new GitHubService(config)
  }

  public async initializeRepository(repoBranch?: string): Promise<void> {
    console.log(`🔍 Checking repository configuration: repoPath='${this.repoPath}'`)

    if (!this.repoPath) {
      console.log('📁 No REPO_PATH provided, will use temporary folder')

      if (this.githubConfig) {
        const tempPath = await this.repositoryService.cloneRepository({
          owner: this.githubConfig.owner,
          repo: this.githubConfig.repo,
          branch: repoBranch || 'main',
          githubToken: this.githubConfig.token
        })

        this.repoPath = tempPath
        this.gitService = new GitService(tempPath)
        console.log(`✅ Repository cloned to temporary folder: ${this.repoPath}`)
      } else {
        console.log(`📂 Using current directory: .`)
        this.repoPath = '.'
        this.gitService = new GitService('.')
      }
      return
    }

    if (!existsSync(this.repoPath)) {
      console.log(`📁 REPO_PATH '${this.repoPath}' does not exist`)
      throw new Error(`Repository path does not exist: ${this.repoPath}`)
    }

    if (!existsSync(join(this.repoPath, '.git'))) {
      // Check if it's an empty directory
      try {
        const files = readdirSync(this.repoPath)
        if (files.length === 0) {
          console.log(`📁 REPO_PATH '${this.repoPath}' is empty, will clone into it`)
          console.log(`🧹 Removing empty directory: ${this.repoPath}`)
          try {
            rmSync(this.repoPath, { recursive: true, force: true })
            console.log(`✅ Removed empty directory: ${this.repoPath}`)
          } catch (error) {
            console.warn(`⚠️ Could not remove empty directory: ${error}`)
          }

          if (this.githubConfig) {
            console.log(`🔄 Cloning repository into: ${this.repoPath}`)
            const path = await this.repositoryService.cloneRepositoryToPath({
              owner: this.githubConfig.owner,
              repo: this.githubConfig.repo,
              branch: repoBranch || 'main',
              githubToken: this.githubConfig.token
            }, this.repoPath)

            this.repoPath = path
            this.gitService = new GitService(path)
            console.log(`✅ Repository cloned into: ${this.repoPath}`)
          }
        } else {
          console.log(`📁 REPO_PATH '${this.repoPath}' is not empty and not a git repository`)
          console.log(`📁 Using temporary folder instead`)
          if (this.githubConfig) {
            const tempPath = await this.repositoryService.cloneRepository({
              owner: this.githubConfig.owner,
              repo: this.githubConfig.repo,
              branch: repoBranch || 'main',
              githubToken: this.githubConfig.token
            })
            this.repoPath = tempPath
            this.gitService = new GitService(tempPath)
          }
        }
      } catch (error) {
        console.error(`Error checking directory: ${error}`)
        throw error
      }
    } else {
      console.log(`📂 Using local repository: ${this.repoPath}`)
      this.gitService = new GitService(this.repoPath)
    }

    console.log(`📂 Final repository path: ${this.repoPath}`)

    // Configure Git identity for the repository
    console.log('🔧 Configuring Git identity...')
    await this.gitService.configureGitIdentity()
  }

  public async cleanupRepository(): Promise<void> {
    // Only cleanup if we used temp folder (repoPath was automatically set to temp path)
    if (this.repoPath && this.repoPath.startsWith('/tmp/submodule-updater-')) {
      this.repositoryService.cleanup()
    }
  }

  public async checkForUpdates(): Promise<SubmoduleInfo[]> {
    const submodules = await this.submoduleParser.parseGitmodules(this.repoPath)

    if (!this.githubService || !this.githubConfig) {
      throw new Error('GitHub service not configured')
    }

    await this.fetchLatestCommits(submodules)

    return submodules.filter(s => s.needsUpdate)
  }
}