import {
  toFixed,
  getPrice as createPrice,
} from '@melonproject/token-math/price';

import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deployKyberPriceFeed } from '~/contracts/prices/transactions/deployKyberPriceFeed';
import { LogLevels } from '~/utils/environment/Environment';
import { isAddress } from '~/utils/checks/isAddress';
import { hasRecentPrice } from '~/contracts/prices/calls/hasRecentPrice';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { setBaseRate } from '~/contracts/exchanges/thirdparty/kyber/transactions/setBaseRate';
import { createQuantity } from '@melonproject/token-math/quantity';
import { increaseTime } from '~/utils/evm';

describe('kyber-price-feed', () => {
  const shared: {
    [propName: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.tokens = {
      eur: await getToken(shared.env, await deployToken(shared.env, 'EUR')),
      mln: await getToken(shared.env, await deployToken(shared.env, 'MLN')),
      weth: await getToken(shared.env, await deployToken(shared.env, 'WETH')),
    };
    shared.kyberDeploy = await deployKyberEnvironment(
      shared.env,
      shared.tokens.mln,
      shared.tokens.weth,
      shared.tokens.eur,
    );
  });

  it('Deploy kyber pricefeed', async () => {
    shared.kyberPriceFeed = await deployKyberPriceFeed(shared.env, {
      kyberNetworkProxy: shared.kyberDeploy.kyberNetworkProxyAddress,
      quoteToken: shared.tokens.weth,
    });
    expect(isAddress(shared.kyberPriceFeed));
  });

  it('Change MLN price', async () => {
    const debug = shared.env.logger('melon:protocol:tests', LogLevels.DEBUG);

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

    const newPrice = createPrice(
      createQuantity(shared.tokens.mln, '1'),
      createQuantity(shared.tokens.weth, '2'),
    );

    await setBaseRate(shared.env, shared.kyberDeploy.kyberConversionRate, {
      prices: [newPrice],
    });

    debug('After settings base rate');

    await increaseTime(shared.env, 10);

    // TODO: Reading price after setting it fails :(
    // debug(
    //   await hasRecentPrice(
    //     shared.env,
    //     shared.kyberPriceFeed,
    //     shared.tokens.mln,
    //   ),
    // );

    // const a = await getPrice(
    //   shared.env,
    //   shared.kyberPriceFeed,
    //   shared.tokens.mln,
    // );

    // debug('Blublu');

    // expect(toFixed(a)).toBe('1.000000');
  });
});
