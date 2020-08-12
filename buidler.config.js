const path = require('path');

module.exports = {
  solc: {
    version: '0.6.8',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  paths: {
    cache: path.join(__dirname, 'cache'),
    sources: path.join(__dirname, 'contracts'),
    artifacts: path.join(__dirname, 'artifacts'),
  },
};
