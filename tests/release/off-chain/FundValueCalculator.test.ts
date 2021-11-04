import {
  convertRateToScaledPerSecondRate,
  feeManagerConfigArgs,
  FundValueCalculator,
  managementFeeConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture, createNewFund } from '@enzymefinance/testutils';
import { utils } from 'ethers';

const SHARES_UNIT = utils.parseEther('1');

let fork: ProtocolDeployment;
let fundValueCalculator: FundValueCalculator;
beforeEach(async () => {
  fork = await deployProtocolFixture();

  fundValueCalculator = fork.deployment.fundValueCalculator;
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    expect(await fundValueCalculator.getFeeManager()).toMatchAddress(fork.deployment.feeManager);
    expect(await fundValueCalculator.getValueInterpreter()).toMatchAddress(fork.deployment.valueInterpreter);
  });
});

describe('calcs', () => {
  it('happy path', async () => {
    const [signer, sharesHolder] = fork.accounts;
    const valueInterpreter = fork.deployment.valueInterpreter;
    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const denominationAssetUnit = utils.parseUnits('1', await denominationAsset.decimals());
    const investmentAmount = denominationAssetUnit;
    const quoteAsset = new StandardToken(fork.config.weth, provider);

    // Seed shares buyer with denomination asset amount
    await denominationAsset.transfer(sharesHolder, investmentAmount);

    // Create a fund with a management fee and seeded with an initial investment, which mints shares supply
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [fork.deployment.managementFee],
        settings: [managementFeeConfigArgs(convertRateToScaledPerSecondRate(utils.parseEther('0.01')))], // 1% ManagementFee
      }),
      investment: {
        signer: sharesHolder,
        buyers: [sharesHolder],
        investmentAmounts: [investmentAmount],
      },
    });

    // Warp a year in the future to easily predict accrued management fee
    await provider.send('evm_increaseTime', [60 * 60 * 24 * 365]);
    await provider.send('evm_mine', []);

    // GROSS VALUE

    // calcGav
    const { gav_: actualGav } = await comptrollerProxy.calcGav.args(false).call();
    expect(await fundValueCalculator.calcGav.args(vaultProxy).call()).toMatchFunctionOutput(
      fundValueCalculator.calcGav,
      {
        denominationAsset_: denominationAsset,
        gav_: actualGav,
      },
    );

    // calcGavInAsset
    const { value_: actualGavInAsset } = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, actualGav, quoteAsset)
      .call();
    expect(await fundValueCalculator.calcGavInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualGavInAsset,
    );

    // calcGrossShareValue
    const { grossShareValue_: actualGrossShareValue } = await comptrollerProxy.calcGrossShareValue.args(false).call();
    expect(await fundValueCalculator.calcGrossShareValue.args(vaultProxy).call()).toMatchFunctionOutput(
      fundValueCalculator.calcGrossShareValue,
      {
        denominationAsset_: denominationAsset,
        grossShareValue_: actualGrossShareValue,
      },
    );

    // calcGrossShareValueInAsset
    const { value_: actualGrossShareValueInAsset } = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, actualGrossShareValue, quoteAsset)
      .call();
    expect(await fundValueCalculator.calcGrossShareValueInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualGrossShareValueInAsset,
    );

    // NET VALUE

    // calcNetShareValue
    const expectedNetShareValue = actualGrossShareValue.sub(actualGrossShareValue.div(100)); // 1% management fee

    const calcNetShareValueRes = await fundValueCalculator.calcNetShareValue.args(vaultProxy).call();
    expect(calcNetShareValueRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNetShareValueRes.netShareValue_).toBeAroundBigNumber(expectedNetShareValue, 100);

    // calcNetShareValueInAsset
    const { value_: actualNetShareValueInAsset } = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNetShareValueRes.netShareValue_, quoteAsset)
      .call();
    expect(await fundValueCalculator.calcNetShareValueInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualNetShareValueInAsset,
    );

    // calcNav
    const totalSharesSupply = await vaultProxy.totalSupply();
    const expectedNav = totalSharesSupply.mul(expectedNetShareValue).div(SHARES_UNIT);

    const calcNavRes = await fundValueCalculator.calcNav.args(vaultProxy).call();
    expect(calcNavRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNavRes.nav_).toBeAroundBigNumber(expectedNav, 100);

    // calcNavInAsset
    const { value_: actualNavInAsset } = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNavRes.nav_, quoteAsset)
      .call();
    expect(await fundValueCalculator.calcNavInAsset.args(vaultProxy, quoteAsset).call()).toEqBigNumber(
      actualNavInAsset,
    );

    // calcNetValueForSharesHolder
    const sharesHolderBalance = await vaultProxy.balanceOf(sharesHolder);
    const expectedNetValueForSharesHolder = sharesHolderBalance.mul(expectedNetShareValue).div(SHARES_UNIT);

    const calcNetValueForSharesHolderRes = await fundValueCalculator.calcNetValueForSharesHolder
      .args(vaultProxy, sharesHolder)
      .call();
    expect(calcNetValueForSharesHolderRes.denominationAsset_).toMatchAddress(denominationAsset);
    expect(calcNetValueForSharesHolderRes.netValue_).toBeAroundBigNumber(expectedNetValueForSharesHolder, 100);

    // calcNetValueForSharesHolderInAsset
    const { value_: actualNetValueForSharesHolderInAsset } = await valueInterpreter.calcCanonicalAssetValue
      .args(denominationAsset, calcNetValueForSharesHolderRes.netValue_, quoteAsset)
      .call();
    expect(
      await fundValueCalculator.calcNetValueForSharesHolderInAsset.args(vaultProxy, sharesHolder, quoteAsset).call(),
    ).toEqBigNumber(actualNetValueForSharesHolderInAsset);
  });
});
