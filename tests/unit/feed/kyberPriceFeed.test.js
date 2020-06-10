/*
 * @file Tests simple cases of updating price against a Kyber deployment
 *
 * @test Some unrelated account cannot update feed
 * @test Registy owner an update feed
 * @test Delegated updater can update the feed
 * @test MLN price update on reserve changes price on feed post-update
 * @test Normal spread condition from Kyber rates yields midpoint price
 * @test Crossed market condition from Kyber rates yields midpoint price
 * @test boundaries of max spread
 * @test boundaries of max price deviation
 * TODO: add helper function for updating asset prices on kyber itself
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
let conversionRates, kyberNetworkProxy, registry;
let eur, mln, weth, registeredPrimitives;

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

  await send(registry, 'setNativeAsset', [weth.options.address], deployerTxOpts);

  for (const addr of [eur.options.address, mln.options.address, weth.options.address]) {
    await send(
      registry,
      'registerPrimitive',
      [ addr ],
      deployerTxOpts
    );
  }

  registeredPrimitives = await call(registry, 'getRegisteredPrimitives');
});

describe('update', () => {
  const dummyPrices = [
    toWei('1', 'ether'),
    toWei('1', 'ether'),
    toWei('1', 'ether')
  ];
  let kyberPriceFeed;
  let pricefeedQuoteAsset;
  let maxDeviationFromFeed;
  let mlnPriceFromKyber;

  beforeAll(async () => {
    pricefeedQuoteAsset = weth;
    kyberPriceFeed = await deploy(
      CONTRACT_NAMES.KYBER_PRICEFEED,
      [
        registry.options.address,
        kyberNetworkProxy.options.address,
        toWei('0.5', 'ether'),
        pricefeedQuoteAsset.options.address,
        toWei('0.1', 'ether')
      ],
      deployerTxOpts
    );
    maxDeviationFromFeed = new BN(await call(kyberPriceFeed, 'maxPriceDeviation'));
    mlnPriceFromKyber = new BN((await call(
      kyberPriceFeed, 'getLiveRate', [mln.options.address, weth.options.address]
    ))[0]);
  });

  test('Some unrelated account cannot update feed', async () => {
    const registryOwner = await call(registry, 'owner');
    const designatedUpdater = await call(kyberPriceFeed, 'updater');

    expect(registryOwner).not.toBe(someAccount);
    expect(designatedUpdater).not.toBe(someAccount);
    await expect(
      send(
        kyberPriceFeed,
        'update',
        [registeredPrimitives, dummyPrices],
        someAccountTxOpts
      )
    ).rejects.toThrowFlexible('Only registry owner or updater can call');
  });

  test('Registry owner can update feed', async () => {
    const registryOwner = await call(registry, 'owner');

    expect(registryOwner).toBe(deployer);

    let receipt = await send(
      kyberPriceFeed,
      'update',
      [registeredPrimitives, dummyPrices],
      deployerTxOpts
    );
    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(dummyPrices);
  });

  test('Designated updater can update feed', async () => {
    await expect(
      send(
        kyberPriceFeed,
        'update',
        [registeredPrimitives, dummyPrices],
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
      [registeredPrimitives, dummyPrices],
      updaterTxOpts
    );
    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(dummyPrices);

    const hasValidMlnPrice = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    const { 0: mlnPrice } = await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [mln.options.address, pricefeedQuoteAsset.options.address]
    );

    expect(hasValidMlnPrice).toBe(true);
    expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });

  test('Price hint above the upper deviation threshold reverts', async () => {
    const upperEndValidMlnPrice = mlnPriceFromKyber.mul(
      new BN(toWei('1', 'ether'))
    ).div(new BN(toWei('1', 'ether')).sub(maxDeviationFromFeed));
    const barelyTooHighMlnPrice = upperEndValidMlnPrice.add(new BN('2'));

    await expect(
      send(
        kyberPriceFeed,
        'update',
        [
          registeredPrimitives,
          [toWei('1', 'ether'), barelyTooHighMlnPrice.toString(), toWei('1', 'ether')]
        ],
        deployerTxOpts
      )
    ).rejects.toThrowFlexible('update: Kyber price deviates too much from maxPriceDeviation');

    let receipt = await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [toWei('1', 'ether'), upperEndValidMlnPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(dummyPrices);
  });

  test('Price hint below the lower deviation threshold reverts', async () => {
    const maxDeviationFromFeed = new BN(await call(kyberPriceFeed, 'maxPriceDeviation'));
    const mlnPriceFromKyber = new BN((await call(
      kyberPriceFeed, 'getLiveRate', [mln.options.address, weth.options.address]
    ))[0]);
    const lowerEndValidMlnPrice = mlnPriceFromKyber.mul(
      new BN(toWei('1', 'ether'))
    ).div(new BN(toWei('1', 'ether')).add(maxDeviationFromFeed)).add(new BN('1'));
    const barelyTooLowMlnPrice = lowerEndValidMlnPrice.sub(new BN('1'));

    await expect(
      send(
        kyberPriceFeed,
        'update',
        [
          registeredPrimitives,
          [toWei('1', 'ether'), barelyTooLowMlnPrice.toString(), toWei('1', 'ether')]
        ],
        deployerTxOpts
      )
    ).rejects.toThrowFlexible('update: Kyber price deviates too much from maxPriceDeviation');

    const receipt = await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [toWei('1', 'ether'), lowerEndValidMlnPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredPrimitives);
    expect(logUpdated.prices).toEqual(dummyPrices);
  });

  test('Asset with spread greater than max results in invalid price', async () => {
    const maxSpreadFromFeed = new BN(await call(kyberPriceFeed, 'maxSpread'));
    // arbitrary ask rate
    const mlnPerEthAskRate = new BN(toWei('0.5', 'ether'));
    // bid rate such that spread is the max permitted
    const mlnPerEthBidRateValid = mlnPerEthAskRate.sub(
      maxSpreadFromFeed.mul(mlnPerEthAskRate).div(new BN(toWei('1', 'ether')))
    );
    // bid rate such that spread is just above max permitted
    const mlnPerEthBidRateInvalid = mlnPerEthBidRateValid.sub(new BN('1'))

    const ethPerMlnFromAsk = BNExpDiv(
      new BN(toWei('1', 'ether')),
      mlnPerEthAskRate
    );
    const ethPerMlnFromBid = BNExpDiv(
      new BN(toWei('1', 'ether')),
      mlnPerEthBidRateValid
    );
    const midpointPrice = BNExpDiv(
      ethPerMlnFromAsk.add(ethPerMlnFromBid), new BN(toWei('2', 'ether'))
    ).toString();

    const validPricePreUpdate1 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    expect(validPricePreUpdate1).toBe(true);

    // setting price with spread equal to max yields valid price
    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address],
        [mlnPerEthBidRateValid.toString()],
        [ethPerMlnFromAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        (await web3.eth.getBlock('latest')).number,
        [0]
      ],
      deployerTxOpts
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [toWei('1', 'ether'), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const validPricePostUpdate1 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    expect(validPricePostUpdate1).toBe(true);
    const mlnPricePostUpdate1 = (await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [mln.options.address, pricefeedQuoteAsset.options.address]
    ))[0];
    expect(mlnPricePostUpdate1).toBe(midpointPrice);

    const validPricePreUpdate2 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    expect(validPricePreUpdate2).toBe(true);

    // setting price with spread outside max yields invalid price
    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address],
        [mlnPerEthBidRateInvalid.toString()],
        [ethPerMlnFromAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        (await web3.eth.getBlock('latest')).number,
        [0]
      ],
      deployerTxOpts
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [toWei('1', 'ether'), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const validPricePostUpdate2 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    expect(validPricePostUpdate2).toBe(false);
  });
});

describe('getCanonicalRate', () => {
  let kyberPriceFeed;
  let pricefeedQuoteAsset;

  beforeAll(async () => {
    pricefeedQuoteAsset = weth;
    kyberPriceFeed = await deploy(
      CONTRACT_NAMES.KYBER_PRICEFEED,
      [
        registry.options.address,
        kyberNetworkProxy.options.address,
        toWei('0.5', 'ether'),
        pricefeedQuoteAsset.options.address,
        toWei('0.1', 'ether')
      ],
      deployerTxOpts
    );
  });

  test('Price change in reserve is reflected in getCanonicalRate post-update', async () => {
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

    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address, eur.options.address],
        [ethPriceInMln.toString(), ethPriceInEur.toString()],
        [mlnPrice.toString(), eurPrice.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        (await web3.eth.getBlock('latest')).number,
        [0]
      ],
      deployerTxOpts
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [eurPrice.toString(), mlnPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const { 0: updatedMlnPrice } = await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [mln.options.address, pricefeedQuoteAsset.options.address]
    );
    const { 0: updatedEurPrice } = await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [eur.options.address, pricefeedQuoteAsset.options.address]
    );

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

    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address],
        [ethBidInMln.toString()],
        [mlnAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        (await web3.eth.getBlock('latest')).number,
        [0]
      ],
      deployerTxOpts
    );

    const preEurPrice = (await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [eur.options.address, pricefeedQuoteAsset.options.address]
    ))[0];

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [preEurPrice.toString(), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const postMlnPrice = (await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [mln.options.address, pricefeedQuoteAsset.options.address]
    ))[0];
    expect(postMlnPrice).toBe(midpointPrice);
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

    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address],
        [ethBidInMln.toString()],
        [mlnAsk.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        (await web3.eth.getBlock('latest')).number,
        [0]
      ],
      deployerTxOpts
    );

    const preEurPrice = (await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [eur.options.address, pricefeedQuoteAsset.options.address]
    ))[0];

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredPrimitives,
        [preEurPrice, midpointPrice, toWei('1', 'ether')]
      ],
      deployerTxOpts
    );

    const postMlnPrice = (await call(
      kyberPriceFeed,
      'getCanonicalRate',
      [mln.options.address, pricefeedQuoteAsset.options.address]
    ))[0];

    expect(postMlnPrice).toBe(midpointPrice);
  });
});
