const {nab} = require('../utils/deploy-contract');

const main = async input => {
  const oasisDex = await nab('OasisDexExchange', [ input.oasis.conf.closeTime ], input.oasis.addr);
  return { "OasisDexExchange": oasisDex };
}

module.exports = main;
