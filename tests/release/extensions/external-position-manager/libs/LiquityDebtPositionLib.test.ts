import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import { LiquityDebtPositionLib, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createLiquityDebtPosition,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ILiquityHintHelper,
  ILiquitySortedTroves,
  ILiquityTroveManager,
  liquityCalcHints,
  liquityDebtPositionAddCollateral,
  liquityDebtPositionBorrow,
  liquityDebtPositionCloseTrove,
  liquityDebtPositionOpenTrove,
  liquityDebtPositionRemoveCollateral,
  liquityDebtPositionRepay,
} from '@enzymefinance/testutils';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';

// Use 2% as global safe maxFee percentage
const maxFeePercentage = utils.parseUnits('0.02', 18);
const liquityLiquidationReserve = utils.parseEther('200');

const liquityHintHelperAddress = '0xE84251b93D9524E0d2e621Ba7dc7cb3579F997C0';
const liquitySortedTrovesAddress = '0x8FdD3fbFEb32b28fb73555518f8b361bCeA741A6';

let liquityDebtPosition: LiquityDebtPositionLib;

let comptrollerProxyUsed: ComptrollerLib;
let vaultProxyUsed: VaultLib;

let fundOwner: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = comptrollerProxy;

  const { externalPositionProxy } = await createLiquityDebtPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    signer: fundOwner,
  });

  liquityDebtPosition = new LiquityDebtPositionLib(externalPositionProxy, provider);
});

describe('openTrove', () => {
  it('works as expected when called to openTrove by a Fund', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lusd = new StandardToken(fork.config.primitives.lusd, provider);

    const collateralAmount = utils.parseEther('10');
    const lusdAmount = (await getAssetUnit(lusd)).mul(5000);

    const seedAmount = utils.parseEther('100');

    await weth.transfer(vaultProxyUsed, seedAmount);

    const hints = await liquityCalcHints({
      collateralAmount,
      liquityHintHelper: new ILiquityHintHelper(liquityHintHelperAddress, provider),
      liquitySortedTroves: new ILiquitySortedTroves(liquitySortedTrovesAddress, provider),
      lusdAmount,
    });

    const openTroveReceipt = await liquityDebtPositionOpenTrove({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: hints[0],
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: hints[1],
    });

    const feeAmount = await new ILiquityTroveManager(fork.config.liquity.troveManager, provider).getBorrowingFee
      .args(lusdAmount)
      .call();

    const getManagedAssetsCall = await liquityDebtPosition.getManagedAssets.call();

    expect(getManagedAssetsCall).toMatchFunctionOutput(liquityDebtPosition.getManagedAssets.fragment, {
      amounts_: [collateralAmount],
      assets_: [weth.address],
    });

    const getDebtAssetsCall = await liquityDebtPosition.getDebtAssets.call();

    expect(getDebtAssetsCall).toMatchFunctionOutput(liquityDebtPosition.getDebtAssets.fragment, {
      amounts_: [lusdAmount.add(liquityLiquidationReserve).add(feeAmount)],
      assets_: [fork.config.primitives.lusd],
    });

    // Actual gas spent varies based on the accuracy of the hint values
    expect(openTroveReceipt).toMatchInlineGasSnapshot('748240');
  });
});

describe('addCollateral', () => {
  it('works as expected', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lusd = new StandardToken(fork.config.primitives.lusd, provider);

    const collateralAmount = utils.parseEther('10');
    const lusdAmount = (await getAssetUnit(lusd)).mul(5000);
    const seedAmount = utils.parseEther('100');

    await weth.transfer(vaultProxyUsed, seedAmount);

    await liquityDebtPositionOpenTrove({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: liquityDebtPosition,
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: liquityDebtPosition,
    });

    const hints = await liquityCalcHints({
      collateralAmount: collateralAmount.mul(2),
      liquityHintHelper: new ILiquityHintHelper(liquityHintHelperAddress, provider),
      liquitySortedTroves: new ILiquitySortedTroves(liquitySortedTrovesAddress, provider),
      lusdAmount,
    });

    const addCollateralReceipt = await liquityDebtPositionAddCollateral({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: hints[0],
      signer: fundOwner,
      upperHint: hints[1],
    });

    const getManagedAssetsCall = await liquityDebtPosition.getManagedAssets.call();

    expect(getManagedAssetsCall).toMatchFunctionOutput(liquityDebtPosition.getManagedAssets.fragment, {
      amounts_: [collateralAmount.mul(2)],
      assets_: [weth.address],
    });

    // Actual gas spent varies based on the accuracy of the hint values
    expect(addCollateralReceipt).toMatchInlineGasSnapshot('417178');
  });
});

describe('removeCollateral', () => {
  it('works as expected', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lusd = new StandardToken(fork.config.primitives.lusd, provider);

    const collateralAmount = utils.parseEther('10');
    const collateralToBeRemoved = utils.parseEther('1');
    const lusdAmount = (await getAssetUnit(lusd)).mul(5000);
    const seedAmount = utils.parseEther('100');

    await weth.transfer(vaultProxyUsed, seedAmount);

    await liquityDebtPositionOpenTrove({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: liquityDebtPosition,
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: liquityDebtPosition,
    });

    const wethBalanceBefore = await weth.balanceOf(vaultProxyUsed);

    const hints = await liquityCalcHints({
      collateralAmount: collateralAmount.sub(collateralToBeRemoved),
      liquityHintHelper: new ILiquityHintHelper(liquityHintHelperAddress, provider),
      liquitySortedTroves: new ILiquitySortedTroves(liquitySortedTrovesAddress, provider),
      lusdAmount,
    });

    const removeCollateralReceipt = await liquityDebtPositionRemoveCollateral({
      collateralAmount: collateralToBeRemoved,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: hints[0],
      signer: fundOwner,
      upperHint: hints[1],
    });

    const wethBalanceAfter = await weth.balanceOf(vaultProxyUsed);

    const getManagedAssetsCall = await liquityDebtPosition.getManagedAssets.call();

    expect(getManagedAssetsCall).toMatchFunctionOutput(liquityDebtPosition.getManagedAssets.fragment, {
      amounts_: [collateralAmount.sub(collateralToBeRemoved)],
      assets_: [weth.address],
    });

    expect(wethBalanceAfter).toEqBigNumber(wethBalanceBefore.add(collateralToBeRemoved));

    // Actual gas spent varies based on the accuracy of the hint values
    expect(removeCollateralReceipt).toMatchInlineGasSnapshot('562395');
  });
});

describe('borrowLusd', () => {
  it('works as expected', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lusd = new StandardToken(fork.config.primitives.lusd, provider);

    const collateralAmount = utils.parseEther('10');
    const lusdAmount = (await getAssetUnit(lusd)).mul(5000);

    const seedAmount = utils.parseEther('100');

    await weth.transfer(vaultProxyUsed, seedAmount);

    await liquityDebtPositionOpenTrove({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: liquityDebtPosition,
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: liquityDebtPosition,
    });

    const hints = await liquityCalcHints({
      collateralAmount,
      liquityHintHelper: new ILiquityHintHelper(liquityHintHelperAddress, provider),
      liquitySortedTroves: new ILiquitySortedTroves(liquitySortedTrovesAddress, provider),
      lusdAmount: lusdAmount.mul(2),
    });

    const borrowLusdReceipt = await liquityDebtPositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: hints[0],
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: hints[1],
    });

    const feeAmount = await new ILiquityTroveManager(fork.config.liquity.troveManager, whales.usdc).getBorrowingFee
      .args(lusdAmount)
      .call();
    const getDebtAssetsCall = await liquityDebtPosition.getDebtAssets.call();

    expect(getDebtAssetsCall).toMatchFunctionOutput(liquityDebtPosition.getDebtAssets.fragment, {
      amounts_: [lusdAmount.mul(2).add(liquityLiquidationReserve).add(BigNumber.from('2').mul(feeAmount))],
      assets_: [fork.config.primitives.lusd],
    });

    // Actual gas spent varies based on the accuracy of the hint values
    expect(borrowLusdReceipt).toMatchInlineGasSnapshot('1194884');
  });
});

describe('closeTrove', () => {
  it('works as expected', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lusd = new StandardToken(fork.config.primitives.lusd, whales.lusd);

    const collateralAmount = utils.parseEther('10');
    const lusdAmount = (await getAssetUnit(lusd)).mul(5000);
    const seedAmount = utils.parseEther('100');

    await weth.transfer(vaultProxyUsed, seedAmount);
    await lusd.transfer(vaultProxyUsed, lusdAmount.mul(2));

    await liquityDebtPositionOpenTrove({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: liquityDebtPosition,
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: liquityDebtPosition,
    });

    const getDebtAssetsCallBefore = await liquityDebtPosition.getDebtAssets.call();
    const wethBalanceBefore = await weth.balanceOf(vaultProxyUsed);
    const lusdBalanceBefore = await lusd.balanceOf(vaultProxyUsed);

    const closeTroveReceipt = await liquityDebtPositionCloseTrove({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      signer: fundOwner,
    });

    const wethBalanceAfter = await weth.balanceOf(vaultProxyUsed);
    const lusdBalanceAfter = await lusd.balanceOf(vaultProxyUsed);

    expect(wethBalanceAfter.sub(wethBalanceBefore)).toEqBigNumber(collateralAmount);

    expect(lusdBalanceBefore.sub(lusdBalanceAfter)).toEqBigNumber(
      getDebtAssetsCallBefore.amounts_[0].sub(liquityLiquidationReserve),
    );

    const getDebtAssetsCallAfer = await liquityDebtPosition.getDebtAssets.call();
    const getManagedAssetsCallAfter = await liquityDebtPosition.getManagedAssets.call();

    expect(getDebtAssetsCallAfer).toMatchFunctionOutput(liquityDebtPosition.getDebtAssets.fragment, {
      amounts_: [],
      assets_: [],
    });

    expect(getManagedAssetsCallAfter).toMatchFunctionOutput(liquityDebtPosition.getDebtAssets.fragment, {
      amounts_: [],
      assets_: [],
    });

    // Actual gas spent varies based on the accuracy of the hint values
    expect(closeTroveReceipt).toMatchInlineGasSnapshot('438847');
  });
});

describe('repayBorrow', () => {
  it('works as expected', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lusd = new StandardToken(fork.config.primitives.lusd, provider);

    const collateralAmount = utils.parseEther('10');
    const lusdAssetUnit = await getAssetUnit(lusd);

    const lusdAmount = lusdAssetUnit.mul(5000);

    const seedAmount = utils.parseEther('100');

    await weth.transfer(vaultProxyUsed, seedAmount);

    await liquityDebtPositionOpenTrove({
      collateralAmount,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: liquityDebtPosition,
      lusdAmount,
      maxFeePercentage,
      signer: fundOwner,
      upperHint: liquityDebtPosition,
    });

    const lusdAmountRepaid = lusdAmount.div(2);

    const hints = await liquityCalcHints({
      collateralAmount,
      liquityHintHelper: new ILiquityHintHelper(liquityHintHelperAddress, provider),
      liquitySortedTroves: new ILiquitySortedTroves(liquitySortedTrovesAddress, provider),
      lusdAmount: lusdAmount.div(2),
    });

    const repayBorrowReceipt = await liquityDebtPositionRepay({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: liquityDebtPosition,
      lowerHint: hints[0],
      lusdAmount: lusdAmountRepaid,
      signer: fundOwner,
      upperHint: hints[1],
    });

    const feeAmount = await new ILiquityTroveManager(fork.config.liquity.troveManager, whales.usdc).getBorrowingFee
      .args(lusdAmount)
      .call();
    const getDebtAssetsCall = await liquityDebtPosition.getDebtAssets.call();

    expect(getDebtAssetsCall).toMatchFunctionOutput(liquityDebtPosition.getDebtAssets.fragment, {
      amounts_: [lusdAmount.add(liquityLiquidationReserve).add(feeAmount).sub(lusdAmountRepaid)],
      assets_: [fork.config.primitives.lusd],
    });

    // Actual gas spent varies based on the accuracy of the hint values
    expect(repayBorrowReceipt).toMatchGasSnapshot('391554');
  });
});
