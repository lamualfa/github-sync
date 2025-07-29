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
      console.log(`Updating submodule ${submodulePath} to ${targetCommit}...`)

      // Ensure submodule is initialized and updated
      await this.git.submoduleUpdate(['--init', '--recursive', submodulePath])

      // Change to submodule directory and checkout the specific commit
      const absolutePath = join(this.repoPath, submodulePath)
      const submoduleGit = simpleGit(absolutePath)

      // Fetch the latest changes for the submodule
      await submoduleGit.fetch(['--all', '--prune'])

      // Checkout the target commit
      await submoduleGit.checkout(targetCommit)

      console.log(`✅ Updated submodule ${submodulePath} to commit ${targetCommit}`)
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

  public async syncSubmodules(): Promise<void> {
    try {
      console.log('Syncing all submodules...')
      await this.git.submoduleUpdate(['--init', '--recursive'])
      console.log('✅ All submodules synced successfully')
    } catch (error) {
      throw new Error(`Failed to sync submodules: ${error}`)
    }
  }

  public async initializeSubmodules(): Promise<void> {
    try {
      console.log('Initializing submodules...')
      await this.git.submoduleInit()
      await this.git.submoduleUpdate(['--init', '--recursive'])
      console.log('✅ Submodules initialized and updated')
    } catch (error) {
      throw new Error(`Failed to initialize submodules: ${error}`)
    }
  }

  public async getSubmoduleCurrentCommit(submodulePath: string): Promise<string> {
    try {
      // Get the submodule commit as recorded in the parent repository
      const result = await this.git.raw(['ls-tree', 'HEAD', submodulePath])
      const match = result.match(/\b([0-9a-f]{40})\b/)

      if (match) {
        return match[1]
      }

      throw new Error(`Could not determine current commit for submodule ${submodulePath}`)
    } catch (error) {
      throw new Error(`Failed to get submodule current commit: ${error}`)
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

          console.log('🔄 Remote branch is ahead, pulling and merging changes...')

          // Fetch latest changes first
          await this.git.fetch(['origin'])

          // Pull and merge remote changes
          await this.pullAndMerge(targetBranch)

          // Now push the merged changes
          await this.git.push('origin', targetBranch)
          console.log('✅ Pushed changes after merging remote updates')
        } else {
          // Handle other types of errors
          await this.handlePushError(error, targetBranch)
        }
      }
    } catch (error) {
      throw new Error(`Failed to push changes: ${error}`)
    }
  }



  public async syncRemoteChanges(branch?: string): Promise<void> {
    const targetBranch = branch || 'main'

    try {
      console.log(`🔍 Syncing remote changes for ${targetBranch}...`)

      // Fetch latest changes
      await this.git.fetch(['origin'])

      // Check if local is behind
      const isBehind = await this.isBehindRemote(targetBranch)

      if (isBehind) {
        console.log('📥 Local branch is behind remote, pulling changes...')

        // Use a strategy that handles submodule conflicts by resetting
        try {
          await this.git.pull('origin', targetBranch, ['--no-rebase'])
          console.log('✅ Successfully pulled and merged remote changes')
        } catch (error: any) {
          const errorMessage = error.message || String(error)

          if (errorMessage.includes('submodule')) {
            console.log('🔧 Submodule conflict detected, handling with reset...')
            // Reset to remote state to resolve submodule conflicts
            await this.git.reset(['--hard', `origin/${targetBranch}`])
            console.log('✅ Reset to remote state to resolve submodule conflicts')
          } else {
            throw error
          }
        }
      } else {
        console.log('✅ Branch is up to date with remote')
      }

    } catch (error) {
      throw new Error(`Failed to sync remote changes: ${error}`)
    }
  }

  public async resolveSubmoduleConflicts(): Promise<void> {
    try {
      console.log('🔧 Resolving submodule merge conflicts...')

      // Get the current status to identify conflicts
      const status = await this.git.status()

      // For each submodule conflict, accept the remote version
      for (const conflict of status.conflicted) {
        if (conflict.includes('NostalgiaForInfinity')) {
          console.log(`🔧 Resolving conflict for ${conflict}...`)

          // Reset the submodule to the merged state
          await this.git.raw(['reset', 'HEAD', conflict])
          await this.git.raw(['checkout', '--theirs', conflict])

          // Update the submodule to the latest commit
          await this.git.add(conflict)
        }
      }

      console.log('✅ Submodule conflicts resolved')

    } catch (error) {
      throw new Error(`Failed to resolve submodule conflicts: ${error}`)
    }
  }

  public async pullAndMerge(branch?: string): Promise<void> {
    const targetBranch = branch || 'main'

    try {
      console.log(`🔄 Pulling and merging remote changes for ${targetBranch}...`)

      // Ensure we're on the correct branch
      const currentBranch = await this.getCurrentBranch()
      if (currentBranch !== targetBranch) {
        await this.git.checkout(targetBranch)
      }

      try {
        // Try standard merge
        await this.git.pull('origin', targetBranch, ['--no-rebase'])
        console.log('✅ Successfully pulled and merged remote changes')
      } catch (error: any) {
        const errorMessage = error.message || String(error)

        if (errorMessage.includes('submodule')) {
          console.log('🔧 Submodule conflict detected, handling automatically...')

          // Use a different strategy for submodule conflicts
          // Reset to remote state and then re-apply our updates
          await this.git.reset(['--hard', `origin/${targetBranch}`])
          console.log('✅ Reset to remote state to resolve submodule conflicts')
        } else {
          throw error
        }
      }

    } catch (error) {
      throw new Error(`Failed to pull and merge changes: ${error}`)
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