import { readFile } from 'fs/promises'
import { join } from 'path'
import { SubmoduleInfo } from './types.js'

export class SubmoduleParser {
  public async parseGitmodules(repoPath: string = '.'): Promise<SubmoduleInfo[]> {
    const gitmodulesPath = join(repoPath, '.gitmodules')

    try {
      const content = await readFile(gitmodulesPath, 'utf-8')
      return this.parseGitmodulesContent(content)
    } catch (error) {
      throw new Error(`Failed to read .gitmodules: ${error}`)
    }
  }

  private parseGitmodulesContent(content: string): SubmoduleInfo[] {
    const submodules: SubmoduleInfo[] = []
    const lines = content.split('\n')

    let currentSubmodule: Partial<SubmoduleInfo> = {}
    let inSubmodule = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('[submodule')) {
        if (inSubmodule && currentSubmodule.path && currentSubmodule.url) {
          submodules.push(currentSubmodule as SubmoduleInfo)
        }

        currentSubmodule = {
          currentCommit: '',
          latestCommit: '',
          needsUpdate: false,
        }
        inSubmodule = true
      } else if (inSubmodule) {
        const pathMatch = trimmed.match(/^path\s*=\s*(.+)$/)
        const urlMatch = trimmed.match(/^url\s*=\s*(.+)$/)
        const branchMatch = trimmed.match(/^branch\s*=\s*(.+)$/)

        if (pathMatch) {
          currentSubmodule.path = pathMatch[1]
        } else if (urlMatch) {
          currentSubmodule.url = urlMatch[1]
        } else if (branchMatch) {
          currentSubmodule.branch = branchMatch[1]
        }
      }
    }

    if (inSubmodule && currentSubmodule.path && currentSubmodule.url) {
      submodules.push(currentSubmodule as SubmoduleInfo)
    }

    return submodules
  }

  public extractGitHubInfo(url: string): { owner: string; repo: string } | null {
    // Handle both HTTPS and SSH formats
    const httpsMatch = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/)
    const sshMatch = url.match(/git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/)

    const match = httpsMatch || sshMatch
    if (!match) return null

    return {
      owner: match[1],
      repo: match[2],
    }
  }
}