const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'dist/utils/branchHelper.js',
  'dist/api/routes/products.routes.js',
  'dist/api/routes/categories.routes.js',
  'dist/services/InventoryService.js',
  'dist/api/routes/inventory.routes.js',
  'dist/api/routes/reports.routes.js',
  'dist/api/routes/shifts.routes.js',
  'dist/services/AuditService.js',
  'dist/api/routes/audit.routes.js',
  'dist/api/routes/analytics.routes.js'
];

const patchMap = {};

for (const relPath of filesToPatch) {
  const absolutePath = path.join(__dirname, '../', relPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Compiled file not found: ${absolutePath}`);
    process.exit(1);
  }
  patchMap[relPath] = fs.readFileSync(absolutePath, 'utf8');
}

const patchScriptPath = path.join(__dirname, 'patch-all-branches.ts');

const patchCode = `import fs from 'fs';
import path from 'path';

function main() {
  const rootDir = process.cwd();
  console.log('Starting patch execution in:', rootDir);

  const patchData = ${JSON.stringify(patchMap, null, 2)};

  for (const [relPath, content] of Object.entries(patchData)) {
    const targetFile = path.join(rootDir, relPath);
    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(\`✅ OVERWROTE \${relPath}\`);
  }
  console.log('\\n======================================================');
  console.log('✅ OVERWROTE ALL BRANCH ROUTING & ANALYTICS FILES');
  console.log('======================================================\\n');
}

main();
`;

fs.writeFileSync(patchScriptPath, patchCode, 'utf8');
console.log('Successfully generated patch-all-branches.ts!');
