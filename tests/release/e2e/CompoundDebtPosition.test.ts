import { randomAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { CompoundDebtPosition, ComptrollerLib, ICERC20, StandardToken, VaultLib } from '@enzymefinance/protocol';
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
  createDebtPosition,
  removeCollateral,
  repayBorrow,
} from '../../../packages/testutils/src/scaffolding/extensions/debt-positions';

let vaultProxyUsed: VaultLib;
let comptrollerProxyUsed: ComptrollerLib;
let compoundDebtPosition: CompoundDebtPosition;
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

  // Initialize fund and debt position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.fundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = new ComptrollerLib(comptrollerProxy.address, hre.ethers.provider);

  const vaultUsed = new VaultLib(vaultProxy.address, hre.ethers.provider);

  await createDebtPosition({
    comptrollerProxy,
    debtPositionManager: fork.deployment.debtPositionManager,
    fundOwner,
  });

  const compoundDebtPositionAddress = (await vaultUsed.getActiveDebtPositions.call())[0];
  compoundDebtPosition = new CompoundDebtPosition(compoundDebtPositionAddress, whales.dai);

  cdai = new ICERC20(fork.config.compound.ctokens.cdai, whales.cdai);
  ceth = new ICERC20(fork.config.compound.ceth, whales.ceth);

  dai = new StandardToken(fork.config.primitives.dai, whales.dai);
  weth = new StandardToken(fork.config.weth, whales.weth);

  await addNewAssetsToFund({
    fundOwner,
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.integrationManager,
    trackedAssetsAdapter: fork.deployment.trackedAssetsAdapter,
    assets: [dai],
  });
  await dai.transfer(vaultProxy, lentAmount);
  await weth.transfer(vaultProxy, lentAmount);

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

      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const debtPositionCollateralBalanceBefore = await cdai.balanceOf(compoundDebtPosition.address);
      const vaultProxyCollateralBalanceBefore = await cdai.balanceOf(vaultProxyUsed.address);

      // Add collateral twice to check it does not fail calling markets twice with the same assets
      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: [collateralAmounts[0].div(2)],
        cTokens: collateralAssets,
      });

      const addCollateralReceipt = await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: [collateralAmounts[0].div(2)],
        cTokens: collateralAssets,
      });

      const debtPositionCollateralBalanceAfter = await cdai.balanceOf(compoundDebtPosition);
      const vaultProxyCollateralBalanceAfter = await cdai.balanceOf(vaultProxyUsed.address);

      // Assert the correct balance of collateral was moved from the vaultProxy to the debtPosition
      expect(debtPositionCollateralBalanceAfter.sub(debtPositionCollateralBalanceBefore)).toEqBigNumber(
        collateralAmounts[0],
      );
      expect(vaultProxyCollateralBalanceBefore.sub(vaultProxyCollateralBalanceAfter)).toEqBigNumber(
        collateralAmounts[0],
      );

      // Rounding up from 208946
      expect(addCollateralReceipt).toCostLessThan('209000');

      const getCollateralAssetsCall = await compoundDebtPosition.getCollateralAssets.call();
      expect(getCollateralAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getCollateralAssets.fragment, {
        assets_: collateralAssets,
        amounts_: collateralAmounts,
      });
    });

    it('works as expected when called to addCollateral by a Fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const debtPositionBalanceBefore = await ceth.balanceOf(compoundDebtPosition.address);
      const vaultBalanceBefore = await ceth.balanceOf(vaultProxyUsed);

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const debtPositionBalanceAfter = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await ceth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the vaultProxy to the debtPosition
      expect(debtPositionBalanceAfter.sub(debtPositionBalanceBefore)).toEqBigNumber(collateralAmounts[0]);
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(collateralAmounts[0]);

      const getCollateralAssetsCall = await compoundDebtPosition.getCollateralAssets.call();
      expect(getCollateralAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getCollateralAssets.fragment, {
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const debtPositionBalanceBefore = await cdai.balanceOf(compoundDebtPosition);
      const vaultBalanceBefore = await cdai.balanceOf(vaultProxyUsed);

      const removeCollateralReceipt = await removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssetsToBeRemoved,
        amounts: collateralAmountsToBeRemoved,
        cTokens: collateralAssets,
      });

      const debtPositionBalanceAfter = await cdai.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await cdai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the debtPosition to the vaultProxy
      expect(debtPositionBalanceBefore.sub(debtPositionBalanceAfter)).toEqBigNumber(collateralAmountsToBeRemoved[0]);
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(collateralAmountsToBeRemoved[0]);

      // Rounding up from 268459
      expect(removeCollateralReceipt).toCostLessThan('270000');

      const getCollateralAssetsCall = await compoundDebtPosition.getCollateralAssets.call();
      expect(getCollateralAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getCollateralAssets.fragment, {
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const debtPositionBalanceBefore = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceBefore = await ceth.balanceOf(vaultProxyUsed);

      await removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssetsToBeRemoved,
        amounts: collateralAmountsToBeRemoved,
        cTokens: collateralAssets,
      });

      const debtPositionBalanceAfter = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await ceth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the debtPosition to the vaultProxy
      expect(debtPositionBalanceBefore.sub(debtPositionBalanceAfter)).toEqBigNumber(collateralAmountsToBeRemoved[0]);
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(collateralAmountsToBeRemoved[0]);

      const getCollateralAssetsCall = await compoundDebtPosition.getCollateralAssets.call();
      expect(getCollateralAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getCollateralAssets.fragment, {
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const collateralAssetsStoredBefore = (await compoundDebtPosition.getCollateralAssets.call()).assets_;
      expect(collateralAssetsStoredBefore.length).toStrictEqual(1);

      await removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const collateralAssetsStoredAfter = (await compoundDebtPosition.getCollateralAssets.call()).assets_;
      expect(collateralAssetsStoredAfter.length).toStrictEqual(0);
    });

    it('reverts when the removed asset has not been added as collateral', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];
      const unaddedCollateralAssets = [weth.address];

      await addCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const collateralAssetsStoredBefore = (await compoundDebtPosition.getCollateralAssets.call()).assets_;
      expect(collateralAssetsStoredBefore.length).toStrictEqual(1);

      const removeCollateralTx = removeCollateral({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceBefore = await dai.balanceOf(vaultProxyUsed);

      const borrowReceipt = await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceAfter = await dai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was received at the vaultProxy
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

      // Rounding up from 397260
      expect(borrowReceipt).toCostLessThan('398000');

      const getBorrowedAssetsCall = await compoundDebtPosition.getBorrowedAssets.call();
      expect(getBorrowedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getCollateralAssets.fragment, {
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceBefore = await weth.balanceOf(vaultProxyUsed);

      const borrowReceipt = await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const vaultBalanceAfter = await weth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was received at the vaultProxy
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

      // Rounding up from 404773
      expect(borrowReceipt).toCostLessThan('405000');

      const getBorrowedAssetsCall = await compoundDebtPosition.getBorrowedAssets.call();
      expect(getBorrowedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getCollateralAssets.fragment, {
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: [randomAddress()],
      });

      const borrowTx = borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: [randomAddress()],
      });

      const borrowTx = borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const borrowedBalancesBefore = (await compoundDebtPosition.getBorrowedAssets.call()).amounts_[0];
      const vaultBalanceBefore = await dai.balanceOf(vaultProxyUsed);

      const repayBorrowReceipt = await repayBorrow({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssetsToBeRepaid,
        amounts: borrowedAmountsToBeRepaid,
        cTokens: collateralAssets,
      });

      const borrowedBalancesAfter = (await compoundDebtPosition.getBorrowedAssets.call()).amounts_[0];
      const vaultBalanceAfter = await dai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was removed from the VaultProxy
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(borrowedAmountsToBeRepaid[0]);

      // Accept a small deviation from the expected value, given that borrow balance changes each block
      const minBorrowedExpectedValue = borrowedBalancesBefore.sub(borrowedAmountsToBeRepaid[0]);
      const maxBorrowedExpectedValue = borrowedBalancesBefore
        .sub(borrowedAmountsToBeRepaid[0])
        .mul(BigNumber.from('10000').add(valueDeviationToleranceBps))
        .div(BigNumber.from('10000'));

      // Rounding up from 287678
      expect(repayBorrowReceipt).toCostLessThan('288000');

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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      const borrowedBalancesBefore = (await compoundDebtPosition.getBorrowedAssets.call()).amounts_[0];
      const vaultBalanceBefore = await weth.balanceOf(vaultProxyUsed);

      const repayBorrowReceipt = await repayBorrow({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssetsToBeRepaid,
        amounts: borrowedAmountsToBeRepaid,
        cTokens: collateralAssets,
      });

      const vaultBalanceAfter = await weth.balanceOf(vaultProxyUsed);
      const borrowedBalancesAfter = (await compoundDebtPosition.getBorrowedAssets.call()).amounts_[0];

      // Assert the correct balance of asset was removed from the VaultProxy
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(borrowedAmountsToBeRepaid[0]);

      // Accept a small deviation from the expected value, given that borrow balance changes each block
      const minBorrowedExpectedValue = borrowedBalancesBefore.sub(borrowedAmountsToBeRepaid[0]);
      const maxBorrowedExpectedValue = borrowedBalancesBefore
        .sub(borrowedAmountsToBeRepaid[0])
        .mul(BigNumber.from('10000').add(valueDeviationToleranceBps))
        .div(BigNumber.from('10000'));

      // Rounding up from 276172
      expect(repayBorrowReceipt).toCostLessThan('277000');

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
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: collateralAssets,
        amounts: collateralAmounts,
        cTokens: collateralAssets,
      });

      await borrow({
        comptrollerProxy: comptrollerProxyUsed,
        vaultProxy: vaultProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssets,
        amounts: borrowedAmounts,
        cTokens: collateralAssets,
      });

      // Send some extra weth to pay interests
      await weth.transfer(vaultProxyUsed, lentAmount);

      const borrowedAssetsStoredBefore = await compoundDebtPosition.getBorrowedAssets.call();
      const repayAmounts = [borrowedAmounts[0].mul(BigNumber.from('2'))];

      expect(borrowedAssetsStoredBefore.assets_.length).toStrictEqual(1);

      const tokenFromCBorrowedAssetBefore = await compoundDebtPosition.getCTokenFromBorrowedAsset
        .args(borrowedAssets[0])
        .call();
      expect(tokenFromCBorrowedAssetBefore).toMatchAddress(collateralAssets[0]);

      await repayBorrow({
        comptrollerProxy: comptrollerProxyUsed,
        debtPositionManager: fork.deployment.debtPositionManager,
        fundOwner,
        debtPosition: compoundDebtPosition,
        assets: borrowedAssets,
        amounts: repayAmounts,
        cTokens: collateralAssets,
      });

      const borrowedAssetsStoredAfter = (await compoundDebtPosition.getBorrowedAssets.call()).assets_;
      expect(borrowedAssetsStoredAfter.length).toStrictEqual(0);

      const tokenFromCBorrowedAssetAfter = await compoundDebtPosition.getCTokenFromBorrowedAsset
        .args(borrowedAssets[0])
        .call();
      expect(tokenFromCBorrowedAssetAfter).toMatchAddress(constants.AddressZero);
    });
  });
});
