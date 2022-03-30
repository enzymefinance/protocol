import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import { AaveDebtPositionLib, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  aaveDebtPositionAddCollateral,
  aaveDebtPositionBorrow,
  aaveDebtPositionClaimRewards,
  aaveDebtPositionRemoveCollateral,
  aaveDebtPositionRepayBorrow,
  createAaveDebtPosition,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants } from 'ethers';
import hre from 'hardhat';

let aaveDebtPosition: AaveDebtPositionLib;

let comptrollerProxyUsed: ComptrollerLib;
let vaultProxyUsed: VaultLib;

let fundOwner: SignerWithAddress;

const roundingBuffer = BigNumber.from(2);

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new StandardToken(fork.config.primitives.usdc, hre.ethers.provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = comptrollerProxy;

  const { externalPositionProxy } = await createAaveDebtPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    signer: fundOwner,
  });

  aaveDebtPosition = new AaveDebtPositionLib(externalPositionProxy, provider);
});

describe('addCollateralAssets', () => {
  it('works as expected when called to addCollateral by a Fund', async () => {
    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken.address];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed, seedAmount);

    const externalPositionCollateralBalanceBefore = await aToken.balanceOf(aaveDebtPosition);

    const addCollateralReceipt = await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const externalPositionCollateralBalanceAfter = await aToken.balanceOf(aaveDebtPosition);

    // Assert the correct balance of collateral was moved from the vaultProxy to the externalPosition
    expect(externalPositionCollateralBalanceAfter.sub(externalPositionCollateralBalanceBefore)).toBeAroundBigNumber(
      collateralAmounts[0],
      roundingBuffer,
    );

    const getManagedAssetsCall = await aaveDebtPosition.getManagedAssets.call();

    expect(getManagedAssetsCall.amounts_[0]).toBeAroundBigNumber(collateralAmounts[0]);
    expect(getManagedAssetsCall.assets_).toEqual(collateralAssets);

    expect(addCollateralReceipt).toMatchInlineGasSnapshot(`395398`);
  });
});

describe('removeCollateralAssets', () => {
  it('works as expected when called to remove collateral by a Fund', async () => {
    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken.address];

    const collateralAssetsToBeRemoved = [aToken];
    const collateralAmountsToBeRemoved = [collateralAmounts[0].div(BigNumber.from('10'))];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed, seedAmount);

    await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const externalPositionBalanceBefore = await aToken.balanceOf(aaveDebtPosition);
    const vaultBalanceBefore = await aToken.balanceOf(vaultProxyUsed);

    const removeCollateralReceipt = await aaveDebtPositionRemoveCollateral({
      aTokens: collateralAssetsToBeRemoved,
      amounts: collateralAmountsToBeRemoved,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const externalPositionBalanceAfter = await aToken.balanceOf(aaveDebtPosition);
    const vaultBalanceAfter = await aToken.balanceOf(vaultProxyUsed);

    // Assert the correct balance of collateral was moved from the externalPosition to the vaultProxy
    expect(externalPositionBalanceBefore.sub(externalPositionBalanceAfter)).toBeAroundBigNumber(
      collateralAmountsToBeRemoved[0],
      roundingBuffer,
    );

    expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toBeAroundBigNumber(
      collateralAmountsToBeRemoved[0],
      roundingBuffer,
    );

    const getManagedAssetsCall = await aaveDebtPosition.getManagedAssets.call();

    expect(getManagedAssetsCall.amounts_[0]).toBeAroundBigNumber(
      collateralAmounts[0].sub(collateralAmountsToBeRemoved[0]),
    );
    expect(getManagedAssetsCall.assets_).toEqual(collateralAssets);

    expect(removeCollateralReceipt).toMatchInlineGasSnapshot(`349931`);
  });

  it('works as expected when called to remove collateral by a Fund (max amount)', async () => {
    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken.address];

    const collateralAssetsToBeRemoved = [aToken];
    const collateralAmountsToBeRemoved = [constants.MaxUint256];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed, seedAmount);

    await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const externalPositionBalanceBefore = await aToken.balanceOf(aaveDebtPosition);
    const vaultBalanceBefore = await aToken.balanceOf(vaultProxyUsed);

    const removeCollateralReceipt = await aaveDebtPositionRemoveCollateral({
      aTokens: collateralAssetsToBeRemoved,
      amounts: collateralAmountsToBeRemoved,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const externalPositionBalanceAfter = await aToken.balanceOf(aaveDebtPosition);
    const vaultBalanceAfter = await aToken.balanceOf(vaultProxyUsed);

    // Assert the correct balance of collateral was moved from the externalPosition to the vaultProxy
    expect(externalPositionBalanceBefore.sub(externalPositionBalanceAfter)).toBeAroundBigNumber(
      collateralAmounts[0],
      roundingBuffer,
    );

    expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toBeAroundBigNumber(collateralAmounts[0], roundingBuffer);

    const getManagedAssetsCall = await aaveDebtPosition.getManagedAssets.call();

    expect(getManagedAssetsCall).toMatchFunctionOutput(aaveDebtPosition.getManagedAssets.fragment, {
      amounts_: [],
      assets_: [],
    });

    expect(removeCollateralReceipt).toMatchInlineGasSnapshot(`343424`);
  });
});

describe('borrowAssets', () => {
  it('works as expected when called for borrowing by a fund', async () => {
    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);
    const token = new StandardToken(fork.config.primitives.usdc, provider);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken];

    const borrowedAssets = [token];
    const borrowedAmounts = [collateralAmounts[0].div(10)];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed, seedAmount);

    await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const vaultBalanceBefore = await token.balanceOf(vaultProxyUsed);

    const borrowReceipt = await aaveDebtPositionBorrow({
      amounts: borrowedAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
      tokens: borrowedAssets,
    });

    const vaultBalanceAfter = await token.balanceOf(vaultProxyUsed);

    // Assert the correct balance of asset was received at the vaultProxy
    expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

    const getDebtAssetsCall = await aaveDebtPosition.getDebtAssets.call();

    expect(getDebtAssetsCall).toMatchFunctionOutput(aaveDebtPosition.getManagedAssets.fragment, {
      amounts_: borrowedAmounts,
      assets_: borrowedAssets,
    });

    expect(borrowReceipt).toMatchInlineGasSnapshot(`559912`);
  });
});

describe('repayBorrowedAssets', () => {
  it('works as expected when called to repay borrow by a fund', async () => {
    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);
    const token = new StandardToken(fork.config.primitives.usdc, provider);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken];

    const borrowedAmounts = [collateralAmounts[0].div(10)];
    const borrowedAmountsToBeRepaid = [borrowedAmounts[0].div(10)];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed.address, seedAmount);

    await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    await aaveDebtPositionBorrow({
      amounts: borrowedAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
      tokens: [token],
    });

    // Warp some time to ensure there is an accruedInterest > 0
    const secondsToWarp = 100000000;

    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const borrowedBalancesBefore = (await aaveDebtPosition.getDebtAssets.call()).amounts_[0];

    const repayBorrowReceipt = await aaveDebtPositionRepayBorrow({
      amounts: borrowedAmountsToBeRepaid,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
      tokens: [token],
    });

    const borrowedBalancesAfter = (await aaveDebtPosition.getDebtAssets.call()).amounts_[0];

    expect(borrowedBalancesAfter).toBeAroundBigNumber(borrowedBalancesBefore.sub(borrowedAmountsToBeRepaid[0]));

    expect(repayBorrowReceipt).toMatchInlineGasSnapshot(`436346`);
  });

  it('works as expected when called to repay borrow by a fund (more than full amount)', async () => {
    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);
    const token = new StandardToken(fork.config.primitives.usdc, whales.usdc);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken];

    const borrowedAmounts = [collateralAmounts[0].div(10)];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed.address, seedAmount);
    await token.transfer(vaultProxyUsed.address, seedAmount);

    await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    await aaveDebtPositionBorrow({
      amounts: borrowedAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
      tokens: [token],
    });

    // Warp some time to ensure there is an accruedInterest > 0
    const secondsToWarp = 100000000;

    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const borrowedBalancesBefore = (await aaveDebtPosition.getDebtAssets.call()).amounts_[0];

    const vaultBalanceBefore = await token.balanceOf(vaultProxyUsed);

    const repayBorrowReceipt = await aaveDebtPositionRepayBorrow({
      amounts: [borrowedBalancesBefore.add(1)],
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
      tokens: [token],
    });

    const vaultBalanceAfter = await token.balanceOf(vaultProxyUsed);

    expect(vaultBalanceAfter).toBeAroundBigNumber(vaultBalanceBefore.sub(borrowedBalancesBefore));

    const getDebtAssetsCall = await aaveDebtPosition.getDebtAssets.call();

    expect(getDebtAssetsCall).toMatchFunctionOutput(aaveDebtPosition.getManagedAssets.fragment, {
      amounts_: [],
      assets_: [],
    });

    expect(repayBorrowReceipt).toMatchInlineGasSnapshot(`442035`);
  });
});

describe('claimRewards', () => {
  it('works as expected when called for borrowing by a fund', async () => {
    const stkAaveAddress = '0x4da27a545c0c5B758a6BA100e3a049001de870f5';
    const rewardToken = new StandardToken(stkAaveAddress, provider);

    const aToken = new StandardToken(fork.config.aave.atokens.ausdc[0], whales.ausdc);

    const collateralAmounts = [(await getAssetUnit(aToken)).mul(10)];
    const collateralAssets = [aToken];

    const seedAmount = (await getAssetUnit(aToken)).mul(100);

    await aToken.transfer(vaultProxyUsed, seedAmount);

    await aaveDebtPositionAddCollateral({
      aTokens: collateralAssets,
      amounts: collateralAmounts,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const secondsToWarp = 100000000;

    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const stkAaveBalanceBefore = await rewardToken.balanceOf(vaultProxyUsed);

    await aaveDebtPositionClaimRewards({
      assets: collateralAssets,
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: aaveDebtPosition,
      signer: fundOwner,
    });

    const stkAaveBalanceAfter = await rewardToken.balanceOf(vaultProxyUsed);

    expect(stkAaveBalanceAfter.sub(stkAaveBalanceBefore)).toBeGtBigNumber(0);
  });
});
