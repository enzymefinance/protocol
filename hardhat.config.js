module.exports = {
  solidity: {
    version: '0.6.8',
  },
  paths: {
    // TODO: Instead of redirecting the artifacts & cache to the package,
    // we should have a script that picks the right packages from the
    // build output. It might be possible to build a babel transform
    // that does this based on the source code (exports) we define in the
    // package.
    artifacts: './packages/protocol/artifacts',
    cache: './packages/protocol/cache',
  },
};
