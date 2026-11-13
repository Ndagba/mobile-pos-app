// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');

/**
 * Metro config so the standalone mobile app can consume `@jaypos/shared`
 * (published as SOURCE TypeScript: `main: src/index.ts`, no build step) WITHOUT
 * turning mobile into an npm workspace member. Hoisting mobile's deps to the repo
 * root would risk duplicate react / react-native copies and break the RN bundler,
 * so instead we map the bare specifier directly and keep mobile's own
 * node_modules as the single resolution root.
 *
 * - watchFolders: add ../shared so Metro watches and transpiles its TS sources.
 * - extraNodeModules['@jaypos/shared'] -> the shared package dir; with
 *   unstable_enablePackageExports Metro honors its package.json "exports"/"main".
 * - nodeModulesPaths pinned to mobile/node_modules so shared's own imports
 *   (crypto-js, already a mobile dependency) and react/react-native all resolve
 *   from here — no root-level hoisting involved.
 */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@jaypos/shared': sharedRoot,
};
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
