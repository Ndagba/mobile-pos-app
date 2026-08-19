const fs = require('fs');
const path = require('path');

const compiledPath = path.join(__dirname, '../dist/api/routes/branches.routes.js');
const patchScriptPath = path.join(__dirname, 'patch-branches-route.ts');

const compiledCode = fs.readFileSync(compiledPath, 'utf8');

const patchCode = `import fs from 'fs';
import path from 'path';

function main() {
  const rootDir = process.cwd();
  const targetFile = path.join(rootDir, 'dist/api/routes/branches.routes.js');

  const updatedCode = ${JSON.stringify(compiledCode)};

  fs.writeFileSync(targetFile, updatedCode, 'utf8');
  console.log('\\n======================================================');
  console.log('✅ OVERWROTE branches.routes.js WITH UPDATED ROUTE CODE');
  console.log('======================================================\\n');
}

main();
`;

fs.writeFileSync(patchScriptPath, patchCode, 'utf8');
console.log('Successfully generated patch-branches-route.ts!');
