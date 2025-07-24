import { execSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface RepositoryConfig {
  owner: string
  repo: string
  branch?: string
  githubToken?: string
}

export class RepositoryService {
  private tempDir: string | null = null

  /**
   * Clone repository to a temporary directory
   */
  public async cloneRepository(config: RepositoryConfig): Promise<string> {
    return this.cloneRepositoryToPath(config, undefined)
  }

  /**
   * Clone repository to a specific path
   */
  public async cloneRepositoryToPath(config: RepositoryConfig, targetPath?: string): Promise<string> {
    const { owner, repo, branch = 'main', githubToken } = config

    let actualPath: string

    if (targetPath) {
      actualPath = targetPath
      console.log(`📁 Cloning repository to specified path: ${actualPath}`)
    } else {
      // Use temp directory
      actualPath = mkdtempSync(join(tmpdir(), `submodule-updater-${repo}-`))
      this.tempDir = actualPath
      console.log(`📁 Cloning repository to temporary directory: ${actualPath}`)
    }

    // Construct clone URL
    const protocol = githubToken ? 'https' : 'git'
    const auth = githubToken ? `${githubToken}@` : ''
    const cloneUrl = `${protocol}://${auth}github.com/${owner}/${repo}.git`

    try {
      // Clone the repository with submodules
      const cloneCommand = `git clone --branch ${branch} --recurse-submodules --depth 1 ${cloneUrl} ${actualPath}`
      execSync(cloneCommand, { stdio: 'inherit' })

      console.log(`✅ Repository cloned successfully to: ${actualPath}`)
      console.log(`✅ Submodules initialized and updated successfully`)

      if (!targetPath) {
        this.tempDir = actualPath // Only store if using temp
      }

      return actualPath
    } catch (error) {
      console.error(`❌ Failed to clone repository:`, error)
      if (!targetPath) {
        this.cleanup()
      }
      throw error
    }
  }

  /**
   * Get the current temporary directory
   */
  public getCurrentDirectory(): string | null {
    return this.tempDir
  }

  /**
   * Clean up the temporary directory
   */
  public cleanup(): void {
    if (this.tempDir) {
      try {
        console.log(`🧹 Cleaning up temporary directory: ${this.tempDir}`)
        rmSync(this.tempDir, { recursive: true, force: true })
        this.tempDir = null
        console.log(`✅ Temporary directory cleaned up`)
      } catch (error) {
        console.warn(`⚠️ Failed to clean up temporary directory: ${error}`)
      }
    }
  }

  /**
   * Check if the repository was cloned successfully
   */
  public isRepositoryCloned(): boolean {
    return this.tempDir !== null
  }
}