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

    let cronExpression: string

    if (intervalMinutes < 60) {
      // For intervals less than 60 minutes, use minute-based scheduling
      cronExpression = `*/${intervalMinutes} * * * *`
    } else {
      // For intervals of 60 minutes or more, calculate hours and remaining minutes
      const hours = Math.floor(intervalMinutes / 60)
      const minutes = intervalMinutes % 60

      if (minutes === 0) {
        // If it's exactly X hours, run at minute 0 every X hours
        cronExpression = `0 */${hours} * * *`
      } else {
        // If it's X hours and Y minutes, we need a more complex approach
        // For simplicity, we'll use the minute-based approach with a modulo check
        cronExpression = `* * * * *`
        console.warn(`Warning: Intervals with both hours and minutes (${intervalMinutes} minutes) will run every minute but check the interval in code.`)
      }
    }

    this.task = cron.schedule(cronExpression, async () => {
      // For complex intervals (hours + minutes), we need to check if enough time has passed
      if (intervalMinutes >= 60 && intervalMinutes % 60 !== 0) {
        const now = new Date()
        const hours = Math.floor(intervalMinutes / 60)
        const minutes = intervalMinutes % 60
        const totalMinutes = now.getHours() * 60 + now.getMinutes()

        if (totalMinutes % intervalMinutes !== 0) {
          return // Skip this execution
        }
      }

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