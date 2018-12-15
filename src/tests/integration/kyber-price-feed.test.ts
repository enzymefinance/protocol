import { toFixed } from '@melonproject/token-math/price';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import {
  deployKyberEnvironment,
  KyberEnvironment,
} from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deployKyberPriceFeed } from '~/contracts/prices/transactions/deployKyberPriceFeed';
import { isAddress } from '~/utils/checks/isAddress';
import { hasRecentPrice } from '~/contracts/prices/calls/hasRecentPrice';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';
import { deployContract } from '~/utils/solidity/deployContract';

describe('kyber-price-feed', () => {
  const shared: {
    env?: Environment;
    kyberDeploy?: KyberEnvironment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.tokens = {
      eur: await getToken(shared.env, await deployToken(shared.env, 'EUR')),
      mln: await getToken(shared.env, await deployToken(shared.env, 'MLN')),
      weth: await getToken(shared.env, await deployToken(shared.env, 'WETH')),
    };
    shared.kyberDeploy = await deployKyberEnvironment(shared.env, [
      shared.tokens.mln,
      shared.tokens.eur,
    ]);
    shared.mockRegistryAddress = await deployContract(
      shared.env,
      Contracts.MockRegistry,
    );
  });

  it('Deploy kyber pricefeed', async () => {
    shared.kyberPriceFeed = await deployKyberPriceFeed(shared.env, {
      kyberNetworkProxy: shared.kyberDeploy.kyberNetworkProxy,
      quoteToken: shared.tokens.weth,
      registry: shared.mockRegistryAddress,
    });
    expect(isAddress(shared.kyberPriceFeed));
  });

  it('Get price', async () => {
    const hasRecentMlnPrice = await hasRecentPrice(
      shared.env,
      shared.kyberPriceFeed,
      shared.tokens.mln,
    );
    expect(hasRecentMlnPrice).toBe(true);

    const mlnPrice = await getPrice(
      shared.env,
      shared.kyberPriceFeed,
      shared.tokens.mln,
    );
    expect(toFixed(mlnPrice)).toBe('1.000000');
  });
});
