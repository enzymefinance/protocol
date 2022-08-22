import type { UsdEthSimulatedAggregator, ValueInterpreter } from '@enzymefinance/protocol';
import { ChainlinkRateAsset, ITestChainlinkAggregator, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture, getAssetUnit } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let usdEthSimulatedAggregator: UsdEthSimulatedAggregator;
let valueInterpreter: ValueInterpreter;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  usdEthSimulatedAggregator = fork.deployment.usdEthSimulatedAggregator;
  valueInterpreter = fork.deployment.valueInterpreter;
});

describe('decimals', () => {
  it('returns the expected precision', async () => {
    expect(await usdEthSimulatedAggregator.decimals()).toBe(18);
  });
});

describe('latestRoundData', () => {
  it('happy path', async () => {
    const latestRoundDataRes = await usdEthSimulatedAggregator.latestRoundData();

    const chainlinkEthUsdAggregator = new ITestChainlinkAggregator(fork.config.chainlink.ethusd, provider);
    const chainlinkLatestRoundDataRes = await chainlinkEthUsdAggregator.latestRoundData();

    // Everything should be returned exactly as it is in Chainlink other than the rate
    expect(latestRoundDataRes.roundId_).toEqBigNumber(chainlinkLatestRoundDataRes.roundId_);
    expect(latestRoundDataRes.startedAt_).toEqBigNumber(chainlinkLatestRoundDataRes.startedAt_);
    expect(latestRoundDataRes.updatedAt_).toEqBigNumber(chainlinkLatestRoundDataRes.updatedAt_);
    expect(latestRoundDataRes.answeredInRound_).toEqBigNumber(chainlinkLatestRoundDataRes.answeredInRound_);

    // Rate should be inverse ETH/USD price with the target precision (1/price * 1e18).
    // On August 8th, 2022 ETH/USD was around $1750.
    expect(latestRoundDataRes.answer_).toEqBigNumber(577539467959733);
  });
});

describe('e2e', () => {
  it('can be used as an invariantProxyAsset in the CurvePriceFeed', async () => {
    const curvePriceFeed = fork.deployment.curvePriceFeed;
    // Use a pool with USD as the invariant
    const curvePool = fork.config.curve.pools.aave.pool;
    const curveLpToken = new ITestStandardToken(fork.config.curve.pools.aave.lpToken, provider);
    const curveLpTokenUnit = await getAssetUnit(curveLpToken);
    const curvePoolHasReentrantVirtualPrice = fork.config.curve.pools.aave.hasReentrantVirtualPrice;

    // Add usdEthSimulatedAggregator to the asset universe
    await valueInterpreter.addPrimitives(
      [usdEthSimulatedAggregator],
      [usdEthSimulatedAggregator],
      [ChainlinkRateAsset.ETH],
    );

    // Update the Curve pool with the new invariant proxy asset
    await curvePriceFeed.updatePoolInfo([curvePool], [usdEthSimulatedAggregator], [curvePoolHasReentrantVirtualPrice]);

    // Assert the expected Curve pool value in terms of USDC
    // a3CRV was approx $1.08 on May 13, 2022
    expect(
      await valueInterpreter.calcCanonicalAssetValue
        .args(curveLpToken, curveLpTokenUnit, fork.config.primitives.usdc)
        .call(),
    ).toEqBigNumber(1088425);
  });
});
