/*
 * @file Tests simple cases of updating price against a Kyber deployment
 *
 * @test Some unrelated account cannot update feed
 * @test Registy owner an update feed
 * @test Delegated updater can update the feed
 * @test MLN price update on reserve changes price on feed post-update
 * @test Normal spread condition from Kyber rates yields midpoint price
 * @test Crossed market condition from Kyber rates yields midpoint price
 * TODO: add helper function for updating asset prices on kyber itself
 * TODO: test boundaries of max spread
 * TODO: test boundaries of max price deviation
 */

import { BN, toWei } from 'web3-utils';

import { BNExpDiv, BNExpInverse } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getEventFromLogs } from '~/tests/utils/metadata';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { deploy, send, call } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

let deployer, updater, someAccount;
let deployerTxOpts, updaterTxOpts, someAccountTxOpts;
let conversionRates, kyberPriceFeed, kyberNetworkProxy, registry;
let eur, mln, weth, registeredAssets;

beforeAll(async () => {
  const accounts = await web3.eth.getAccounts();
  [deployer, updater, someAccount] = accounts;
  deployerTxOpts = { from: deployer, gas: 8000000 };
  updaterTxOpts = { from: updater, gas: 8000000 };
  someAccountTxOpts = { from: someAccount, gas: 8000000 };
  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  eur = contracts.EUR;
  mln = contracts.MLN;
  weth = contracts.WETH;
  conversionRates = contracts.ConversionRates;
  kyberNetworkProxy = contracts.KyberNetworkProxy;

  registry = await deploy(CONTRACT_NAMES.REGISTRY, [deployer], deployerTxOpts);

  kyberPriceFeed = await deploy(
    CONTRACT_NAMES.KYBER_PRICEFEED,
    [
      registry.options.address,
      kyberNetworkProxy.options.address,
      toWei('0.5', 'ether'),
      weth.options.address,
      toWei('0.1', 'ether')
    ],
    deployerTxOpts
  );
  await send(registry, 'setNativeAsset', [weth.options.address], deployerTxOpts);

  for (const addr of [eur.options.address, mln.options.address, weth.options.address]) {
    await send(
      registry,
      'registerAsset',
      [ addr, '', '', '', '0', [], [] ],
      deployerTxOpts
    );
  }

  registeredAssets = await call(registry, 'getRegisteredAssets');
});

describe('permissions', () => {
  test('Some unrelated account cannot update feed', async () => {
    const registryOwner = await call(registry, 'owner');
    const designatedUpdater = await call(kyberPriceFeed, 'updater');

    expect(registryOwner).not.toBe(someAccount);
    expect(designatedUpdater).not.toBe(someAccount);
    await expect(
      send(
        kyberPriceFeed,
        'update',
        [
          registeredAssets,
          [toWei('1', 'ether'), toWei('1', 'ether'), toWei('1', 'ether')]
        ],
        someAccountTxOpts
      )
    ).rejects.toThrowFlexible('Only registry owner or updater can call');
  });

  test('Registry owner can update feed', async () => {
    const prices = [toWei('1', 'ether'), toWei('1', 'ether'), toWei('1', 'ether')]
    const registryOwner = await call(registry, 'owner');

    expect(registryOwner).toBe(deployer);

    let receipt = await send(
      kyberPriceFeed,
      'update',
      [ registeredAssets, prices ],
      deployerTxOpts
    );
    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredAssets);
    expect(logUpdated.prices).toEqual(prices);
  });

  test('Designated updater can update feed', async () => {
    const prices = [toWei('1', 'ether'), toWei('1', 'ether'), toWei('1', 'ether')]
    await expect(
      send(
        kyberPriceFeed,
        'update',
        [ registeredAssets, prices ],
        updaterTxOpts
      )
    ).rejects.toThrowFlexible('Only registry owner or updater can call');

    let receipt = await send(kyberPriceFeed, 'setUpdater', [updater], deployerTxOpts);
    const logSetUpdater = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'UpdaterSet'
    );

    expect(logSetUpdater.updater).toBe(updater);

    receipt = await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [toWei('1', 'ether'), toWei('1', 'ether'), toWei('1', 'ether')]
      ],
      updaterTxOpts
    );
    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredAssets);
    expect(logUpdated.prices).toEqual(prices);

    const hasValidMlnPrice = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    const { 0: mlnPrice } = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);

    expect(hasValidMlnPrice).toBe(true);
    expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });
});

describe('prices', () => {
  test('MLN price is changed in reserve', async () => {
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
    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address, eur.options.address],
        [ethPriceInMln.toString(), ethPriceInEur.toString()],
        [mlnPrice.toString(), eurPrice.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ],
      deployerTxOpts
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [eurPrice.toString(), mlnPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const { 0: updatedMlnPrice } = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);
    const { 0: updatedEurPrice } = await call(kyberPriceFeed, 'getPrice', [eur.options.address]);

    expect(updatedMlnPrice.toString()).toBe(mlnPrice.toString());
    expect(updatedEurPrice.toString()).toBe(eurPrice.toString());
  });

  test('Normal (positive) spread condition yields midpoint price', async () => {
    const mlnBid = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const mlnAsk = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.04', 'ether'))
    );
    const ethBidInMln = BNExpInverse(mlnBid); // ETH per 1 MLN (based on bid)
    const midpointPrice = BNExpDiv(
      mlnBid.add(mlnAsk), new BN(toWei('2', 'ether'))
    ).toString();

    const blockNumber = (await web3.eth.getBlock('latest')).number;
    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address],
        [ethBidInMln.toString()],
        [mlnAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ],
      deployerTxOpts
    );

    const preEurPrice = await call(kyberPriceFeed, 'getPrice', [eur.options.address]);

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [preEurPrice.price_.toString(), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const postMlnPrice = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);
    expect(postMlnPrice.price_).toBe(midpointPrice);
  });

  test('Crossed market condition yields midpoint price', async () => {
    const mlnBid = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.04', 'ether'))
    );
    const mlnAsk = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const ethBidInMln = BNExpInverse(mlnBid); // ETH per 1 MLN (based on bid)
    const midpointPrice = BNExpDiv(
      mlnBid.add(mlnAsk), new BN(toWei('2', 'ether'))
    ).toString();

    const blockNumber = (await web3.eth.getBlock('latest')).number;
    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address],
        [ethBidInMln.toString()],
        [mlnAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0]
      ],
      deployerTxOpts
    );

    const preEurPrice = await call(kyberPriceFeed, 'getPrice', [eur.options.address]);

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [preEurPrice.price_.toString(), midpointPrice, toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const postMlnPrice = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);

    expect(postMlnPrice.price_).toBe(midpointPrice);
  });
});
