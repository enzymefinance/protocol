import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { CompoundDebtPositionLib, ComptrollerLib, ICERC20, StandardToken, VaultLib } from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  compoundLend,
  createNewFund,
  deployProtocolFixture,
  ProtocolDeployment,
} from '@enzymefinance/testutils';

import { utils, BigNumber, constants } from 'ethers';
import hre from 'hardhat';
import {
  addCollateral,
  borrow,
  createExternalPosition,
  removeCollateral,
  repayBorrow,
} from '@enzymefinance/testutils/src/scaffolding/extensions/external-positions';

let vaultProxyUsed: VaultLib;
let comptrollerProxyUsed: ComptrollerLib;
let compoundDebtPosition: CompoundDebtPositionLib;
let dai: StandardToken;
let weth: StandardToken;
let cdai: ICERC20;
let ceth: ICERC20;

const valueDeviationToleranceBps = BigNumber.from('1');
const lentAmount = utils.parseEther('1');

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
  const [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.fundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = new ComptrollerLib(comptrollerProxy.address, hre.ethers.provider);

  const vaultUsed = new VaultLib(vaultProxy.address, hre.ethers.provider);

  await createExternalPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    fundOwner,
  });

  const compoundDebtPositionProxyAddress = (await vaultUsed.getActiveExternalPositions.call())[0];
  compoundDebtPosition = new CompoundDebtPositionLib(compoundDebtPositionProxyAddress, whales.dai);

  cdai = new ICERC20(fork.config.compound.ctokens.cdai, whales.cdai);
  ceth = new ICERC20(fork.config.compound.ceth, whales.ceth);

  dai = new StandardToken(fork.config.primitives.dai, whales.dai);
  weth = new StandardToken(fork.config.weth, whales.weth);

  // This will skip re-adding the denomination asset but will seed the vaultProxy
  await addNewAssetsToFund({
    signer: fundOwner,
    comptrollerProxy,
    integrationManager: fork.deployment.integrationManager,
    assets: [weth, dai],
    amounts: [lentAmount, lentAmount],
  });

  // Lend assets to Compound, receive cTokens at VaultProxy
  await compoundLend({
    comptrollerProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    compoundAdapter: fork.deployment.compoundAdapter,
    cToken: cdai,
    tokenAmount: lentAmount,
    cTokenAmount: 1,
  });

  await compoundLend({
    comptrollerProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    compoundAdapter: fork.deployment.compoundAdapter,
    cToken: new ICERC20(fork.config.compound.ceth, whales.weth),
    tokenAmount: lentAmount,
    cTokenAmount: 1,
  });
});

describe('receiveCallFromVault', () => {
  it('reverts when it is called from an acount different than vault', async () => {
    await expect(compoundDebtPosition.receiveCallFromVault(utils.randomBytes(0))).rejects.toBeRevertedWith(
      'Only the vault can make this call',
    );
  });

  describe('addCollateralAssets', () => {
    it('works as expected when called to addCollateral by a Fund', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];

      const externalPositionCollateralBalanceBefore = await cdai.balanceOf(compoundDebtPosition.address);
      const vaultProxyCollateralBalanceBefore = await cdai.balanceOf(vaultProxyUsed.address);

      // Add collateral twice to check it does not fail calling markets twice with the same assets
      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: [collateralAmounts[0].div(2)],
        cTokens: collateralAssets,
      });

      const addCollateralReceipt = await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: [collateralAmounts[0].div(2)],
        cTokens: collateralAssets,
      });

      const externalPositionCollateralBalanceAfter = await cdai.balanceOf(compoundDebtPosition);
      const vaultProxyCollateralBalanceAfter = await cdai.balanceOf(vaultProxyUsed.address);

      // Assert the correct balance of collateral was moved from the vaultProxy to the externalPosition
      expect(externalPositionCollateralBalanceAfter.sub(externalPositionCollateralBalanceBefore)).toEqBigNumber(
        collateralAmounts[0],
      );
      expect(vaultProxyCollateralBalanceBefore.sub(vaultProxyCollateralBalanceAfter)).toEqBigNumber(
        collateralAmounts[0],
      );

      expect(addCollateralReceipt).toCostAround('242979');

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();
      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        assets_: collateralAssets,
        amounts_: collateralAmounts,
      });
    });

    it('works as expected when called to addCollateral by a Fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [ceth.address];

      const externalPositionBalanceBefore = await ceth.balanceOf(compoundDebtPosition.address);
      const vaultBalanceBefore = await ceth.balanceOf(vaultProxyUsed);

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const externalPositionBalanceAfter = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await ceth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the vaultProxy to the externalPosition
      expect(externalPositionBalanceAfter.sub(externalPositionBalanceBefore)).toEqBigNumber(collateralAmounts[0]);
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(collateralAmounts[0]);

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();
      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        assets_: collateralAssets,
        amounts_: collateralAmounts,
      });
    });
  });

  // HAPPY PATHS
  describe('removeCollateralAssets', () => {
    it('works as expected when called to remove collateral by a Fund', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];

      // Remove a relatively small amount
      const collateralAssetsToBeRemoved = [cdai.address];
      const collateralAmountsToBeRemoved = [BigNumber.from('10')];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const externalPositionBalanceBefore = await cdai.balanceOf(compoundDebtPosition);
      const vaultBalanceBefore = await cdai.balanceOf(vaultProxyUsed);

      const removeCollateralReceipt = await removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition,
        assets: collateralAssetsToBeRemoved,
        amounts: collateralAmountsToBeRemoved,
        cTokens: collateralAssets,
      });

      const externalPositionBalanceAfter = await cdai.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await cdai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the externalPosition to the vaultProxy
      expect(externalPositionBalanceBefore.sub(externalPositionBalanceAfter)).toEqBigNumber(
        collateralAmountsToBeRemoved[0],
      );
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(collateralAmountsToBeRemoved[0]);

      expect(removeCollateralReceipt).toCostAround('285334');

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();
      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        assets_: collateralAssets,
        amounts_: [collateralAmounts[0].sub(collateralAmountsToBeRemoved[0])],
      });
    });

    it('works as expected when called to remove collateral by a Fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [ceth.address];

      const collateralAssetsToBeRemoved = [ceth.address];
      const collateralAmountsToBeRemoved = [BigNumber.from('10')];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const externalPositionBalanceBefore = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceBefore = await ceth.balanceOf(vaultProxyUsed);

      await removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssetsToBeRemoved,
        amounts: collateralAmountsToBeRemoved,
        cTokens: collateralAssets,
      });

      const externalPositionBalanceAfter = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await ceth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the externalPosition to the vaultProxy
      expect(externalPositionBalanceBefore.sub(externalPositionBalanceAfter)).toEqBigNumber(
        collateralAmountsToBeRemoved[0],
      );
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(collateralAmountsToBeRemoved[0]);

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();
      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        assets_: collateralAssets,
        amounts_: [collateralAmounts[0].sub(collateralAmountsToBeRemoved[0])],
      });
    });

    it('removes asset from collateralAssets when the full collateralAmount is removed', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const collateralAssetsStoredBefore = (await compoundDebtPosition.getManagedAssets.call()).assets_;
      expect(collateralAssetsStoredBefore.length).toStrictEqual(1);

      await removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const collateralAssetsStoredAfter = (await compoundDebtPosition.getManagedAssets.call()).assets_;
      expect(collateralAssetsStoredAfter.length).toStrictEqual(0);
    });

    it('reverts when the removed asset has not been added as collateral', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];
      const unaddedCollateralAssets = [weth.address];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const collateralAssetsStoredBefore = (await compoundDebtPosition.getManagedAssets.call()).assets_;
      expect(collateralAssetsStoredBefore.length).toStrictEqual(1);

      const removeCollateralTx = removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: unaddedCollateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await expect(removeCollateralTx).rejects.toBeRevertedWith('Asset is not collateral');
    });
  });

  describe('borrowAssets', () => {
    it('works as expected when called for borrowing by a fund', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const borrowedAssets = [dai.address];

      // Ensure the amount borrowed is much lower than collateral
      const borrowedAmounts = [lentAmount.div(10)];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceBefore = await dai.balanceOf(vaultProxyUsed);

      const borrowReceipt = await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceAfter = await dai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was received at the vaultProxy
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

      expect(borrowReceipt).toCostAround('439769');

      const getDebtAssetsCall = await compoundDebtPosition.getDebtAssets.call();
      expect(getDebtAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        assets_: borrowedAssets,
        amounts_: borrowedAmounts,
      });
    });

    it('works as expected when called for borrowing by a fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];
      const borrowedAmounts = [lentAmount.div(10)];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceBefore = await weth.balanceOf(vaultProxyUsed);

      const borrowReceipt = await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceAfter = await weth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was received at the vaultProxy
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

      expect(borrowReceipt).toCostAround('434596');

      const getDebtAssetsCall = await compoundDebtPosition.getDebtAssets.call();
      expect(getDebtAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        assets_: borrowedAssets,
        amounts_: borrowedAmounts,
      });
    });

    it('does not allow an invalid cToken address as an input ', async () => {
      const [fundOwner] = fork.accounts;

      // addCollateral
      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];

      // Ensure the amount borrowed is much lower than collateral
      const borrowedAmounts = [lentAmount.div(10)];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: [randomAddress()],
      });

      const borrowTx = borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: [randomAddress()],
      });

      await expect(borrowTx).rejects.toBeRevertedWith('Bad token cToken pair');
    });

    it('does not allow an incorrect token/cToken pair as an input ', async () => {
      const [fundOwner] = fork.accounts;

      // addCollateral
      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const borrowedAmounts = [lentAmount.div(10)];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: [randomAddress()],
      });

      const borrowTx = borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: [fork.config.primitives.bat],
        amounts: borrowedAmounts,
        cTokens: [cdai.address],
      });

      await expect(borrowTx).rejects.toBeRevertedWith('Bad token cToken pair');
    });
  });

  describe('repayBorrowedAssets', () => {
    it('works as expected when called to repay borrow by a fund', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const borrowedAssets = [dai.address];
      const borrowedAmounts = [lentAmount.div(10)];

      const borrowedAssetsToBeRepaid = [dai.address];
      const borrowedAmountsToBeRepaid = [utils.parseUnits('0.01', await dai.decimals())];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const borrowedBalancesBefore = (await compoundDebtPosition.getDebtAssets.call()).amounts_[0];
      const vaultBalanceBefore = await dai.balanceOf(vaultProxyUsed);

      const repayBorrowReceipt = await repayBorrow({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssetsToBeRepaid,
        amounts: borrowedAmountsToBeRepaid,
        cTokens: collateralAssets,
      });

      const borrowedBalancesAfter = (await compoundDebtPosition.getDebtAssets.call()).amounts_[0];
      const vaultBalanceAfter = await dai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was removed from the VaultProxy
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(borrowedAmountsToBeRepaid[0]);

      // Accept a small deviation from the expected value, given that borrow balance changes each block
      const minBorrowedExpectedValue = borrowedBalancesBefore.sub(borrowedAmountsToBeRepaid[0]);
      const maxBorrowedExpectedValue = borrowedBalancesBefore
        .sub(borrowedAmountsToBeRepaid[0])
        .mul(BigNumber.from('10000').add(valueDeviationToleranceBps))
        .div(BigNumber.from('10000'));

      expect(repayBorrowReceipt).toCostAround('309180');

      expect(borrowedBalancesAfter).toBeGteBigNumber(minBorrowedExpectedValue);
      expect(borrowedBalancesAfter).toBeLteBigNumber(maxBorrowedExpectedValue);
    });

    it('works as expected when called to repay borrow by a fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];
      const borrowedAmounts = [lentAmount.div(10)];

      const borrowedAssetsToBeRepaid = [weth.address];
      const borrowedAmountsToBeRepaid = [utils.parseUnits('0.01', await dai.decimals())];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const borrowedBalancesBefore = (await compoundDebtPosition.getDebtAssets.call()).amounts_[0];
      const vaultBalanceBefore = await weth.balanceOf(vaultProxyUsed);

      const repayBorrowReceipt = await repayBorrow({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssetsToBeRepaid,
        amounts: borrowedAmountsToBeRepaid,
        cTokens: collateralAssets,
      });

      const vaultBalanceAfter = await weth.balanceOf(vaultProxyUsed);
      const borrowedBalancesAfter = (await compoundDebtPosition.getDebtAssets.call()).amounts_[0];

      // Assert the correct balance of asset was removed from the VaultProxy
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(borrowedAmountsToBeRepaid[0]);

      // Accept a small deviation from the expected value, given that borrow balance changes each block
      const minBorrowedExpectedValue = borrowedBalancesBefore.sub(borrowedAmountsToBeRepaid[0]);
      const maxBorrowedExpectedValue = borrowedBalancesBefore
        .sub(borrowedAmountsToBeRepaid[0])
        .mul(BigNumber.from('10000').add(valueDeviationToleranceBps))
        .div(BigNumber.from('10000'));

      expect(repayBorrowReceipt).toCostAround('304414');

      expect(borrowedBalancesAfter).toBeGteBigNumber(minBorrowedExpectedValue);
      expect(borrowedBalancesAfter).toBeLteBigNumber(maxBorrowedExpectedValue);
    });

    it('removes asset from borrowedAssets when the full borrowedAmount is repaid', async () => {
      const [fundOwner] = fork.accounts;
      // addCollateral
      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];
      const borrowedAmounts = [lentAmount.div(10)];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      // Send some extra weth to pay interests
      await weth.transfer(vaultProxyUsed, lentAmount);

      const borrowedAssetsStoredBefore = await compoundDebtPosition.getDebtAssets.call();
      const repayAmounts = [borrowedAmounts[0].mul(BigNumber.from('2'))];

      expect(borrowedAssetsStoredBefore.assets_.length).toStrictEqual(1);

      const tokenFromCBorrowedAssetBefore = await compoundDebtPosition.getCTokenFromBorrowedAsset
        .args(borrowedAssets[0])
        .call();
      expect(tokenFromCBorrowedAssetBefore).toMatchAddress(collateralAssets[0]);

      await repayBorrow({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        fundOwner,
        externalPositionProxy: compoundDebtPosition.address,
        assets: borrowedAssets,
        amounts: repayAmounts,
        cTokens: collateralAssets,
      });

      const borrowedAssetsStoredAfter = (await compoundDebtPosition.getDebtAssets.call()).assets_;
      expect(borrowedAssetsStoredAfter.length).toStrictEqual(0);

      const tokenFromCBorrowedAssetAfter = await compoundDebtPosition.getCTokenFromBorrowedAsset
        .args(borrowedAssets[0])
        .call();
      expect(tokenFromCBorrowedAssetAfter).toMatchAddress(constants.AddressZero);
    });
  });
});
