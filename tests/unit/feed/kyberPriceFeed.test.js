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
import { deploy, send, call } from '~/deploy/utils/deploy-contract';
import { BNExpDiv, BNExpInverse } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { getEventFromLogs } from '~/tests/utils/metadata';
import { updateKyberPriceFeed } from '~/tests/utils/updateKyberPriceFeed';
import { getPricesFromKyberFeed } from '~/tests/utils/getPricesFromKyberFeed';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, updater, someAccount;
let deployerTxOpts, updaterTxOpts, someAccountTxOpts, councilTxOpts;
let conversionRates, kyberNetworkProxy, registry;
let dai, mln, weth, registeredAssets;

// TODO: move pricefeed deployment to the primary fork so we can actually deploy it?
beforeAll(async () => {
  const defaultGas = 8000000;
  web3 = await startChain();
  [deployer, updater, someAccount] = await web3.eth.getAccounts();
  deployerTxOpts = { from: deployer, gas: defaultGas };
  updaterTxOpts = { from: updater, gas: defaultGas };
  someAccountTxOpts = { from: someAccount, gas: defaultGas };

  dai = getDeployed(CONTRACT_NAMES.DAI, web3, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  conversionRates = getDeployed(CONTRACT_NAMES.CONVERSION_RATES, web3, mainnetAddrs.kyber.ConversionRates);
  kyberNetworkProxy = getDeployed(CONTRACT_NAMES.KYBER_NETWORK_PROXY, web3, mainnetAddrs.kyber.KyberNetworkProxy);

  const councilAddress = call(registry, 'owner');
  councilTxOpts = { from: councilAddress, gas: defaultGas }

  // await send(registry, 'setNativeAsset', [weth.options.address], deployerTxOpts, web3);

  // for (const addr of [dai.options.address, mln.options.address, weth.options.address]) {
  //   const alreadyRegistered = await call(registry, 'assetIsRegistered', [addr]);
  //   if (!alreadyRegistered) {
  //     await send(
  //       registry,
  //       'registerAsset',
  //       [ addr ],
  //       deployerTxOpts,
  //       web3
  //     );
  //   }
  // }

  registeredAssets = await call(registry, 'getRegisteredAssets');
});

describe('update', () => {
  let kyberPriceFeed;
  let mlnPriceFromKyber;
  let maxDeviationFromFeed = toWei('0.1', 'ether');

  beforeAll(async () => {
    // kyberPriceFeed = await deploy(
    //   CONTRACT_NAMES.KYBER_PRICEFEED,
    //   [
    //     registry.options.address,
    //     kyberNetworkProxy.options.address,
    //     toWei('0.5', 'ether'),
    //     weth.options.address,
    //     toWei('0.1', 'ether')
    //   ],
    //   deployerTxOpts,
    //   web3
    // );
    kyberPriceFeed = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
    await send(
      kyberPriceFeed,
      'setMaxPriceDeviation',
      [maxDeviationFromFeed],
      deployerTxOpts,
      web3
    );
    mlnPriceFromKyber = new BN((await call(
      kyberPriceFeed, 'getKyberPrice', [mln.options.address, weth.options.address]
    )).kyberPrice_);
  });

  test('Some unrelated account cannot update feed', async () => {
    const registryOwner = await call(registry, 'owner');
    const designatedUpdater = await call(kyberPriceFeed, 'updater');

    expect(registryOwner).not.toBe(someAccount);
    expect(designatedUpdater).not.toBe(someAccount);
    await expect(
      updateKyberPriceFeed(kyberPriceFeed, web3, someAccountTxOpts)
    ).rejects.toThrowFlexible('Only registry owner or updater can call');
  });

  test('Registry owner can update feed', async () => {
    const registryOwner = await call(registry, 'owner');

    expect(registryOwner).toBe(deployer);

    const prices = await getPricesFromKyberFeed(kyberPriceFeed, registeredAssets, web3);
    const receipt = await send(
      kyberPriceFeed,
      'update',
      [registeredAssets, prices],
      deployerTxOpts,
      web3
    );
    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredAssets);
    expect(logUpdated.prices).toEqual(prices);
  });

  test('Designated updater can update feed', async () => {
    await expect(
      updateKyberPriceFeed(kyberPriceFeed, web3, updaterTxOpts)
    ).rejects.toThrowFlexible('Only registry owner or updater can call');


    let receipt = await send(kyberPriceFeed, 'setUpdater', [updater], deployerTxOpts, web3);
    const logSetUpdater = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'UpdaterSet'
    );

    expect(logSetUpdater.updater).toBe(updater);

    receipt = await updateKyberPriceFeed(kyberPriceFeed, web3, updaterTxOpts)
    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredAssets);
    // expect(logUpdated.prices).toEqual(dummyPrices);

    const hasValidMlnPrice = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    const { 0: mlnPrice } = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);

    expect(hasValidMlnPrice).toBe(true);
    // expect(mlnPrice.toString()).toBe(toWei('1', 'ether'));
  });

  test('Price hint above the upper deviation threshold reverts', async () => {
    const prices = await getPricesFromKyberFeed(kyberPriceFeed, registeredAssets, web3);
    const upperEndValidPrice = (new BN(prices[1])).mul(
      new BN(toWei('1', 'ether'))
    ).div(new BN(toWei('1', 'ether')).sub(new BN(maxDeviationFromFeed)));
    const barelyTooHighPrice = upperEndValidPrice.add(new BN('2'));

    await expect(
      send(
        kyberPriceFeed,
        'update',
        [
          registeredAssets,
          [prices[0], barelyTooHighPrice.toString(), ...prices.slice(2)]
        ],
        deployerTxOpts,
        web3
      )
    ).rejects.toThrowFlexible('update: Kyber price deviates too much from maxPriceDeviation');

    let receipt = await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [prices[0], upperEndValidPrice.toString(), ...prices.slice(2)]
      ],
      deployerTxOpts,
      web3
    );

    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredAssets);
    // expect(logUpdated.prices).toEqual(dummyPrices);
  });

  test('Price hint below the lower deviation threshold reverts', async () => {
    const prices = await getPricesFromKyberFeed(kyberPriceFeed, registeredAssets, web3);
    const maxDeviationFromFeed = new BN(await call(kyberPriceFeed, 'maxPriceDeviation'));
    const lowerEndValidPrice = (new BN(prices[1])).mul(
      new BN(toWei('1', 'ether'))
    ).div(new BN(toWei('1', 'ether')).add(new BN(maxDeviationFromFeed))).add(new BN('1'));
    const barelyTooLowPrice = lowerEndValidPrice.sub(new BN('1'));

    await expect(
      send(
        kyberPriceFeed,
        'update',
        [
          registeredAssets,
          [prices[0], barelyTooLowPrice.toString(), ...prices.slice(2)]
        ],
        deployerTxOpts,
        web3
      )
    ).rejects.toThrowFlexible('update: Kyber price deviates too much from maxPriceDeviation');

    const receipt = await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [prices[0], lowerEndValidPrice.toString(), ...prices.slice(2)]
      ],
      deployerTxOpts,
      web3
    );

    const logUpdated = getEventFromLogs(
        receipt.logs, CONTRACT_NAMES.KYBER_PRICEFEED, 'PricesUpdated'
    );

    expect(logUpdated.assets).toEqual(registeredAssets);
    // expect(logUpdated.prices).toEqual(dummyPrices);
  });

  // TODO: need to come up with a way to set spread rates easily for this to work
  test.skip('Asset with spread greater than max results in invalid price', async () => {
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
      deployerTxOpts,
      web3
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [toWei('1', 'ether'), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts,
      web3
    );

    const validPricePostUpdate1 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    expect(validPricePostUpdate1).toBe(true);
    const mlnPricePostUpdate1 = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);
    expect(mlnPricePostUpdate1.price_).toBe(midpointPrice);

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
      deployerTxOpts,
      web3
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [toWei('1', 'ether'), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts,
      web3
    );

    const validPricePostUpdate2 = await call(kyberPriceFeed, 'hasValidPrice', [mln.options.address]);
    expect(validPricePostUpdate2).toBe(false);
  });
});

// TODO: would be better to test this with a freshly-deployed price feed and our own reserves
describe.skip('getPrice', () => {
  let kyberPriceFeed;

  beforeAll(async () => {
    // kyberPriceFeed = await deploy(
    //   CONTRACT_NAMES.KYBER_PRICEFEED,
    //   [
    //     registry.options.address,
    //     kyberNetworkProxy.options.address,
    //     toWei('0.5', 'ether'),
    //     weth.options.address,
    //     toWei('0.1', 'ether')
    //   ],
    //   deployerTxOpts
    // );
  });

  test('Price change in reserve is reflected in getPrice post-update', async () => {
    const mlnPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.05', 'ether'))
    );
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice))

    const daiPrice = BNExpDiv(
      new BN(toWei('1', 'ether')),
      new BN(toWei('0.008', 'ether')),
    );
    const ethPriceInEur = BNExpInverse(new BN(daiPrice))

    await send(
      conversionRates,
      'setBaseRate',
      [
        [mln.options.address, dai.options.address],
        [ethPriceInMln.toString(), ethPriceInEur.toString()],
        [mlnPrice.toString(), daiPrice.toString()],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        (await web3.eth.getBlock('latest')).number,
        [0]
      ],
      deployerTxOpts,
      web3
    );

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [daiPrice.toString(), mlnPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts,
      web3
    );

    const { 0: updatedMlnPrice } = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);
    const { 0: updatedEurPrice } = await call(kyberPriceFeed, 'getPrice', [dai.options.address]);

    expect(updatedMlnPrice.toString()).toBe(mlnPrice.toString());
    expect(updatedEurPrice.toString()).toBe(daiPrice.toString());
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
      deployerTxOpts,
      web3
    );

    const preEurPrice = await call(kyberPriceFeed, 'getPrice', [dai.options.address]);

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [preEurPrice.price_.toString(), midpointPrice.toString(), toWei('1', 'ether')]
      ],
      deployerTxOpts,
      web3
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
      deployerTxOpts,
      web3
    );

    const preEurPrice = await call(kyberPriceFeed, 'getPrice', [dai.options.address]);

    await send(
      kyberPriceFeed,
      'update',
      [
        registeredAssets,
        [preEurPrice.price_.toString(), midpointPrice, toWei('1', 'ether')]
      ],
      deployerTxOpts,
      web3
    );

    const postMlnPrice = await call(kyberPriceFeed, 'getPrice', [mln.options.address]);

    expect(postMlnPrice.price_).toBe(midpointPrice);
  });
});
