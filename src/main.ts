#!/usr/bin/env node

import { Scheduler } from './scheduler.js'
import { GitHubConfig } from './types.js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function main() {
  console.log('🚀 Starting Submodule Updater')

  // Get configuration from environment
  const githubToken = process.env.GITHUB_TOKEN
  const githubOwner = process.env.GITHUB_OWNER
  const githubRepo = process.env.GITHUB_REPO
  const repoBranch = process.env.REPO_BRANCH || 'main'
  const intervalMinutes = parseInt(process.env.INTERVAL_MINUTES || '15', 10)
  const repoPath = process.env.REPO_PATH
  const runOnce = process.env.RUN_ONCE === 'true'

  if (!githubToken) {
    console.error('❌ GITHUB_TOKEN environment variable is required')
    console.error('Please set GITHUB_TOKEN in your .env file')
    process.exit(1)
  }

  // Validate configuration - always require owner and repo for automatic cloning
  if (!githubOwner || !githubRepo) {
    console.error('❌ GITHUB_OWNER and GITHUB_REPO environment variables are required')
    console.error('These are used for repository identification and cloning')
    process.exit(1)
  }

  const githubConfig: GitHubConfig = {
    token: githubToken,
    owner: githubOwner || '',
    repo: githubRepo || '',
  }

  const scheduler = new Scheduler(githubToken, repoPath)
  await scheduler.setGitHubConfig(githubConfig)

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...')
    scheduler.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
    scheduler.stop()
    process.exit(0)
  })

  if (runOnce) {
    console.log('🔧 Running once mode (RUN_ONCE=true)')
    await scheduler.runUpdate(repoBranch)
    console.log('✅ One-time run completed')
    process.exit(0)
  } else {
    console.log(`⏰ Starting scheduler with ${intervalMinutes}-minute intervals`)
    await scheduler.start(intervalMinutes, repoBranch)

    // Keep the process running
    console.log('📅 Scheduler is running. Press Ctrl+C to stop.')

    // Run initial update after scheduler starts
    console.log('🔄 Running initial update...')
    await scheduler.runUpdate(repoBranch)

    // Add heartbeat
    setInterval(() => {
      console.log(`💓 Heartbeat: ${new Date().toISOString()}`)
    }, 60 * 60 * 1000) // Every hour
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run the application
main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})