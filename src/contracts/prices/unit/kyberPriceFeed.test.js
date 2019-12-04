import { BN, toWei, isAddress } from 'web3-utils';

import { deploy } from '~/../deploy/utils/deploy-contract';
import { partialRedeploy } from '~/../deploy/scripts/deploy-system';
import web3 from '~/../deploy/utils/get-web3';

import { BNExpDiv, BNExpInverse } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';

describe('kyber-price-feed', () => {
  let user, defaultTxOpts;
  let conversionRates, kyberPriceFeed, kyberNetworkProxy, mockRegistry;
  let eur, mln, weth;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;

    eur = contracts.EUR;
    mln = contracts.MLN;
    weth = contracts.WETH;
    conversionRates = contracts.ConversionRates;
    kyberNetworkProxy = contracts.KyberNetworkProxy;

    mockRegistry = await deploy(CONTRACT_NAMES.MOCK_REGISTRY);

    kyberPriceFeed = await deploy(
      CONTRACT_NAMES.KYBER_PRICEFEED,
      [
        mockRegistry.options.address,
        kyberNetworkProxy.options.address,
        toWei('0.5', 'ether'),
        weth.options.address
      ]
    );
    await mockRegistry.methods
      .setNativeAsset(weth.options.address)
      .send(defaultTxOpts);

    for (const addr of [eur.options.address, mln.options.address, weth.options.address]) {
      await mockRegistry.methods
        .register(addr)
        .send(defaultTxOpts);
    }
    await kyberPriceFeed.methods.update().send(defaultTxOpts);
  });

  it('Get price', async () => {
    const hasValidMlnPrice = await kyberPriceFeed.methods
      .hasValidPrice(mln.options.address)
      .call();

    expect(hasValidMlnPrice).toBe(true);

    const { 0: mlnPrice } = await kyberPriceFeed.methods
      .getPrice(mln.options.address)
      .call();

    expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });

  it('Update mln price in reserve', async () => {
    const mlnPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice))

    const eurPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.008', 'ether')),
    );
    const ethPriceInEur = BNExpInverse(new BN(eurPrice))

    const blockNumber = (await web3.eth.getBlock('latest')).number;
    await conversionRates.methods
      .setBaseRate(
        [mln.options.address, eur.options.address],
        [ethPriceInMln.toString(), ethPriceInEur.toString()],
        [mlnPrice.toString(), eurPrice.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ).send(defaultTxOpts);

    await kyberPriceFeed.methods.update().send(defaultTxOpts);

    const { 0: updatedMlnPrice } = await kyberPriceFeed.methods
      .getPrice(mln.options.address).call();

    const { 0: updatedEurPrice } = await kyberPriceFeed.methods
      .getPrice(eur.options.address).call();

    expect(updatedMlnPrice.toString()).toBe(mlnPrice.toString());
    expect(updatedEurPrice.toString()).toBe(eurPrice.toString());
  });
});
