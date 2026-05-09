/** @type {import('.')} */
let binding;

const load = path => {
  try {
    return require(path);
  } catch {
    return null;
  }
};

try {
  binding = require('./server-native.node');
} catch {
  binding =
    process.arch === 'arm64'
      ? load('./server-native.arm64.node')
      : process.arch === 'arm'
        ? load('./server-native.armv7.node')
        : load('./server-native.x64.node');
  if (!binding) {
    throw new Error(`Failed to load server-native binding for ${process.arch}`);
  }
}

module.exports = binding;
