import { BN, toWei } from 'web3-utils';

import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deployKyberEnvironment } from '~/contracts/exchanges/transactions/deployKyberEnvironment';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { isAddress } from '~/utils/checks/isAddress';
import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { BNExpDiv, BNExpInverse } from '../utils/new/BNmath';

describe('kyber-price-feed', () => {
  let environment, user, defaultTxOpts;
  let eurTokenInfo, mlnTokenInfo, wethTokenInfo;
  let conversionRates, kyberDeployAddresses, kyberPriceFeed, mockRegistry;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    eurTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'EUR'),
    );
    mlnTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'MLN'),
    );
    wethTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'WETH'),
    );

    kyberDeployAddresses = await deployKyberEnvironment(environment, [
      mlnTokenInfo,
      eurTokenInfo,
    ]);

    conversionRates = getContract(
      environment,
      Contracts.ConversionRates,
      kyberDeployAddresses.conversionRates,
    );

    const mockRegistryAddress = await deployContract(
      environment,
      Contracts.MockRegistry,
    );
    mockRegistry = await getContract(
      environment,
      Contracts.MockRegistry,
      mockRegistryAddress.toString(),
    );
    await mockRegistry.methods
      .setNativeAsset(wethTokenInfo.address.toString())
      .send(defaultTxOpts);

    for (const token of [eurTokenInfo, mlnTokenInfo, wethTokenInfo]) {
      await mockRegistry.methods
        .register(token.address.toString())
        .send(defaultTxOpts);
    }
  });

  it('Deploy kyber pricefeed', async () => {
    const kyberPriceFeedAddress = await deployContract(
      environment,
      Contracts.KyberPriceFeed,
      [
        mockRegistry.options.address,
        kyberDeployAddresses.kyberNetworkProxy,
        toWei('0.5', 'ether'),
        wethTokenInfo.address.toString(),
      ],
    );
    kyberPriceFeed = getContract(
      environment,
      Contracts.KyberPriceFeed,
      kyberPriceFeedAddress,
    );

    expect(isAddress(kyberPriceFeedAddress)).toBe(true);
  });

  it('Get price', async () => {
    await kyberPriceFeed.methods.update().send(defaultTxOpts);

    const hasValidMlnPrice = await kyberPriceFeed.methods
      .hasValidPrice(mlnTokenInfo.address)
      .call();

    expect(hasValidMlnPrice).toBe(true);

    const { 0: mlnPrice } = await kyberPriceFeed.methods
      .getPrice(mlnTokenInfo.address)
      .call();

    expect(mlnPrice).toEqual(toWei('1', 'ether'));
  });

  it('Update mln price in reserve', async () => {
    const mlnPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether')),
    ).toString();
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice)).toString()

    const eurPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.008', 'ether')),
    ).toString();
    const ethPriceInEur = BNExpInverse(new BN(eurPrice)).toString()

    const blockNumber = (await environment.eth.getBlock('latest')).number;
    await conversionRates.methods
      .setBaseRate(
        [mlnTokenInfo.address, eurTokenInfo.address],
        [ethPriceInMln, ethPriceInEur],
        [mlnPrice, eurPrice],
        ['0x0'],
        ['0x0'],
        blockNumber,
        [0],
      )
      .send(defaultTxOpts);

    await kyberPriceFeed.methods.update().send(defaultTxOpts);

    const { 0: updatedMlnPrice } = await kyberPriceFeed.methods
      .getPrice(mlnTokenInfo.address)
      .call();

    const { 0: updatedEurPrice } = await kyberPriceFeed.methods
      .getPrice(eurTokenInfo.address)
      .call();

    expect(updatedMlnPrice).toEqual(mlnPrice);
    expect(updatedEurPrice).toEqual(eurPrice);
  });
});
