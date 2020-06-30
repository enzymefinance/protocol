import { toWei, BN } from 'web3-utils';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getDeployed } from '~/tests/utils/getDeployed';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpInverse } from '~/tests/utils/BNmath';

export const setKyberRate = async (
  token,
  web3,
  etherPerToken = new BN(web3.utils.toWei('1', 'ether')),
  tokenPerEther = BNExpInverse(etherPerToken),
) => {
  const mock = getDeployed(CONTRACT_NAMES.KYBER_MOCK_NETWORK, web3);
  await send(mock, 'setRate', [token, tokenPerEther.toString(), etherPerToken.toString()], {}, web3);
}

export const updateKyberPriceFeed = async (feed, web3, opts = {}) => {
  const registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  const tokens = await call(registry, 'getRegisteredPrimitives');
  const prices = await getKyberPrices(feed, tokens);
  return send(feed, 'update', [tokens, prices], opts, web3);
}

export const getKyberPrices = async (feed, tokens) => {
  const quoteAsset = await call(feed, 'PRICEFEED_QUOTE_ASSET');
  const prices = await Promise.all(tokens.map(async token => {
    if (token.toLowerCase() === quoteAsset.toLowerCase()) {
      return toWei('1', 'ether');
    } else {
      return (await call(feed, 'getLiveRate', [token, quoteAsset])).rate_;
    }
  }));

  return prices;
}