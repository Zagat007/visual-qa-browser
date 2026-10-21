const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  console.error(`[ERROR] Node.js 22.19+ is required. Detected ${process.versions.node}.`);
  process.exit(1);
}
console.log(`[PASS] Node.js ${process.versions.node}`);
