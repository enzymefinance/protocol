import { randomAddress } from '@enzymefinance/ethers';
import {
  CompoundDebtPositionLib,
  ComptrollerLib,
  ITestCERC20,
  ITestCompoundComptroller,
  ITestStandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  assertExternalPositionAssetsToReceive,
  compoundDebtPositionAddCollateral,
  compoundDebtPositionBorrow,
  compoundDebtPositionClaimComp,
  compoundDebtPositionRemoveCollateral,
  compoundDebtPositionRepayBorrow,
  compoundLend,
  createCompoundDebtPosition,
  createNewFund,
  deployProtocolFixture,
  increaseAccountBalance,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let vaultProxyUsed: VaultLib;
let comptrollerProxyUsed: ComptrollerLib;
let compoundDebtPosition: CompoundDebtPositionLib;
let dai: ITestStandardToken;
let weth: ITestStandardToken;
let cdai: ITestCERC20;
let ceth: ITestCERC20;

const valueDeviationToleranceBps = BigNumber.from('1');
const lentAmount = utils.parseEther('1');

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  const [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner as SignerWithAddress,
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = new ComptrollerLib(comptrollerProxy.address, provider);

  const vaultUsed = new VaultLib(vaultProxy.address, provider);

  await createCompoundDebtPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    signer: fundOwner,
  });

  const compoundDebtPositionProxyAddress = (await vaultUsed.getActiveExternalPositions())[0];

  compoundDebtPosition = new CompoundDebtPositionLib(compoundDebtPositionProxyAddress, provider);

  cdai = new ITestCERC20(fork.config.compound.ctokens.cdai, provider);
  ceth = new ITestCERC20(fork.config.compound.ceth, provider);

  dai = new ITestStandardToken(fork.config.primitives.dai, provider);
  weth = new ITestStandardToken(fork.config.weth, provider);

  // This will skip re-adding the denomination asset but will seed the vaultProxy
  await addNewAssetsToFund({
    provider,
    amounts: [lentAmount, lentAmount],
    assets: [weth, dai],
    comptrollerProxy,
    integrationManager: fork.deployment.integrationManager,
    signer: fundOwner,
  });

  // Lend assets to Compound, receive cTokens at VaultProxy
  await compoundLend({
    cToken: cdai,
    cTokenAmount: 1,
    compoundAdapter: fork.deployment.compoundAdapter,
    comptrollerProxy,
    fundOwner,
    integrationManager: fork.deployment.integrationManager,
    tokenAmount: lentAmount,
  });

  await compoundLend({
    cToken: new ITestCERC20(fork.config.compound.ceth, provider),
    cTokenAmount: 1,
    compoundAdapter: fork.deployment.compoundAdapter,
    comptrollerProxy,
    fundOwner,
    integrationManager: fork.deployment.integrationManager,
    tokenAmount: lentAmount,
  });
});

describe('receiveCallFromVault', () => {
  it('reverts when it is called from an account different than vault', async () => {
    await expect(compoundDebtPosition.receiveCallFromVault.args(utils.randomBytes(0)).call()).rejects.toBeRevertedWith(
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
      await compoundDebtPositionAddCollateral({
        amounts: [collateralAmounts[0].div(2)],
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const addCollateralReceipt = await compoundDebtPositionAddCollateral({
        amounts: [collateralAmounts[0].div(2)],
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
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

      assertExternalPositionAssetsToReceive({
        receipt: addCollateralReceipt,
        assets: [],
      });

      expect(addCollateralReceipt).toMatchInlineGasSnapshot(`237402`);

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();

      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        amounts_: collateralAmounts,
        assets_: collateralAssets,
      });
    });

    it('works as expected when called to addCollateral by a Fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [ceth.address];

      const externalPositionBalanceBefore = await ceth.balanceOf(compoundDebtPosition.address);
      const vaultBalanceBefore = await ceth.balanceOf(vaultProxyUsed);

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const externalPositionBalanceAfter = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await ceth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the vaultProxy to the externalPosition
      expect(externalPositionBalanceAfter.sub(externalPositionBalanceBefore)).toEqBigNumber(collateralAmounts[0]);
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).toEqBigNumber(collateralAmounts[0]);

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();

      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        amounts_: collateralAmounts,
        assets_: collateralAssets,
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

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const externalPositionBalanceBefore = await cdai.balanceOf(compoundDebtPosition);
      const vaultBalanceBefore = await cdai.balanceOf(vaultProxyUsed);

      const removeCollateralReceipt = await compoundDebtPositionRemoveCollateral({
        amounts: collateralAmountsToBeRemoved,
        assets: collateralAssetsToBeRemoved,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition,
        fundOwner,
      });

      const externalPositionBalanceAfter = await cdai.balanceOf(compoundDebtPosition);
      const vaultBalanceAfter = await cdai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of collateral was moved from the externalPosition to the vaultProxy
      expect(externalPositionBalanceBefore.sub(externalPositionBalanceAfter)).toEqBigNumber(
        collateralAmountsToBeRemoved[0],
      );
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(collateralAmountsToBeRemoved[0]);

      assertExternalPositionAssetsToReceive({
        receipt: removeCollateralReceipt,
        assets: collateralAssetsToBeRemoved,
      });

      expect(removeCollateralReceipt).toMatchInlineGasSnapshot(`278707`);

      const getManagedAssetsCall = await compoundDebtPosition.getManagedAssets.call();

      expect(getManagedAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        amounts_: [collateralAmounts[0].sub(collateralAmountsToBeRemoved[0])],
        assets_: collateralAssets,
      });
    });

    it('works as expected when called to remove collateral by a Fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [ceth.address];

      const collateralAssetsToBeRemoved = [ceth.address];
      const collateralAmountsToBeRemoved = [BigNumber.from('10')];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const externalPositionBalanceBefore = await ceth.balanceOf(compoundDebtPosition);
      const vaultBalanceBefore = await ceth.balanceOf(vaultProxyUsed);

      await compoundDebtPositionRemoveCollateral({
        amounts: collateralAmountsToBeRemoved,
        assets: collateralAssetsToBeRemoved,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
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
        amounts_: [collateralAmounts[0].sub(collateralAmountsToBeRemoved[0])],
        assets_: collateralAssets,
      });
    });

    it('removes asset from collateralAssets when the full collateralAmount is removed', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const collateralAssetsStoredBefore = (await compoundDebtPosition.getManagedAssets.call()).assets_;

      expect(collateralAssetsStoredBefore.length).toStrictEqual(1);

      await compoundDebtPositionRemoveCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const collateralAssetsStoredAfter = (await compoundDebtPosition.getManagedAssets.call()).assets_;

      expect(collateralAssetsStoredAfter.length).toStrictEqual(0);
    });

    it('reverts when the removed asset has not been added as collateral', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [BigNumber.from('1000')];
      const collateralAssets = [cdai.address];
      const unaddedCollateralAssets = [weth.address];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const collateralAssetsStoredBefore = (await compoundDebtPosition.getManagedAssets.call()).assets_;

      expect(collateralAssetsStoredBefore.length).toStrictEqual(1);

      const removeCollateralTx = compoundDebtPositionRemoveCollateral({
        amounts: collateralAmounts,
        assets: unaddedCollateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      await expect(removeCollateralTx).rejects.toBeRevertedWith('Asset is not collateral');
    });
  });

  describe('borrowAssets', () => {
    it('does not allow borrowing an unsupported asset', async () => {
      const [fundOwner] = fork.accounts;

      await expect(
        compoundDebtPositionBorrow({
          amounts: [1],
          assets: [randomAddress()],
          cTokens: [fork.config.compound.ctokens.cdai],
          comptrollerProxy: comptrollerProxyUsed,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: compoundDebtPosition.address,
          fundOwner,
          vaultProxy: vaultProxyUsed,
        }),
      ).rejects.toBeRevertedWith('Unsupported asset');
    });

    it('works as expected when called for borrowing by a fund', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const borrowedAssets = [dai.address];

      // Ensure the amount borrowed is much lower than collateral
      const borrowedAmounts = [lentAmount.div(10)];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const vaultBalanceBefore = await dai.balanceOf(vaultProxyUsed);

      const borrowReceipt = await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      const vaultBalanceAfter = await dai.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was received at the vaultProxy
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

      assertExternalPositionAssetsToReceive({
        receipt: borrowReceipt,
        assets: borrowedAssets,
      });

      expect(borrowReceipt).toMatchInlineGasSnapshot(`450832`);

      const getDebtAssetsCall = await compoundDebtPosition.getDebtAssets.call();

      expect(getDebtAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        amounts_: borrowedAmounts,
        assets_: borrowedAssets,
      });
    });

    it('works as expected when called for borrowing by a fund (weth)', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];
      const borrowedAmounts = [lentAmount.div(10)];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const vaultBalanceBefore = await weth.balanceOf(vaultProxyUsed);

      const borrowReceipt = await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      const vaultBalanceAfter = await weth.balanceOf(vaultProxyUsed);

      // Assert the correct balance of asset was received at the vaultProxy
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).toEqBigNumber(borrowedAmounts[0]);

      expect(borrowReceipt).toMatchInlineGasSnapshot(`444642`);

      const getDebtAssetsCall = await compoundDebtPosition.getDebtAssets.call();

      expect(getDebtAssetsCall).toMatchFunctionOutput(compoundDebtPosition.getManagedAssets.fragment, {
        amounts_: borrowedAmounts,
        assets_: borrowedAssets,
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

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const borrowTx = compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: [randomAddress()],
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      await expect(borrowTx).rejects.toBeRevertedWith('Bad token cToken pair');
    });

    it('does not allow an incorrect token/cToken pair as an input ', async () => {
      const [fundOwner] = fork.accounts;

      // addCollateral
      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const borrowedAmounts = [lentAmount.div(10)];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const borrowTx = compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: [fork.config.primitives.bat],
        cTokens: [cdai.address],
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      await expect(borrowTx).rejects.toBeRevertedWith('Bad token cToken pair');
    });

    it('does not allow a new cToken for an asset', async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await cdai.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [cdai.address];

      const borrowedAssets = [dai.address];

      // Ensure the amount borrowed is much lower than collateral
      const borrowedAmounts = [lentAmount.div(10)];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      const borrowTx = compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: [randomAddress()],
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      await expect(borrowTx).rejects.toBeRevertedWith('Assets can only be borrowed from one cToken');
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

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      // Warp some time to ensure there is an accruedInterest > 0
      const secondsToWarp = 100000000;

      await provider.send('evm_increaseTime', [secondsToWarp]);
      await provider.send('evm_mine', []);

      const borrowedBalancesBefore = (await compoundDebtPosition.getDebtAssets.call()).amounts_[0];
      const vaultBalanceBefore = await dai.balanceOf(vaultProxyUsed);

      const repayBorrowReceipt = await compoundDebtPositionRepayBorrow({
        amounts: borrowedAmountsToBeRepaid,
        assets: borrowedAssetsToBeRepaid,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
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

      assertExternalPositionAssetsToReceive({
        receipt: repayBorrowReceipt,
        assets: [],
      });

      expect(repayBorrowReceipt).toMatchInlineGasSnapshot(`294407`);

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

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      const borrowedBalancesBefore = (await compoundDebtPosition.getDebtAssets.call()).amounts_[0];
      const vaultBalanceBefore = await weth.balanceOf(vaultProxyUsed);

      const repayBorrowReceipt = await compoundDebtPositionRepayBorrow({
        amounts: borrowedAmountsToBeRepaid,
        assets: borrowedAssetsToBeRepaid,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
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

      expect(repayBorrowReceipt).toMatchInlineGasSnapshot(`282543`);

      expect(borrowedBalancesAfter).toBeGteBigNumber(minBorrowedExpectedValue);
      expect(borrowedBalancesAfter).toBeLteBigNumber(maxBorrowedExpectedValue);
    });

    it('works as expected (full amount repaid)', async () => {
      const [fundOwner] = fork.accounts;
      // addCollateral
      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];
      const borrowedAmounts = [lentAmount.div(10)];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      // Send some extra weth to pay interests
      await increaseAccountBalance({ account: vaultProxyUsed, amount: lentAmount, provider, token: weth });

      const borrowedAssetsStoredBefore = await compoundDebtPosition.getDebtAssets.call();
      const repayAmounts = [constants.MaxUint256];

      expect(borrowedAssetsStoredBefore.assets_.length).toStrictEqual(1);

      const tokenFromCBorrowedAssetBefore = await compoundDebtPosition.getCTokenFromBorrowedAsset
        .args(borrowedAssets[0])
        .call();

      expect(tokenFromCBorrowedAssetBefore).toMatchAddress(collateralAssets[0]);

      await compoundDebtPositionRepayBorrow({
        amounts: repayAmounts,
        assets: borrowedAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      const borrowedAssetsStoredAfter = (await compoundDebtPosition.getDebtAssets.call()).assets_;

      expect(borrowedAssetsStoredAfter.length).toStrictEqual(0);

      const tokenFromCBorrowedAssetAfter = await compoundDebtPosition.getCTokenFromBorrowedAsset
        .args(borrowedAssets[0])
        .call();

      expect(tokenFromCBorrowedAssetAfter).toMatchAddress(constants.AddressZero);
    });
  });

  describe('claimComp', () => {
    beforeEach(async () => {
      const [fundOwner] = fork.accounts;

      const collateralAmounts = [await ceth.balanceOf.args(vaultProxyUsed).call()];
      const collateralAssets = [ceth.address];

      const borrowedAssets = [weth.address];
      const borrowedAmounts = [lentAmount.div(10)];

      await compoundDebtPositionAddCollateral({
        amounts: collateralAmounts,
        assets: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
      });

      await compoundDebtPositionBorrow({
        amounts: borrowedAmounts,
        assets: borrowedAssets,
        cTokens: collateralAssets,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });
    });

    it('works as expected when called to claim existing unclaimed rewards', async () => {
      const [fundOwner] = fork.accounts;

      const compToken = new ITestStandardToken(fork.config.primitives.comp, provider);

      const secondsToWarp = 100000000;

      await provider.send('evm_increaseTime', [secondsToWarp]);
      await provider.send('evm_mine', []);

      const compVaultBalanceBefore = await compToken.balanceOf(vaultProxyUsed);
      const compExternalPositionBalanceBefore = await compToken.balanceOf(compoundDebtPosition.address);

      const claimReceipt = await compoundDebtPositionClaimComp({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      const compVaultBalanceAfter = await compToken.balanceOf(vaultProxyUsed);
      const compExternalPositionBalanceAfter = await compToken.balanceOf(compoundDebtPosition.address);

      assertExternalPositionAssetsToReceive({
        receipt: claimReceipt,
        assets: [compToken.address],
      });

      expect(compVaultBalanceBefore).toEqBigNumber(0);
      expect(compExternalPositionBalanceBefore).toEqBigNumber(0);
      expect(compVaultBalanceAfter).toBeGtBigNumber(0);
      expect(compExternalPositionBalanceAfter).toEqBigNumber(0);
    });

    it('works as expected when called to claim existing unclaimed rewards from a third party address', async () => {
      const [fundOwner] = fork.accounts;

      const compoundComptrollerAddress = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

      const compoundComptroller = new ITestCompoundComptroller(compoundComptrollerAddress, fork.deployer);

      const compToken = new ITestStandardToken(fork.config.primitives.comp, provider);

      const secondsToWarp = 100000000;

      await provider.send('evm_increaseTime', [secondsToWarp]);
      await provider.send('evm_mine', []);

      await compoundComptroller.claimComp(compoundDebtPosition.address);

      const compVaultBalanceBefore = await compToken.balanceOf(vaultProxyUsed);
      const compExternalPositionBalanceBefore = await compToken.balanceOf(compoundDebtPosition.address);

      await compoundDebtPositionClaimComp({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: compoundDebtPosition.address,
        fundOwner,
        vaultProxy: vaultProxyUsed,
      });

      const compVaultBalanceAfter = await compToken.balanceOf(vaultProxyUsed);
      const compExternalPositionBalanceAfter = await compToken.balanceOf(compoundDebtPosition.address);

      expect(compVaultBalanceBefore).toEqBigNumber(0);
      expect(compExternalPositionBalanceBefore).toBeGtBigNumber(0);
      expect(compVaultBalanceAfter).toBeGtBigNumber(0);
      expect(compExternalPositionBalanceAfter).toEqBigNumber(0);
    });
  });
});
