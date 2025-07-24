import * as cron from 'node-cron'
import { SubmoduleUpdater } from './submodule-updater.js'
import { GitHubConfig } from './types.js'

export class Scheduler {
  private updater: SubmoduleUpdater
  private task?: cron.ScheduledTask

  constructor(githubToken?: string, repoPath?: string) {
    this.updater = new SubmoduleUpdater(githubToken, repoPath)
  }

  public async start(intervalMinutes: number = 15, repoBranch?: string): Promise<void> {
    console.log(`Starting scheduler with ${intervalMinutes}-minute intervals...`)

    // Schedule recurring updates - DO NOT run immediately
    const cronExpression = `*/${intervalMinutes} * * * *`

    this.task = cron.schedule(cronExpression, async () => {
      console.log(`Running scheduled update at ${new Date().toISOString()}`)
      await this.runUpdate(repoBranch)
    })

    console.log(`Scheduler started. Will run every ${intervalMinutes} minutes.`)
  }

  public stop(): void {
    if (this.task) {
      this.task.stop()
      console.log('Scheduler stopped')
    }
  }

  public async runUpdate(repoBranch?: string): Promise<void> {
    try {
      console.log('Starting submodule update...')
      const results = await this.updater.updateSubmodules(repoBranch)

      if (results.length > 0) {
        console.log('Update results:')
        results.forEach(result => {
          if (result.updated) {
            console.log(`✅ Updated ${result.submodule}: ${result.fromCommit.slice(0, 7)} -> ${result.toCommit.slice(0, 7)}`)
          } else {
            console.log(`❌ Failed to update ${result.submodule}: ${result.error}`)
          }
        })
      } else {
        console.log('No submodules needed updates')
      }
    } catch (error) {
      console.error('Error during scheduled update:', error)
    }
  }

  public async setGitHubConfig(config: GitHubConfig): Promise<void> {
    await this.updater.setGitHubConfig(config)
  }
}