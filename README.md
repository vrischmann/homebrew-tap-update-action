# Homebrew Tap Update Action

A GitHub Action to automatically update Homebrew formulas for macOS and Linux platforms (AMD64 and ARM64).

## Features

- Downloads checksums from GitHub releases
- Updates Homebrew formula files with new version, URLs, and SHA256 checksums
- Supports macOS (Intel & Apple Silicon) and Linux (AMD64 & ARM64)
- Creates a new branch and pushes changes to the tap repository

## Usage

### Basic Example

```yaml
- name: Update Homebrew formula
  uses: vrischmann/homebrew-tap-update-action@v1
  with:
    tap-repository: 'vrischmann/homebrew-tap'
    formula-file: 'Formula/tasks.rb'
    release-tag: '${{ github.ref_name }}'
    github-repository: '${{ github.repository }}'
    tap-token: '${{ secrets.HOMEBREW_TAP_TOKEN }}'
```

### Complete Workflow Example

```yaml
name: Release and update tap

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  goreleaser:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.25.7'

      - name: Run GoReleaser
        uses: goreleaser/goreleaser-action@v6
        with:
          distribution: goreleaser
          version: '~> v2'
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  update-tap:
    runs-on: ubuntu-latest
    needs: goreleaser
    steps:
      - name: Update Homebrew formula
        uses: vrischmann/homebrew-tap-update-action@v1
        with:
          tap-repository: 'vrischmann/homebrew-tap'
          formula-file: 'Formula/tasks.rb'
          release-tag: '${{ github.ref_name }}'
          github-repository: '${{ github.repository }}'
          tap-token: '${{ secrets.HOMEBREW_TAP_TOKEN }}'
```

## Inputs

| Input | Description | Required |
|-------|-------------|----------|
| `tap-repository` | The homebrew tap repository (e.g., `vrischmann/homebrew-tap`) | Yes |
| `formula-file` | Path to the Homebrew formula file (e.g., `Formula/tasks.rb`) | Yes |
| `release-tag` | The release tag (e.g., `v1.0.0`) | Yes |
| `github-repository` | The GitHub repository containing the release (e.g., `vrischmann/tasks`) | Yes |
| `tap-token` | GitHub token with write access to the tap repository | Yes |

## Outputs

| Output | Description |
|--------|-------------|
| `updated` | Whether the formula was successfully updated (`'true'` or `'false'`) |

## How It Works

1. **Download Checksums**: Downloads the `checksums.txt` file from the GitHub release
2. **Parse Checksums**: Extracts SHA256 checksums for macOS AMD64, macOS ARM64, Linux AMD64, and Linux ARM64
3. **Checkout Tap Repository**: Clones the Homebrew tap repository
4. **Update Formula**: Updates the formula file with:
   - New version number
   - Updated download URLs for all platforms
   - Updated SHA256 checksums for all platforms
5. **Commit & Push**: Creates a new branch and pushes the changes to the tap repository

## Requirements

- The tap repository must be accessible with the provided token
- The `checksums.txt` file must be available in the GitHub release
- The formula file must follow the standard Homebrew formula structure with `on_macos` and `on_linux` blocks

## License

This project is licensed under the MIT License.