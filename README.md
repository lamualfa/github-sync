# Submodule Updater

A TypeScript application that automatically updates git submodules with their latest commits from remote repositories using GitHub personal access tokens. Runs every 15 minutes (configurable) and creates commits with the latest submodule commit hashes.

## Features

- 🔍 Automatically detects all submodules from `.gitmodules`
- 🔄 Fetches latest commits from GitHub repositories
- 📦 Updates submodules to the latest commit
- 📝 Creates descriptive commit messages with commit hashes
- ⏰ Runs on a configurable schedule (default: 15 minutes)
- 🔐 Secure GitHub token authentication
- 📊 Comprehensive logging and error handling

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

## Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration. You have two options:

### Repository Configuration
The application automatically determines whether to use a local repository or clone to a temporary folder:

- **If REPO_PATH is not provided**: Repository will be cloned to a temporary directory and automatically cleaned up
- **If REPO_PATH is provided**: The specified local repository will be used

```bash
# GitHub Personal Access Token
GITHUB_TOKEN=ghp_your_github_token_here

# Repository information (the repo containing submodules)
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo-name

# Optional: Local repository path (omit to use temp folder)
# REPO_PATH=/path/to/your/repository

# Optional settings
INTERVAL_MINUTES=15
REPO_BRANCH=main  # Optional: specify branch to clone
```

## GitHub Token Setup

1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control of private repositories)
   - `public_repo` (if you only have public repositories)
4. Copy the generated token to your `.env` file

## Usage

### Running the scheduler (every 15 minutes)
```bash
pnpm start
```

### Running once (for testing)
```bash
pnpm run run-once
```

### Building the project
```bash
pnpm run build
```

## Submodule Requirements

Your `.gitmodules` file should contain entries like:

```ini
[submodule "path/to/submodule"]
    path = path/to/submodule
    url = https://github.com/username/repo.git
    branch = main
```

The application supports both HTTPS and SSH formats:
- `https://github.com/username/repo.git`
- `git@github.com:username/repo.git`

## How It Works

1. **Detection**: Parses `.gitmodules` to find all configured submodules
2. **Current State**: Gets the current commit hash of each submodule
3. **Remote Check**: Fetches the latest commit from each submodule's remote repository
4. **Update Decision**: Determines if an update is needed
5. **Update**: Updates the submodule to the latest commit
6. **Commit**: Creates a commit with the format:
   ```
   Update submodule path/to/submodule
   
   - From: abc1234
   - To: def5678
   ```
7. **Push**: Pushes changes to the remote repository

## Environment Variables

| Variable           | Required | Description                                  | Default |
| ------------------ | -------- | -------------------------------------------- | ------- |
| `GITHUB_TOKEN`     | ✅        | GitHub personal access token                 | -       |
| `GITHUB_OWNER`     | ✅        | Repository owner/organization                | -       |
| `GITHUB_REPO`      | ✅        | Repository name                              | -       |
| `REPO_PATH`        | ❌        | Local repository path (omit for temp folder) | -       |
| `REPO_BRANCH`      | ❌        | Branch to clone (when using temp folder)     | `main`  |
| `INTERVAL_MINUTES` | ❌        | Update interval in minutes                   | `15`    |
| `RUN_ONCE`         | ❌        | Run once and exit                            | `false` |

## Development

### Running in development mode
```bash
pnpm run dev
```

### Type checking
```bash
pnpm run build
```

### Testing Temp Folder Functionality

You can test the new temp folder cloning feature with the provided test script:

```bash
npx tsx test-temp-clone.ts
```

This will clone a public repository (facebook/react) to a temporary directory and test the cleanup functionality.

## Automatic Temp Folder Benefits

- **No local setup required**: No need to clone the repository beforehand
- **Automatic cleanup**: Temporary directories are automatically removed after processing
- **Fresh state**: Always starts with a clean repository state
- **CI/CD friendly**: Perfect for automated environments
- **No local modifications**: Won't affect your local development environment

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure your GitHub token has the correct scopes
2. **Submodule Not Found**: Check that `.gitmodules` exists and is properly formatted
3. **Network Issues**: Verify internet connection and GitHub availability
4. **Authentication**: Make sure the token is correctly set in `.env`

### Debug Mode

Set `DEBUG=true` to enable verbose logging:
```bash
DEBUG=true pnpm start
```

## License

MIT