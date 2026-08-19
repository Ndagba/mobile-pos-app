import fs from 'fs';
import path from 'path';

function main() {
  const rootDir = process.cwd();
  const sourceSettingsRoute = path.join(rootDir, 'src/api/routes/settings.routes.ts');

  console.log(`\n======================================================`);
  console.log(`🔍 SOURCE SETTINGS ROUTE FILE PATH: ${sourceSettingsRoute}`);
  console.log(`======================================================`);

  if (fs.existsSync(sourceSettingsRoute)) {
    const content = fs.readFileSync(sourceSettingsRoute, 'utf8');
    console.log(content);
  } else {
    console.log('❌ Source settings.routes.ts does NOT exist!');
  }
  console.log(`======================================================\n`);
}

main();
