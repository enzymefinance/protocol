usePlugin('@nomiclabs/buidler-solhint');

module.exports = {
  solc: {
    version: '0.6.8',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  paths: {
    cache: './cache',
    sources: './contracts',
    artifacts: './artifacts',
  },
};
