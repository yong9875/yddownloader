const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building portable version...');

try {
  // 1. Run electron-builder
  execSync('npx electron-builder --win', { stdio: 'inherit' });

  const distDir = path.join(__dirname, 'dist');
  const unpackedDir = path.join(distDir, 'win-unpacked');
  const targetDir = path.join(__dirname, 'ydDownload-Portable-Folder');

  // 2. Remove old portable folder if exists
  if (fs.existsSync(targetDir)) {
    console.log('Removing old portable folder...');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // 3. Move win-unpacked to ydDownload-Portable-Folder
  console.log('Moving green version to ydDownload-Portable-Folder...');
  fs.renameSync(unpackedDir, targetDir);

  // 4. Clean up dist
  console.log('Cleaning up dist...');
  fs.rmSync(distDir, { recursive: true, force: true });

  console.log('✅ Build successful! Portable version is at:', targetDir);
} catch (err) {
  console.error('❌ Build failed:', err.message);
  process.exit(1);
}
