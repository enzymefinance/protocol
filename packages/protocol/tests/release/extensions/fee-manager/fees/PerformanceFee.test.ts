import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, PerformanceFee, VaultLib } from '@enzymefinance/protocol';
import { FeeHook, feeManagerConfigArgs, ITestStandardToken, performanceFeeConfigArgs } from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  redeemSharesInKind,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const TEN_PERCENT = BigNumber.from(1000);

let fork: ProtocolDeployment;
let performanceFee: PerformanceFee;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  performanceFee = fork.deployment.performanceFee;
});

it('has correct config', async () => {
  for (const hook of Object.values(FeeHook)) {
    const settlesOnHook = [FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares].includes(hook);

    expect(await performanceFee.settlesOnHook(hook)).toMatchFunctionOutput(performanceFee.settlesOnHook, {
      settles_: settlesOnHook,
      usesGav_: settlesOnHook,
    });
    const updatesOnHook = [FeeHook.Continuous, FeeHook.PostBuyShares, FeeHook.PreRedeemShares].includes(hook);

    expect(await performanceFee.updatesOnHook(hook)).toMatchFunctionOutput(performanceFee.updatesOnHook, {
      updates_: updatesOnHook,
      usesGav_: updatesOnHook,
    });
  }
});

describe('addFundSettings', () => {
  const feeRecipient = randomAddress();
  const rate = TEN_PERCENT;
  let comptrollerProxy: ComptrollerLib;
  let denominationAsset: ITestStandardToken;
  let fundOwner: SignerWithAddress, randomUser: SignerWithAddress;
  let receipt: any;

  beforeEach(async () => {
    [fundOwner, randomUser] = fork.accounts;
    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFee],
        settings: [
          performanceFeeConfigArgs({
            rate,
            recipient: feeRecipient,
          }),
        ],
      }),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'TestFund',
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    receipt = newFundRes.receipt;
  });

  it('can only be called by the FeeManager', async () => {
    const performanceFeeConfig = performanceFeeConfigArgs({
      rate,
    });

    await expect(
      performanceFee.connect(randomUser).addFundSettings(comptrollerProxy, performanceFeeConfig),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  // Test via fund creation
  it('new fund: correctly handles valid call', async () => {
    // Assert state
    // highWaterMark is added during `activateForFund`, which happens atomically during new fund creation
    expect(await performanceFee.getFeeInfoForFund(comptrollerProxy)).toMatchFunctionOutput(
      performanceFee.getFeeInfoForFund,
      {
        highWaterMark: await getAssetUnit(denominationAsset),
        rate,
      },
    );
    expect(await performanceFee.getRecipientForFund(comptrollerProxy)).toMatchAddress(feeRecipient);

    // Assert correct events were emitted
    assertEvent(receipt, performanceFee.abi.getEvent('FundSettingsAdded'), {
      comptrollerProxy,
      rate,
    });
  });

  // In this case, `highWaterMark` should still be 0
  it.todo('migrated fund: correctly handles valid call');
});

describe('activateForFund', () => {
  const feeRecipient = randomAddress();
  const rate = TEN_PERCENT;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let denominationAsset: ITestStandardToken;
  let fundOwner: SignerWithAddress, randomUser: SignerWithAddress;
  let receipt: any;

  beforeEach(async () => {
    [fundOwner, randomUser] = fork.accounts;
    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFee],
        settings: [
          performanceFeeConfigArgs({
            rate,
            recipient: feeRecipient,
          }),
        ],
      }),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'TestFund',
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;
    receipt = newFundRes.receipt;
  });

  it('can only be called by the FeeManager', async () => {
    await expect(
      performanceFee.connect(randomUser).activateForFund(comptrollerProxy, vaultProxy),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  // Just test new fund creation
  it('new fund: correctly handles valid call', async () => {
    const expectedHighWaterMark = await getAssetUnit(denominationAsset);

    // Assert state
    const getFeeInfoForFundCall = await performanceFee.getFeeInfoForFund(comptrollerProxy);

    expect(getFeeInfoForFundCall).toMatchFunctionOutput(performanceFee.getFeeInfoForFund, {
      highWaterMark: expectedHighWaterMark,
      rate,
    });

    // Assert event
    assertEvent(receipt, performanceFee.abi.getEvent('ActivatedForFund'), {
      comptrollerProxy,
      highWaterMark: expectedHighWaterMark,
    });
  });

  it.todo('migrated fund: correctly handles valid call (new fund)');
});

describe('settle', () => {
  const feeRecipient = randomAddress();
  const rate = TEN_PERCENT;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let denominationAsset: ITestStandardToken;
  let fundOwner: SignerWithAddress, investor: SignerWithAddress, randomUser: SignerWithAddress;

  beforeEach(async () => {
    [fundOwner, investor, randomUser] = fork.accounts;
    denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const newFundRes = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFee],
        settings: [
          performanceFeeConfigArgs({
            rate,
            recipient: feeRecipient,
          }),
        ],
      }),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'TestFund',
      fundOwner,
      signer: fundOwner,
    });

    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;
  });

  it('can only be called by the FeeManager', async () => {
    await expect(
      performanceFee.connect(randomUser).settle(comptrollerProxy, vaultProxy, FeeHook.Continuous, '0x', 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('works as expected', async () => {
    const denominationAssetUnit = await getAssetUnit(denominationAsset);

    const initialInvestmentAmount = denominationAssetUnit.mul(2);

    await buyShares({
      provider,
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      investmentAmount: initialInvestmentAmount,
      seedBuyer: true,
    });

    // Buy and redeem a constant amount of shares (no value change, other than slight depreciation due to protocol fee)
    const buyAndRedeemAssetAmount = denominationAssetUnit.mul(5);
    const preBuyAndRedeemInvestorShares = await vaultProxy.balanceOf(investor);

    await buyShares({
      provider,
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      investmentAmount: buyAndRedeemAssetAmount,
      seedBuyer: true,
    });
    await redeemSharesInKind({
      comptrollerProxy,
      quantity: (await vaultProxy.balanceOf(investor)).sub(preBuyAndRedeemInvestorShares),
      signer: investor,
    });
    // Performance shares should not have been paid out
    expect(await vaultProxy.balanceOf(feeRecipient)).toEqBigNumber(0);

    // Bump performance by sending denomination asset to the vault
    const gavIncreaseAmount = denominationAssetUnit;

    await setAccountBalance({
      account: vaultProxy,
      amount: gavIncreaseAmount,
      overwrite: false,
      provider,
      token: denominationAsset,
    });

    const preRedeemSharePrice = await comptrollerProxy.calcGrossShareValue.call();

    // Redeem more of remaining shares
    const redeemAmount = (await vaultProxy.balanceOf(investor)).div(4);
    const redeemTx = await redeemSharesInKind({
      comptrollerProxy,
      quantity: redeemAmount,
      signer: investor,
    });

    // The correct amount should have been settled and paid
    // GAV: 3 units (2 initial, 1 increase)
    // Shares supply: 2 units
    // Share price: 1.5 units/share
    // Raw value due: 1 unit performance increase * 10% rate = 0.1 asset units
    // Raw shares due: 0.1 asset units / 1.5 asset units/share = 0.0666
    // Shares due: 0.0666 raw shares * 2 unit supply / (2 unit supply - 0.0666 raw shares) = 0.06889...
    const feePaidOut = await vaultProxy.balanceOf(feeRecipient);

    expect(feePaidOut).toBeAroundBigNumber(utils.parseEther('0.06889'));
    // The correct HWM value should have been set
    // 3 units of GAV / 2.06889 shares = 1.45 asset units/share
    const nextHighWaterMark = (await performanceFee.getFeeInfoForFund(comptrollerProxy)).highWaterMark;

    expect(nextHighWaterMark).toBeAroundBigNumber(utils.parseUnits('1.45', await denominationAsset.decimals()));

    // Expect the correct events to have been fired
    // Since protocol fee is charged after fund-level fees and there are no other fund-level fees,
    // we can use the `preRedeemSharePrice` as the emitted `sharePrice`
    assertEvent(redeemTx, performanceFee.abi.getEvent('Settled'), {
      comptrollerProxy,
      sharePrice: preRedeemSharePrice,
      sharesDue: feePaidOut,
    });
    assertEvent(redeemTx, performanceFee.abi.getEvent('HighWaterMarkUpdated'), {
      comptrollerProxy,
      nextHighWaterMark,
    });
  });
});
