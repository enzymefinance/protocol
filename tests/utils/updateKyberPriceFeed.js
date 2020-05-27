import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getDeployed } from '~/tests/utils/getDeployed';
import { call, send } from '~/deploy/utils/deploy-contract';

export const updateKyberPriceFeed = async (feed, web3) => {
  const quoteAsset = await call(feed, 'QUOTE_ASSET');
  const registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  const tokens = await call(registry, 'getRegisteredAssets');
  const prices = []; // TODO: convert to promise.all
  for (const token of tokens) {
    let tokenPrice;
    if (token.toLowerCase() === quoteAsset.toLowerCase())
      tokenPrice = web3.utils.toWei('1', 'ether');
    else
      tokenPrice = (await call(feed, 'getKyberPrice', [token, quoteAsset])).kyberPrice_;
    prices.push(tokenPrice);
  }
  await send(feed, 'update', [tokens, prices], {}, web3);
}
