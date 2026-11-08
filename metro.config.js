const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;
config.resolver.blockList = [new RegExp(`^${path.resolve(__dirname, 'core').replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`)];
module.exports = config;
