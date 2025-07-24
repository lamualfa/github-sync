import simpleGit, { SimpleGit, LogResult } from 'simple-git'
import { join } from 'path'
import { SubmoduleInfo, UpdateResult } from './types.js'

export class GitService {
  private git: SimpleGit
  private repoPath: string

  constructor(repoPath: string = '.') {
    this.repoPath = repoPath
    this.git = simpleGit(repoPath)
  }

  public async configureGitIdentity(name?: string, email?: string): Promise<void> {
    try {
      const userName = name || process.env.GIT_USER_NAME || 'Submodule Updater'
      const userEmail = email || process.env.GIT_USER_EMAIL || 'submodule-updater@system.local'

      // Configure git identity if not already set
      await this.git.addConfig('user.name', userName)
      await this.git.addConfig('user.email', userEmail)

      console.log(`Configured Git identity: ${userName} <${userEmail}>`)
    } catch (error) {
      console.warn('Failed to configure Git identity:', error)
      // Continue execution as this might not be critical in all environments
    }
  }

  public async getCurrentCommit(submodulePath: string): Promise<string> {
    try {
      const absolutePath = join(this.repoPath, submodulePath)
      const submoduleGit = simpleGit(absolutePath)
      const log = await submoduleGit.log({ maxCount: 1 })

      if (log.latest) {
        return log.latest.hash
      }

      throw new Error('No commits found in submodule')
    } catch (error) {
      throw new Error(`Failed to get current commit for ${submodulePath}: ${error}`)
    }
  }

  public async updateSubmodule(
    submodulePath: string,
    targetCommit: string
  ): Promise<void> {
    try {
      const absolutePath = join(this.repoPath, submodulePath)
      const submoduleGit = simpleGit(absolutePath)

      // Fetch latest changes
      await submoduleGit.fetch(['--all', '--prune'])

      // Checkout the target commit
      await submoduleGit.checkout(targetCommit)

      console.log(`Updated submodule ${submodulePath} to commit ${targetCommit}`)
    } catch (error) {
      throw new Error(`Failed to update submodule ${submodulePath}: ${error}`)
    }
  }

  public async commitSubmoduleUpdate(
    submodulePath: string,
    fromCommit: string,
    toCommit: string
  ): Promise<void> {
    try {
      // Ensure Git identity is configured before committing
      await this.configureGitIdentity()

      // Stage the submodule change
      await this.git.add(submodulePath)

      // Create commit message with commit hashes
      const commitMessage = `Update submodule ${submodulePath}
      
- From: ${fromCommit}
- To: ${toCommit}`

      await this.git.commit(commitMessage)

      console.log(`Committed submodule update: ${submodulePath} (${fromCommit} -> ${toCommit})`)
    } catch (error) {
      throw new Error(`Failed to commit submodule update: ${error}`)
    }
  }

  public async pushChanges(branch?: string): Promise<void> {
    try {
      await this.git.push('origin', branch || 'main')
      console.log('Pushed changes to remote')
    } catch (error) {
      throw new Error(`Failed to push changes: ${error}`)
    }
  }

  public async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status()
      return status.current || 'main'
    } catch (error) {
      return 'main'
    }
  }

  public async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status()
      return (
        status.files.length > 0 ||
        status.staged.length > 0 ||
        status.modified.length > 0
      )
    } catch (error) {
      return false
    }
  }
}