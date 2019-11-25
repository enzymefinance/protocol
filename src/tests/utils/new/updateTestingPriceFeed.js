const {send} = require('../../../../new/deploy/deploy-contract');
import { BN } from 'web3-utils';

const updateTestingPriceFeed = async (pricefeedContract, tokenAddresses, prices) => {
  // TODO: do not use fake prices
  if (prices === undefined)
    prices = Object.values(tokenAddresses).map(() => (new BN('10')).pow(new BN('18')).toString());
  await pricefeedContract.methods.update(Object.values(tokenAddresses), prices);
}

module.exports = updateTestingPriceFeed;
