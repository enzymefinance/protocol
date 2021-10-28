/*
 * @file All test functions calls to the release-level FundValueCalculator are routed via FundValueCalculatorRouter
 */

import {
  convertRateToScaledPerSecondRate,
  feeManagerConfigArgs,
  managementFeeConfigArgs,
  ONE_HUNDRED_PERCENT_IN_BPS,
  ONE_PERCENT_IN_BPS,
  SHARES_UNIT,
  StandardToken,
} from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture, createNewFund } from '@enzymefinance/testutils';
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

    // FundValueCalculatorRouter
    expect(await fundValueCalculatorRouter.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);

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
    const valueInterpreter = fork.deployment.valueInterpreter;
    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const quoteAsset = new StandardToken(fork.config.weth, provider);

    // Create a fund with a management fee and seeded with an initial investment, which mints shares supply and also starts the protocol fee
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [fork.deployment.managementFee],
        settings: [
          managementFeeConfigArgs({ scaledPerSecondRate: convertRateToScaledPerSecondRate(utils.parseEther('0.01')) }),
        ], // 1% ManagementFee
      }),
      investment: {
        buyer: sharesHolder,
        seedBuyer: true,
      },
    });

    // Warp a year in the future to easily predict accrued management fee and protocol fee
    await provider.send('evm_increaseTime', [60 * 60 * 24 * 365]);
    await provider.send('evm_mine', []);

    // GROSS VALUE

    // calcGav
    const actualGav = await comptrollerProxy.calcGav.args(false).call();
    expect(await fundValueCalculatorRouter.calcGav.args(vaultProxy).call()).toMatchFunctionOutput(
      fundValueCalculatorRouter.calcGav,
      {
        denominationAsset_: denominationAsset,
        gav_: actualGav,
      },
    );

    // calcGavInAsset
    const actualGavInAsset = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, actualGav, quoteAsset)
      .call();
    expect(await fundValueCalculatorRouter.calcGavInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualGavInAsset,
    );

    // calcGrossShareValue
    const actualGrossShareValue = await comptrollerProxy.calcGrossShareValue.args(false).call();
    expect(await fundValueCalculatorRouter.calcGrossShareValue.args(vaultProxy).call()).toMatchFunctionOutput(
      fundValueCalculatorRouter.calcGrossShareValue,
      {
        denominationAsset_: denominationAsset,
        grossShareValue_: actualGrossShareValue,
      },
    );

    // calcGrossShareValueInAsset
    const actualGrossShareValueInAsset = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, actualGrossShareValue, quoteAsset)
      .call();
    expect(
      await fundValueCalculatorRouter.calcGrossShareValueInAsset.args(vaultProxy, quoteAsset).call(),
    ).toEqBigNumber(actualGrossShareValueInAsset);

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
    const actualNetShareValueInAsset = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNetShareValueRes.netShareValue_, quoteAsset)
      .call();
    expect(await fundValueCalculatorRouter.calcNetShareValueInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualNetShareValueInAsset,
    );

    // calcNav
    const totalSharesSupply = await vaultProxy.totalSupply();
    const expectedNav = totalSharesSupply.mul(expectedNetShareValue).div(SHARES_UNIT);

    const calcNavRes = await fundValueCalculatorRouter.calcNav.args(vaultProxy).call();
    expect(calcNavRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNavRes.nav_).toBeAroundBigNumber(expectedNav, 100);

    // calcNavInAsset
    const actualNavInAsset = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNavRes.nav_, quoteAsset)
      .call();
    expect(await fundValueCalculatorRouter.calcNavInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualNavInAsset,
    );

    // calcNetValueForSharesHolder
    const sharesHolderBalance = await vaultProxy.balanceOf(sharesHolder);
    const expectedNetValueForSharesHolder = sharesHolderBalance.mul(expectedNetShareValue).div(SHARES_UNIT);

    const calcNetValueForSharesHolderRes = await fundValueCalculatorRouter.calcNetValueForSharesHolder
      .args(vaultProxy, sharesHolder)
      .call();
    expect(calcNetValueForSharesHolderRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNetValueForSharesHolderRes.netValue_).toBeAroundBigNumber(expectedNetValueForSharesHolder, 100);

    // calcNetValueForSharesHolderInAsset
    const actualNetValueForSharesHolderInAsset = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNetValueForSharesHolderRes.netValue_, quoteAsset)
      .call();
    expect(
      await fundValueCalculatorRouter.calcNetValueForSharesHolderInAsset
        .args(vaultProxy, sharesHolder, quoteAsset)
        .call(),
    ).toEqBigNumber(actualNetValueForSharesHolderInAsset);
  });
});
