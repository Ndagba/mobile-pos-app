import fs from 'fs';
import path from 'path';

function main() {
  const rootDir = process.cwd();
  const file = path.join(rootDir, 'dist/api/routes/branches.routes.js');

  console.log(`\n======================================================`);
  console.log(`🔍 COMPILED BRANCHES ROUTE FILE: ${file}`);
  console.log(`======================================================`);

  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    // Print around POST /:id/staff
    const index = content.indexOf('/:id/staff');
    if (index !== -1) {
      console.log(content.substring(index - 100, index + 1500));
    } else {
      console.log('Could not find /:id/staff in file content');
    }
  } else {
    console.log('❌ Compiled branches.routes.js does NOT exist!');
  }
  console.log(`======================================================\n`);
}

main();
