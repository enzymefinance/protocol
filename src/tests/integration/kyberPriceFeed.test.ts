import { toFixed } from '@melonproject/token-math/price';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import {
  deployKyberEnvironment,
  KyberEnvironment,
} from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { getContract } from '~/utils/solidity/getContract';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deployKyberPriceFeed } from '~/contracts/prices/transactions/deployKyberPriceFeed';
import { isAddress } from '~/utils/checks/isAddress';
import { hasValidPrice } from '~/contracts/prices/calls/hasValidPrice';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { updateKyber } from '~/contracts/prices/transactions/updateKyber';
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
    shared.mockRegistry = await getContract(
      shared.env,
      Contracts.MockRegistry,
      `${shared.mockRegistryAddress}`,
    );
    await shared.mockRegistry.methods
      .setNativeAsset(shared.tokens.weth.address.toString())
      .send({ from: `${shared.env.wallet.address}` });

    for (const token of Object.values(shared.tokens)) {
      await shared.mockRegistry.methods
        .register(`${token['address']}`)
        .send({ from: `${shared.env.wallet.address}` });
    }
  });

  it('Deploy kyber pricefeed', async () => {
    shared.kyberPriceFeed = await deployKyberPriceFeed(shared.env, {
      kyberNetworkProxy: shared.kyberDeploy.kyberNetworkProxy,
      quoteToken: shared.tokens.weth,
      registry: shared.mockRegistryAddress,
    });
    expect(isAddress(shared.kyberPriceFeed));
  });

  // it('Update kyber feed', async () => {
  //   expect();
  // });

  it('Get price', async () => {
    await updateKyber(shared.env, shared.kyberPriceFeed);
    const hasValidMlnPrice = await hasValidPrice(
      shared.env,
      shared.kyberPriceFeed,
      shared.tokens.mln,
    );
    expect(hasValidMlnPrice).toBe(true);

    const mlnPrice = await getPrice(
      shared.env,
      shared.kyberPriceFeed,
      shared.tokens.mln,
    );

    expect(toFixed(mlnPrice)).toBe('1.000000');
  });
});
