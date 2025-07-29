import simpleGit, { SimpleGit } from 'simple-git'
import { join } from 'path'

export class GitService {
  private git: SimpleGit
  private repoPath: string

  constructor(repoPath: string = '.') {
    this.repoPath = repoPath
    this.git = simpleGit(repoPath)
  }

  public async configureGitIdentity(name?: string, email?: string): Promise<void> {
    try {
      let userName = name || process.env.GIT_USER_NAME
      let userEmail = email || process.env.GIT_USER_EMAIL

      // If no env vars provided, use the original commit author from latest commit
      if (!userName || !userEmail) {
        try {
          const originalAuthor = await this.getLatestCommitAuthor()
          userName = userName || originalAuthor.name
          userEmail = userEmail || originalAuthor.email
          console.log(`Using original commit author: ${userName} <${userEmail}>`)
        } catch (authorError) {
          // Fallback to defaults if we can't get original author
          userName = userName || 'Submodule Updater'
          userEmail = userEmail || 'submodule-updater@system.local'
          console.log(`Using fallback identity: ${userName} <${userEmail}>`)
        }
      }

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

      // Get the latest commit message from the repository for sync commit
      const syncCommitMessage = await this.getLatestCommitMessage()

      // Create commit message with repository commit message and commit hashes
      const commitMessage = `${syncCommitMessage}

Update submodule ${submodulePath}
- From: ${fromCommit}
- To: ${toCommit}`

      await this.git.commit(commitMessage)

      console.log(`Committed submodule update: ${submodulePath} (${fromCommit} -> ${toCommit})`)
    } catch (error) {
      throw new Error(`Failed to commit submodule update: ${error}`)
    }
  }

  public async pushChanges(branch?: string, forcePush?: boolean): Promise<void> {
    const targetBranch = branch || 'main'

    try {
      console.log(`Attempting to push changes to ${targetBranch}...`)

      if (forcePush) {
        console.warn('⚠️ Force push enabled - this will overwrite remote changes!')
        await this.git.push('origin', targetBranch, ['--force'])
        console.log('Force pushed changes to remote')
        return
      }

      try {
        await this.git.push('origin', targetBranch)
        console.log('Pushed changes to remote')
      } catch (error: any) {
        // Check if this is a "non-fast-forward" error (remote is ahead)
        const errorMessage = error.message || String(error)

        if (errorMessage.includes('non-fast-forward') ||
          errorMessage.includes('fetch first') ||
          errorMessage.includes('rejected')) {

          console.log('Remote branch is ahead, attempting to pull and merge...')

          // Fetch latest changes
          await this.git.fetch(['origin'])

          // Check if we need to merge or can fast-forward
          const isBehind = await this.isBehindRemote(targetBranch)

          if (isBehind) {
            console.log('Local branch is behind remote, using theirs strategy...')

            try {
              // Use "theirs" strategy - always accept remote changes completely
              // This will overwrite local changes with remote changes
              await this.git.pull('origin', targetBranch, ['--strategy=recursive', '--strategy-option=theirs'])
              console.log('Successfully merged remote changes using theirs strategy - remote changes preserved')

              // Attempt push again after merge
              await this.git.push('origin', targetBranch)
              console.log('Pushed changes after resolving with theirs strategy')
            } catch (mergeError: any) {
              // Handle any remaining issues
              await this.handleMergeError(mergeError)
            }
          } else {
            // Check for other potential issues
            await this.handlePushError(error, targetBranch)
          }
        } else {
          // Handle other types of errors
          await this.handlePushError(error, targetBranch)
        }
      }
    } catch (error) {
      throw new Error(`Failed to push changes: ${error}`)
    }
  }

  public async isBehindRemote(branch?: string): Promise<boolean> {
    const targetBranch = branch || 'main'

    try {
      await this.git.fetch(['origin'])

      // Get local and remote commit hashes
      const localCommit = await this.git.revparse([targetBranch])
      const remoteCommit = await this.git.revparse([`origin/${targetBranch}`])

      return localCommit !== remoteCommit
    } catch (error) {
      console.warn('Could not determine if branch is behind remote:', error)
      return false
    }
  }

  private async handleMergeError(error: any): Promise<void> {
    const status = await this.git.status()

    // Since we're using "theirs" strategy, conflicts should be rare
    // but handle any remaining issues
    if (status.conflicted.length > 0) {
      // Try a more aggressive approach - reset to remote and force push
      console.warn('Conflicts still detected with theirs strategy, attempting force reset...')

      const targetBranch = await this.getCurrentBranch()
      await this.git.reset(['--hard', `origin/${targetBranch}`])

      console.log('Reset to remote state successfully')
      return
    }

    if (status.modified.length > 0 || status.staged.length > 0) {
      throw new Error(
        `Working directory has uncommitted changes. Please commit or stash changes first: ` +
        `${[...status.modified, ...status.staged].join(', ')}`
      )
    }

    throw new Error(
      `Failed to push changes and automatic merge failed: ${error.message}`
    )
  }

  private async handlePushError(error: any, branch: string): Promise<void> {
    const errorMessage = error.message || String(error)

    if (errorMessage.includes('permission denied') || errorMessage.includes('access denied')) {
      throw new Error(
        `Permission denied pushing to repository. Please check your credentials and access rights.`
      )
    }

    if (errorMessage.includes('repository not found')) {
      throw new Error(
        `Repository not found. Please check the remote URL and repository name.`
      )
    }

    if (errorMessage.includes('protected branch')) {
      throw new Error(
        `Branch '${branch}' is protected and cannot be pushed to directly. ` +
        `Please use a pull request or contact repository administrators.`
      )
    }

    // Re-throw original error
    throw error
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

  public async getLatestCommitMessage(): Promise<string> {
    try {
      const log = await this.git.log({ maxCount: 1 })

      if (log.latest) {
        return log.latest.message
      }

      return 'Initial commit'
    } catch (error) {
      console.warn('Failed to get latest commit message:', error)
      return 'Update submodules'
    }
  }

  public async getLatestCommitAuthor(): Promise<{ name: string; email: string }> {
    try {
      const log = await this.git.log({ maxCount: 1 })

      if (log.latest) {
        return {
          name: log.latest.author_name || 'Submodule Updater',
          email: log.latest.author_email || 'submodule-updater@system.local'
        }
      }

      return {
        name: 'Submodule Updater',
        email: 'submodule-updater@system.local'
      }
    } catch (error) {
      console.warn('Failed to get latest commit author:', error)
      return {
        name: 'Submodule Updater',
        email: 'submodule-updater@system.local'
      }
    }
  }
}