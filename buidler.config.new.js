const path = require('path');

module.exports = {
  solc: {
    version: '0.6.8',
  },
  paths: {
    cache: path.join(__dirname, 'new-cache'),
    sources: path.join(__dirname, 'new-contracts'),
    artifacts: path.join(__dirname, 'new-artifacts'),
  },
};
