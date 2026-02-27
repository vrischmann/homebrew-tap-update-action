import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface PlatformChecksums {
  macos_amd64: string;
  macos_arm64: string;
  linux_amd64: string;
  linux_arm64: string;
}

async function run(): Promise<void> {
  try {
    // Get action inputs
    const tapRepository = core.getInput('tap-repository', { required: true });
    const formulaFile = core.getInput('formula-file', { required: true });
    const releaseTag = core.getInput('release-tag', { required: true });
    const githubRepository = core.getInput('github-repository', { required: true });
    const tapToken = core.getInput('tap-token', { required: true });

    // Extract version from tag (remove 'v' prefix)
    const version = releaseTag.startsWith('v') ? releaseTag.substring(1) : releaseTag;
    core.info(`Updating formula to version ${version} (${releaseTag})`);

    // Download checksums.txt from the release
    const checksumsUrl = `https://github.com/${githubRepository}/releases/download/${releaseTag}/checksums.txt`;
    core.info(`Downloading checksums from ${checksumsUrl}`);
    
    const response = await axios.get(checksumsUrl);
    const checksumsContent = response.data;
    
    // Parse checksums
    const checksums = parseChecksums(checksumsContent);
    core.info(`macOS AMD64: ${checksums.macos_amd64}`);
    core.info(`macOS ARM64: ${checksums.macos_arm64}`);
    core.info(`Linux AMD64: ${checksums.linux_amd64}`);
    core.info(`Linux ARM64: ${checksums.linux_arm64}`);

    // Check out the tap repository
    core.info(`Checking out tap repository: ${tapRepository}`);
    const tapRepoUrl = `https://x-access-token:${tapToken}@github.com/${tapRepository}.git`;
    
    // Create a temporary directory for the tap repository
    const tempDir = fs.mkdtempSync('tap-repo-');
    core.info(`Using temporary directory: ${tempDir}`);
    
    try {
      execSync(`git clone ${tapRepoUrl} ${tempDir}`, { stdio: 'inherit' });
      
      const fullFormulaPath = path.join(tempDir, formulaFile);
      
      if (!fs.existsSync(fullFormulaPath)) {
        throw new Error(`Formula file not found: ${fullFormulaPath}`);
      }
      
      // Read the current formula
      let formulaContent = fs.readFileSync(fullFormulaPath, 'utf8');
      
      // Update the formula
      formulaContent = updateFormula(
        formulaContent,
        version,
        releaseTag,
        githubRepository,
        checksums
      );
      
      // Write the updated formula
      fs.writeFileSync(fullFormulaPath, formulaContent);
      core.info('Formula updated successfully');
      
      // Commit and push changes
      const branchName = `update/${path.basename(formulaFile, '.rb')}`;
      
      execSync('git config user.name "GitHub Actions"', { cwd: tempDir });
      execSync('git config user.email "actions@github.com"', { cwd: tempDir });
      execSync('git checkout -b ' + branchName, { cwd: tempDir });
      execSync('git add ' + formulaFile, { cwd: tempDir });
      execSync(`git commit -m "Update ${path.basename(formulaFile, '.rb')} to version ${releaseTag}"`, { cwd: tempDir });
      execSync(`git push origin ${branchName}`, { cwd: tempDir });
      
      core.setOutput('updated', 'true');
      
    } finally {
      // Clean up temporary directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

function parseChecksums(checksumsContent: string): PlatformChecksums {
  const lines = checksumsContent.split('\n');
  
  const result: Partial<PlatformChecksums> = {};
  
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    const [sha, filename] = line.split('  ');
    if (!sha || !filename) continue;
    
    if (filename.includes('darwin_amd64')) {
      result.macos_amd64 = sha;
    } else if (filename.includes('darwin_arm64')) {
      result.macos_arm64 = sha;
    } else if (filename.includes('linux_amd64')) {
      result.linux_amd64 = sha;
    } else if (filename.includes('linux_arm64')) {
      result.linux_arm64 = sha;
    }
  }
  
  if (!result.macos_amd64 || !result.macos_arm64 || !result.linux_amd64 || !result.linux_arm64) {
    throw new Error('Could not parse all required checksums from checksums.txt');
  }
  
  return result as PlatformChecksums;
}

function updateFormula(
  content: string,
  version: string,
  releaseTag: string,
  githubRepository: string,
  checksums: PlatformChecksums
): string {
  // Update version
  content = content.replace(/version "[0-9.]*"/g, `version "${version}"`);
  
  // Update macOS AMD64
  content = updatePlatformBlock(
    content,
    'on_macos do',
    'if Hardware::CPU.intel?',
    releaseTag,
    githubRepository,
    version,
    'darwin_amd64',
    checksums.macos_amd64
  );
  
  // Update macOS ARM64
  content = updatePlatformBlock(
    content,
    'on_macos do',
    'else',
    releaseTag,
    githubRepository,
    version,
    'darwin_arm64',
    checksums.macos_arm64
  );
  
  // Update Linux AMD64
  content = updatePlatformBlock(
    content,
    'on_linux do',
    'if Hardware::CPU.intel?',
    releaseTag,
    githubRepository,
    version,
    'linux_amd64',
    checksums.linux_amd64
  );
  
  // Update Linux ARM64
  content = updatePlatformBlock(
    content,
    'on_linux do',
    'elsif Hardware::CPU.arm?',
    releaseTag,
    githubRepository,
    version,
    'linux_arm64',
    checksums.linux_arm64
  );
  
  return content;
}

function updatePlatformBlock(
  content: string,
  blockStart: string,
  condition: string,
  releaseTag: string,
  githubRepository: string,
  version: string,
  platform: string,
  sha256: string
): string {
  const binaryName = path.basename(githubRepository);
  const url = `https://github.com/${githubRepository}/releases/download/${releaseTag}/${binaryName}_${version}_${platform}.tar.gz`;
  
  // Find the block and update URL and SHA256
  const blockStartIndex = content.indexOf(blockStart);
  if (blockStartIndex === -1) {
    throw new Error(`Could not find block starting with: ${blockStart}`);
  }
  
  const conditionStartIndex = content.indexOf(condition, blockStartIndex);
  if (conditionStartIndex === -1) {
    throw new Error(`Could not find condition: ${condition} in block starting with: ${blockStart}`);
  }
  
  // Find the next block or end
  const nextBlockIndex = content.indexOf('on_', conditionStartIndex + 1);
  const endIndex = content.indexOf('end', conditionStartIndex + 1);
  const blockEndIndex = nextBlockIndex === -1 
    ? endIndex 
    : Math.min(nextBlockIndex, endIndex === -1 ? Infinity : endIndex);
  
  if (blockEndIndex === -1) {
    throw new Error('Could not find end of block');
  }
  
  const blockContent = content.substring(conditionStartIndex, blockEndIndex);
  
  // Update URL and SHA256 in this block
  let updatedBlock = blockContent
    .replace(/url ".*?"/, `url "${url}"`)
    .replace(/sha256 ".*?"/, `sha256 "${sha256}"`);
  
  return content.substring(0, conditionStartIndex) + updatedBlock + content.substring(blockEndIndex);
}

run();