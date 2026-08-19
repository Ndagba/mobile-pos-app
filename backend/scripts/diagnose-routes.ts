import fs from 'fs';
import path from 'path';

function main() {
  const rootDir = process.cwd();
  const compiledSettingsRoute = path.join(rootDir, 'dist/api/routes/settings.routes.js');

  console.log(`\n======================================================`);
  console.log(`🔍 COMPILED SETTINGS ROUTE FILE PATH: ${compiledSettingsRoute}`);
  console.log(`======================================================`);

  if (fs.existsSync(compiledSettingsRoute)) {
    const content = fs.readFileSync(compiledSettingsRoute, 'utf8');
    console.log(content);
  } else {
    console.log('❌ Compiled settings.routes.js does NOT exist!');
  }
  console.log(`======================================================\n`);
}

main();
