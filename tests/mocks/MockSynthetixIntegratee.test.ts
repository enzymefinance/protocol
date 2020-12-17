import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { MockSynthetixToken } from '@melonproject/protocol';
import { randomizedTestDeployment } from '@melonproject/testutils';
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
    deployment.chainlinkAggregators.mln,
    deployment.chainlinkAggregators.knc,
    deployment.chainlinkAggregators.uni,
    deployment.chainlinkAggregators.xau,
  ];

  const rateAssets = [RateAssets.ETH, RateAssets.ETH, RateAssets.USD, RateAssets.USD];

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

  const [, delegatedAccount] = accounts;
  await Promise.all([
    synths[0].transfer(delegatedAccount, utils.parseUnits('1', 22)),
    synths[1].transfer(delegatedAccount, utils.parseUnits('1', 22)),
  ]);

  await deployment.synthetixPriceFeed.addSynths(synthAddresses);

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

    const synthALatestAnswer = utils.parseEther('500');
    const synthBLatestAnswer = utils.parseEther('2');

    await aggregatorA.setLatestAnswer(synthALatestAnswer, defaultTs);
    await aggregatorB.setLatestAnswer(synthBLatestAnswer, defaultTs);

    const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange(
      utils.parseEther('1'),
      currencyKeyA,
      currencyKeyB,
    );

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
  const tokenBLatestAnswer = utils.parseEther('500');
  const tokenCLatestAnswer = utils.parseEther('1');
  const ethUsdLatestAnswer = BigNumber.from('58720715671');

  await aggregatorB.setLatestAnswer(tokenBLatestAnswer, defaultTs);
  await aggregatorC.setLatestAnswer(tokenCLatestAnswer, defaultTs);
  await chainlinkEthUsdAggregator.setLatestAnswer(ethUsdLatestAnswer, defaultTs);

  const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange(
    utils.parseEther('1'),
    currencyKeyB,
    currencyKeyC,
  );

  const exchangeFeeRate = await mockSynthetixIntegratee.getFee();
  const amountWithoutFeesExpected = tokenBLatestAnswer
    .mul(ethUsdLatestAnswer)
    .mul(utils.parseUnits('1', 18 - 8))
    .div(tokenCLatestAnswer);

  expect(amountsForExchange).toMatchFunctionOutput(mockSynthetixIntegratee.getAmountsForExchange, {
    amountReceived_: amountWithoutFeesExpected
      .mul(BigNumber.from('1000').sub(exchangeFeeRate))
      .div(BigNumber.from('1000')),
    exchangeFeeRate_: exchangeFeeRate,
    fee_: amountWithoutFeesExpected.mul(exchangeFeeRate).div(BigNumber.from('1000')),
  });
});

it('correctly retrieves getAmountsForExchange from an integratee (different aggregator base decimals)', async () => {
  const {
    deployment: {
      chainlinkEthUsdAggregator,
      synthetix: { mockSynthetixIntegratee },
    },
    mocks: {
      aggregators: [, aggregatorB, , aggregatorD],
      currencyKeys: [, currencyKeyB, , currencyKeyD],
    },
  } = await provider.snapshot(snapshot);

  const defaultTs = BigNumber.from('1');

  // Same experiment, now with an 8 decimals price token
  const tokenBLatestAnswer = utils.parseEther('500');
  const tokenDLatestAnswer = utils.parseUnits('1', 8);
  const ethUsdLatestAnswer = BigNumber.from('58720715671');

  await aggregatorB.setLatestAnswer(tokenBLatestAnswer, defaultTs);
  await aggregatorD.setLatestAnswer(tokenDLatestAnswer, defaultTs);
  await chainlinkEthUsdAggregator.setLatestAnswer(ethUsdLatestAnswer, defaultTs);

  const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange(
    utils.parseEther('1'),
    currencyKeyB,
    currencyKeyD,
  );

  const tokenDLatestAnswerNormalized = utils.parseEther('1');

  const exchangeFeeRate = await mockSynthetixIntegratee.getFee();
  const amountWithoutFeesExpected = tokenBLatestAnswer
    .mul(ethUsdLatestAnswer)
    .mul(utils.parseUnits('1', 18 - 8))
    .div(tokenDLatestAnswerNormalized);

  expect(amountsForExchange).toMatchFunctionOutput(mockSynthetixIntegratee.getAmountsForExchange, {
    amountReceived_: amountWithoutFeesExpected
      .mul(BigNumber.from('1000').sub(exchangeFeeRate))
      .div(BigNumber.from('1000')),
    exchangeFeeRate_: exchangeFeeRate,
    fee_: amountWithoutFeesExpected.mul(exchangeFeeRate).div(BigNumber.from('1000')),
  });
});

describe('exchangeOnBehalfWithTracking', () => {
  it('correctly performs an exchange between two assets', async () => {
    const {
      accounts: [, account],
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
    await mockSynthetixIntegratee.approveExchangeOnBehalf(account);

    const amountsForExchange = await mockSynthetixIntegratee.getAmountsForExchange(
      outgoingAssetAmount,
      currencyKeyA,
      currencyKeyB,
    );

    const [preMockABalance, preMockBBalance] = await Promise.all([
      synthA.balanceOf(account),
      synthB.balanceOf(account),
    ]);

    await mockSynthetixIntegratee.exchangeOnBehalfWithTracking(
      account,
      currencyKeyA,
      outgoingAssetAmount,
      currencyKeyB,
      randomAddress(),
      utils.formatBytes32String('0'),
    );

    const [postMockABalance, postMockBBalance] = await Promise.all([
      synthA.balanceOf(account),
      synthB.balanceOf(account),
    ]);

    const spentAssetAmount = preMockABalance.sub(postMockABalance);
    const receivedAssetAmount = postMockBBalance.sub(preMockBBalance);

    expect(receivedAssetAmount).toEqBigNumber(amountsForExchange.amountReceived_);
    expect(spentAssetAmount).toEqBigNumber(outgoingAssetAmount);
  });
});
