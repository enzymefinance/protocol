import { AddressLike, EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { MockSynthetixToken } from '@enzymefinance/protocol';
import { randomizedTestDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await randomizedTestDeployment(provider);

  enum RateAssets {
    ETH,
    USD,
  }

  const currencyKeys = [
    utils.formatBytes32String('sMockA'),
    utils.formatBytes32String('sMockB'),
    utils.formatBytes32String('sMockC'),
    utils.formatBytes32String('sMockD'),
  ];

  const aggregators = [
    deployment.chainlinkAggregators.aud, // USD Based (8 decimals)
    deployment.chainlinkAggregators.xau, // USD Based (8 decimals)
    deployment.chainlinkAggregators.mln, // ETH Based (18 decimals)
    deployment.chainlinkAggregators.knc, // ETH Based (18 decimals)
  ];

  const rateAssets = [RateAssets.USD, RateAssets.USD, RateAssets.ETH, RateAssets.USD];

  const synths = await Promise.all([
    MockSynthetixToken.deploy(config.deployer, 'SynthMockA', 'sMockA', 18, currencyKeys[0]),
    MockSynthetixToken.deploy(config.deployer, 'SynthMockB', 'sMockB', 18, currencyKeys[1]),
    MockSynthetixToken.deploy(config.deployer, 'SynthMockC', 'sMockC', 18, currencyKeys[2]),
    MockSynthetixToken.deploy(config.deployer, 'SynthMockD', 'sMockD', 18, currencyKeys[3]),
  ]);

  const synthAddresses = synths.map((synth) => synth.address);

  await deployment.synthetix.mockSynthetixIntegratee.setSynthFromCurrencyKeys(currencyKeys, synthAddresses);

  await deployment.synthetix.mockSynthetixPriceSource.setPriceSourcesForCurrencyKeys(
    currencyKeys,
    aggregators,
    rateAssets,
  );

  await deployment.synthetixPriceFeed.addSynths(synthAddresses);

  const synthetixPriceFeeds: Array<AddressLike> = new Array(synths.length).fill(await deployment.synthetixPriceFeed);

  await deployment.aggregatedDerivativePriceFeed.addDerivatives(synths, synthetixPriceFeeds);

  const [, delegatedAccount] = accounts;
  await Promise.all([
    synths[0].transfer(delegatedAccount, utils.parseUnits('1', 22)),
    synths[1].transfer(delegatedAccount, utils.parseUnits('1', 22)),
  ]);

  return {
    accounts,
    deployment,
    mocks: {
      synths,
      rateAssets,
      aggregators,
      currencyKeys,
    },
    config,
  };
}

describe('getAmountsForExchange', () => {
  it('correctly retrieves getAmountsForExchange from an integratee (similar rateAsset)', async () => {
    const {
      deployment: {
        synthetix: { mockSynthetixIntegratee },
      },
      mocks: {
        aggregators: [aggregatorA, aggregatorB],
        currencyKeys: [currencyKeyA, currencyKeyB],
      },
    } = await provider.snapshot(snapshot);

    const defaultTs = BigNumber.from('1');

    const synthALatestAnswer = utils.parseUnits('1100', 8);
    const synthBLatestAnswer = utils.parseUnits('1', 8);

    await aggregatorA.setLatestAnswer(synthALatestAnswer, defaultTs);
    await aggregatorB.setLatestAnswer(synthBLatestAnswer, defaultTs);

    const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange
      .args(utils.parseEther('1'), currencyKeyA, currencyKeyB)
      .call();

    const exchangeFeeRate = await mockSynthetixIntegratee.getFee();
    const amountWithoutFees = synthALatestAnswer.mul(utils.parseEther('1')).div(synthBLatestAnswer);

    expect(amountsForExchange).toMatchFunctionOutput(mockSynthetixIntegratee.getAmountsForExchange, {
      amountReceived_: amountWithoutFees.mul(BigNumber.from('1000').sub(exchangeFeeRate)).div(BigNumber.from('1000')),
      exchangeFeeRate_: exchangeFeeRate,
      fee_: amountWithoutFees.mul(exchangeFeeRate).div(BigNumber.from('1000')),
    });
  });
});

it('correctly retrieves getAmountsForExchange from an integratee (different rateAsset)', async () => {
  const {
    deployment: {
      chainlinkEthUsdAggregator,
      synthetix: { mockSynthetixIntegratee },
    },
    mocks: {
      aggregators: [, aggregatorB, aggregatorC],
      currencyKeys: [, currencyKeyB, currencyKeyC],
    },
  } = await provider.snapshot(snapshot);

  const defaultTs = BigNumber.from('1');

  // Use a real Ethereum price to make calculations on real rates
  const tokenBLatestAnswer = utils.parseUnits('1100', 8); // 1100 USD
  const tokenCLatestAnswer = utils.parseEther('1'); // 1 ETH
  const ethUsdLatestAnswer = utils.parseUnits('1100', 8); // 1100 USD/ETH

  await aggregatorB.setLatestAnswer(tokenBLatestAnswer, defaultTs);
  await aggregatorC.setLatestAnswer(tokenCLatestAnswer, defaultTs);
  await chainlinkEthUsdAggregator.setLatestAnswer(ethUsdLatestAnswer, defaultTs);

  const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange
    .args(utils.parseEther('1'), currencyKeyB, currencyKeyC)
    .call();

  const exchangeFeeRate = await mockSynthetixIntegratee.getFee();

  const amountWithoutFeesExpected = tokenBLatestAnswer // 8 decimals
    .mul(utils.parseEther('1')) // 18 decimals
    .mul(utils.parseEther('1')) // 18 decimals
    .div(tokenCLatestAnswer.mul(ethUsdLatestAnswer)); // 36 decimals

  expect(amountsForExchange).toMatchFunctionOutput(mockSynthetixIntegratee.getAmountsForExchange, {
    amountReceived_: amountWithoutFeesExpected
      .mul(BigNumber.from('1000').sub(exchangeFeeRate))
      .div(BigNumber.from('1000')),
    exchangeFeeRate_: exchangeFeeRate,
    fee_: amountWithoutFeesExpected.mul(exchangeFeeRate).div(BigNumber.from('1000')),
  });
});

describe('exchangeOnBehalfWithTracking', () => {
  it('correctly performs an exchange between two assets (same RateAsset)', async () => {
    const {
      accounts: [delegate, authorizer],
      deployment: {
        synthetix: { mockSynthetixIntegratee },
      },
      mocks: {
        synths: [synthA, synthB],
        currencyKeys: [currencyKeyA, currencyKeyB],
      },
    } = await provider.snapshot(snapshot);

    const outgoingAssetAmount = utils.parseEther('1');
    await synthA.approve(mockSynthetixIntegratee, outgoingAssetAmount);

    await mockSynthetixIntegratee.connect(authorizer).approveExchangeOnBehalf(delegate);

    const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange
      .args(outgoingAssetAmount, currencyKeyA, currencyKeyB)
      .call();

    const [preMockABalance, preMockBBalance] = await Promise.all([
      synthA.balanceOf(authorizer),
      synthB.balanceOf(authorizer),
    ]);

    await mockSynthetixIntegratee
      .connect(delegate)
      .exchangeOnBehalfWithTracking(
        authorizer,
        currencyKeyA,
        outgoingAssetAmount,
        currencyKeyB,
        randomAddress(),
        utils.formatBytes32String('0'),
      );

    const [postMockABalance, postMockBBalance] = await Promise.all([
      synthA.balanceOf(authorizer),
      synthB.balanceOf(authorizer),
    ]);

    const spentAssetAmount = preMockABalance.sub(postMockABalance);
    const receivedAssetAmount = postMockBBalance.sub(preMockBBalance);

    expect(receivedAssetAmount).toEqBigNumber(amountsForExchange.amountReceived_);
    expect(spentAssetAmount).toEqBigNumber(outgoingAssetAmount);
  });
});

describe('expectedValues', () => {
  it('returns the correct value from the ValueInterpreter', async () => {
    const {
      deployment: {
        valueInterpreter,
        tokens: { dai },
        chainlinkEthUsdAggregator,
      },
      mocks: {
        aggregators: [, aggregatorB, aggregatorC],
        synths: [, synthB, synthC],
      },
    } = await provider.snapshot(snapshot);

    const defaultTs = BigNumber.from('1');

    // Use a real Ethereum price to make calculations on real rates
    const tokenBLatestAnswer = utils.parseUnits('2200', 8); // 1100 USD
    const tokenCLatestAnswer = utils.parseEther('1'); // 1 ETH
    const ethUsdLatestAnswer = utils.parseUnits('1100', 8); // 1100 USD/ETH

    await aggregatorB.setLatestAnswer(tokenBLatestAnswer, defaultTs);
    await aggregatorC.setLatestAnswer(tokenCLatestAnswer, defaultTs);
    await chainlinkEthUsdAggregator.setLatestAnswer(ethUsdLatestAnswer, defaultTs);

    const valueSynthB = await valueInterpreter.calcCanonicalAssetValue
      .args(synthB, utils.parseUnits('1', 18), dai)
      .call();

    const valueSynthC = await valueInterpreter.calcCanonicalAssetValue
      .args(synthC, utils.parseUnits('1', 18), dai)
      .call();

    expect(valueSynthB).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: utils.parseUnits('2200', 18),
      isValid_: true,
    });

    expect(valueSynthC).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: utils.parseUnits('1100', 18),
      isValid_: true,
    });
  });
});
