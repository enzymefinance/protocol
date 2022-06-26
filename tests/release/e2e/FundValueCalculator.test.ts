// @file All test functions calls to the release-level FundValueCalculator are routed via FundValueCalculatorRouter

import {
  feeManagerConfigArgs,
  IChainlinkAggregator,
  managementFeeConfigArgs,
  managementFeeConvertRateToScaledPerSecondRate,
  ONE_HUNDRED_PERCENT_IN_BPS,
  ONE_PERCENT_IN_BPS,
  ONE_YEAR_IN_SECONDS,
  SHARES_UNIT,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  // Set the FundValueCalculator for this release
  await fork.deployment.fundValueCalculatorRouter.setFundValueCalculators(
    [fork.deployment.fundDeployer],
    [fork.deployment.fundValueCalculator],
  );
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    const fundValueCalculator = fork.deployment.fundValueCalculator;
    const fundValueCalculatorRouter = fork.deployment.fundValueCalculatorRouter;
    const fundValueCalculatorUsdWrapper = fork.deployment.fundValueCalculatorUsdWrapper;

    // FundValueCalculatorRouter
    expect(await fundValueCalculatorRouter.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);

    // FundValueCalculatorUsdWrapper
    expect(await fundValueCalculatorUsdWrapper.getEthUsdAggregatorContract()).toMatchAddress(
      fork.config.chainlink.ethusd,
    );
    expect(await fundValueCalculatorUsdWrapper.getFundValueCalculatorRouter()).toMatchAddress(
      fundValueCalculatorRouter,
    );
    // dummy value for tests
    expect(await fundValueCalculatorUsdWrapper.getStaleRateThreshold()).toEqBigNumber(ONE_YEAR_IN_SECONDS * 10);
    expect(await fundValueCalculatorUsdWrapper.getWethToken()).toMatchAddress(fork.config.weth);

    // FundValueCalculator
    expect(await fundValueCalculator.getFeeManager()).toMatchAddress(fork.deployment.feeManager);
    expect(await fundValueCalculator.getProtocolFeeTracker()).toMatchAddress(fork.deployment.protocolFeeTracker);
    expect(await fundValueCalculator.getValueInterpreter()).toMatchAddress(fork.deployment.valueInterpreter);
  });
});

describe('calcs', () => {
  it('happy path', async () => {
    const [signer, sharesHolder] = fork.accounts;
    const fundValueCalculatorRouter = fork.deployment.fundValueCalculatorRouter;
    const fundValueCalculatorUsdWrapper = fork.deployment.fundValueCalculatorUsdWrapper;
    const valueInterpreter = fork.deployment.valueInterpreter;
    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const weth = new StandardToken(fork.config.weth, provider);

    // Create a fund with a management fee and seeded with an initial investment, which mints shares supply and also starts the protocol fee
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [fork.deployment.managementFee],
        settings: [
          managementFeeConfigArgs({
            scaledPerSecondRate: managementFeeConvertRateToScaledPerSecondRate(utils.parseEther('0.01')),
          }),
        ], // 1% ManagementFee
      }),
      fundDeployer: fork.deployment.fundDeployer,
      investment: {
        buyer: sharesHolder,
        seedBuyer: true,
      },
      signer,
    });

    // Warp a year in the future to easily predict accrued management fee and protocol fee
    await provider.send('evm_increaseTime', [60 * 60 * 24 * 365]);
    await provider.send('evm_mine', []);

    // GROSS VALUE

    // calcGav
    const actualGav = await comptrollerProxy.calcGav.args().call();

    expect(await fundValueCalculatorRouter.calcGav.args(vaultProxy).call()).toMatchFunctionOutput(
      fundValueCalculatorRouter.calcGav,
      {
        denominationAsset_: denominationAsset,
        gav_: actualGav,
      },
    );

    // calcGavInAsset
    const actualGavInEth = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, actualGav, weth)
      .call();

    expect(await fundValueCalculatorRouter.calcGavInAsset.args(vaultProxy, weth).call()).toEqBigNumber(actualGavInEth);

    // calcGrossShareValue
    const actualGrossShareValue = await comptrollerProxy.calcGrossShareValue.call();

    expect(await fundValueCalculatorRouter.calcGrossShareValue.args(vaultProxy).call()).toMatchFunctionOutput(
      fundValueCalculatorRouter.calcGrossShareValue,
      {
        denominationAsset_: denominationAsset,
        grossShareValue_: actualGrossShareValue,
      },
    );

    // calcGrossShareValueInAsset
    const actualGrossShareValueInEth = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, actualGrossShareValue, weth)
      .call();

    expect(await fundValueCalculatorRouter.calcGrossShareValueInAsset.args(vaultProxy, weth).call()).toEqBigNumber(
      actualGrossShareValueInEth,
    );

    // NET VALUE

    // calcNetShareValue
    const expectedShareValueNetFundFees = actualGrossShareValue.sub(
      actualGrossShareValue.mul(ONE_PERCENT_IN_BPS).div(ONE_HUNDRED_PERCENT_IN_BPS),
    ); // 1% management fee
    const expectedNetShareValue = expectedShareValueNetFundFees.sub(
      expectedShareValueNetFundFees.mul(25).div(ONE_HUNDRED_PERCENT_IN_BPS),
    ); // 25 bps protocol fee, minted after management fee has been settled

    const calcNetShareValueRes = await fundValueCalculatorRouter.calcNetShareValue.args(vaultProxy).call();

    expect(calcNetShareValueRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNetShareValueRes.netShareValue_).toBeAroundBigNumber(expectedNetShareValue, 100);

    // calcNetShareValueInAsset
    const actualNetShareValueInEth = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNetShareValueRes.netShareValue_, weth)
      .call();

    expect(await fundValueCalculatorRouter.calcNetShareValueInAsset.args(vaultProxy, weth).call()).toEqBigNumber(
      actualNetShareValueInEth,
    );

    // calcNav
    const totalSharesSupply = await vaultProxy.totalSupply();
    const expectedNav = totalSharesSupply.mul(expectedNetShareValue).div(SHARES_UNIT);

    const calcNavRes = await fundValueCalculatorRouter.calcNav.args(vaultProxy).call();

    expect(calcNavRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNavRes.nav_).toBeAroundBigNumber(expectedNav, 100);

    // calcNavInAsset
    const actualNavInEth = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNavRes.nav_, weth)
      .call();

    expect(await fundValueCalculatorRouter.calcNavInAsset.args(vaultProxy, weth).call()).toEqBigNumber(actualNavInEth);

    // calcNetValueForSharesHolder
    const sharesHolderBalance = await vaultProxy.balanceOf(sharesHolder);
    const expectedNetValueForSharesHolder = sharesHolderBalance.mul(expectedNetShareValue).div(SHARES_UNIT);

    const calcNetValueForSharesHolderRes = await fundValueCalculatorRouter.calcNetValueForSharesHolder
      .args(vaultProxy, sharesHolder)
      .call();

    expect(calcNetValueForSharesHolderRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNetValueForSharesHolderRes.netValue_).toBeAroundBigNumber(expectedNetValueForSharesHolder, 100);

    // calcNetValueForSharesHolderInAsset
    const actualNetValueForSharesHolderInEth = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNetValueForSharesHolderRes.netValue_, weth)
      .call();

    expect(
      await fundValueCalculatorRouter.calcNetValueForSharesHolderInAsset.args(vaultProxy, sharesHolder, weth).call(),
    ).toEqBigNumber(actualNetValueForSharesHolderInEth);

    // USD VALUES

    const ethUsdAggregator = new IChainlinkAggregator(fork.config.chainlink.ethusd, provider);
    const { 1: usdPerEthRate } = await ethUsdAggregator.latestRoundData();

    const actualGavInUsd = convertEthToUsd({ ethAmount: actualGavInEth, usdPerEthRate });

    expect(await fundValueCalculatorUsdWrapper.calcGav.args(vaultProxy).call()).toEqBigNumber(actualGavInUsd);

    const actualGrossShareValueInUsd = convertEthToUsd({ ethAmount: actualGrossShareValueInEth, usdPerEthRate });

    expect(await fundValueCalculatorUsdWrapper.calcGrossShareValue.args(vaultProxy).call()).toEqBigNumber(
      actualGrossShareValueInUsd,
    );

    const actualNavInUsd = convertEthToUsd({ ethAmount: actualNavInEth, usdPerEthRate });

    expect(await fundValueCalculatorUsdWrapper.calcNav.args(vaultProxy).call()).toEqBigNumber(actualNavInUsd);

    const actualNetShareValueInUsd = convertEthToUsd({ ethAmount: actualNetShareValueInEth, usdPerEthRate });

    expect(await fundValueCalculatorUsdWrapper.calcNetShareValue.args(vaultProxy).call()).toEqBigNumber(
      actualNetShareValueInUsd,
    );

    const actualNetValueForSharesHolderInUsd = convertEthToUsd({
      ethAmount: actualNetValueForSharesHolderInEth,
      usdPerEthRate,
    });

    expect(
      await fundValueCalculatorUsdWrapper.calcNetValueForSharesHolder.args(vaultProxy, sharesHolder).call(),
    ).toEqBigNumber(actualNetValueForSharesHolderInUsd);
  });
});

function convertEthToUsd({ ethAmount, usdPerEthRate }: { ethAmount: BigNumber; usdPerEthRate: BigNumber }) {
  const ethUsdAggregatorPrecisionUnit = utils.parseUnits('1', 8);

  return ethAmount.mul(usdPerEthRate).div(ethUsdAggregatorPrecisionUnit);
}
