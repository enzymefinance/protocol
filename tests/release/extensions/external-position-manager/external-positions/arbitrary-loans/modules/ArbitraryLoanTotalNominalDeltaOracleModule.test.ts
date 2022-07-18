import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ArbitraryLoanTotalNominalDeltaOracleModule,
  ComptrollerLib,
  ExternalPositionManager,
  ManualValueOracleLib,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  ArbitraryLoanPositionLib,
  arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs,
  ITestStandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  arbitraryLoanPositionConfigureLoan,
  assertEvent,
  createArbitraryLoanPosition,
  createNewFund,
  deployManualValueOracle,
  deployProtocolFixture,
  getAssetUnit,
  seedAccount,
} from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

let arbitraryLoanPosition: ArbitraryLoanPositionLib,
  accountingModule: ArbitraryLoanTotalNominalDeltaOracleModule,
  externalPositionManager: ExternalPositionManager;
let manualValueOracle: ManualValueOracleLib;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let fundOwner: SignerWithAddress, borrower: SignerWithAddress, oracleUpdater: SignerWithAddress;
let loanAsset: ITestStandardToken;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner, borrower, oracleUpdater] = fork.accounts;

  accountingModule = fork.deployment.arbitraryLoanTotalNominalDeltaOracleModule;
  externalPositionManager = fork.deployment.externalPositionManager;

  const newFundRes = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

  // Create an oracle for use with this module
  const deployOracleRes = await deployManualValueOracle({
    signer: fundOwner,
    manualValueOracleFactory: fork.deployment.manualValueOracleFactory,
    owner: fundOwner,
    updater: oracleUpdater,
  });
  manualValueOracle = deployOracleRes.proxy;

  // Create an unconfigured arbitrary loan position
  const arbitraryLoanPositionProxy = (
    await createArbitraryLoanPosition({
      comptrollerProxy,
      externalPositionManager,
      signer: fundOwner,
    })
  ).externalPositionProxy;

  arbitraryLoanPosition = new ArbitraryLoanPositionLib(arbitraryLoanPositionProxy, provider);

  // Define common loan params
  loanAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

  // Seed vault and borrower with asset
  const assetUnit = await getAssetUnit(loanAsset);

  await seedAccount({ account: vaultProxy, amount: assetUnit.mul(1000), provider, token: loanAsset });
  await seedAccount({ account: borrower, amount: assetUnit.mul(1000), provider, token: loanAsset });
});

describe('configure', () => {
  it('does not allow an empty oracle', async () => {
    const accountingModuleConfigData = arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs({
      oracle: constants.AddressZero,
      stalenessThreshold: 1,
    });

    await expect(
      arbitraryLoanPositionConfigureLoan({
        comptrollerProxy,
        externalPositionManager,
        signer: fundOwner,
        externalPositionProxy: arbitraryLoanPosition,
        borrower,
        loanAsset,
        amount: 0,
        accountingModule,
        accountingModuleConfigData,
        description: '',
      }),
    ).rejects.toBeRevertedWith('Empty oracle');
  });

  it('happy path', async () => {
    const stalenessThreshold = 1000;

    const accountingModuleConfigData = arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs({
      oracle: manualValueOracle,
      stalenessThreshold,
    });

    // No borrowable amount yet
    const receipt = await arbitraryLoanPositionConfigureLoan({
      comptrollerProxy,
      externalPositionManager,
      signer: fundOwner,
      externalPositionProxy: arbitraryLoanPosition,
      borrower,
      loanAsset,
      amount: 0,
      accountingModule,
      accountingModuleConfigData,
      description: '',
    });

    // Assert the oracle and threshold are set correctly
    expect(await accountingModule.getOracleInfoForLoan(arbitraryLoanPosition)).toMatchFunctionOutput(
      accountingModule.getOracleInfoForLoan,
      {
        oracle: manualValueOracle,
        stalenessThreshold,
      },
    );

    // Assert event
    assertEvent(receipt, accountingModule.abi.getEvent('OracleSetForLoan'), {
      loan: arbitraryLoanPosition,
      oracle: manualValueOracle,
      stalenessThreshold,
    });

    expect(receipt).toMatchInlineGasSnapshot('212604');
  });
});

describe('preReconcile', () => {
  it.todo('correctly returns the full repay amount');
});

describe('preRepay', () => {
  it('correctly parses the max repay amount', async () => {
    const accountingModuleConfigData = arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs({
      oracle: manualValueOracle,
      stalenessThreshold: 0,
    });

    await arbitraryLoanPositionConfigureLoan({
      comptrollerProxy,
      externalPositionManager,
      signer: fundOwner,
      externalPositionProxy: arbitraryLoanPosition,
      borrower,
      loanAsset,
      amount: await loanAsset.balanceOf(vaultProxy),
      accountingModule,
      accountingModuleConfigData,
      description: '',
    });

    // Borrow a bit, repay a bit
    const borrowableAmount = await arbitraryLoanPosition.getBorrowableAmount();
    const borrowAmount = borrowableAmount.div(4);
    const repayAmount = borrowAmount.div(4);

    await arbitraryLoanPosition.connect(borrower).borrow(borrowAmount);
    await loanAsset.connect(borrower).approve(arbitraryLoanPosition, constants.MaxUint256);
    await arbitraryLoanPosition.connect(borrower).repay(repayAmount);

    // Give oracle a positive value
    const oracleValue = BigNumber.from(123);
    await manualValueOracle.connect(oracleUpdater).updateValue(oracleValue);

    const expectedLoanBalance = borrowAmount.add(oracleValue).sub(repayAmount);
    expect(expectedLoanBalance).toBeGtBigNumber(0);

    const preTxTotalRepaid = await arbitraryLoanPosition.getTotalRepaid();

    // Repay max
    await arbitraryLoanPosition.connect(borrower).repay(constants.MaxUint256);

    // Repaying max should result in the exact loan balance being repaid
    expect(await arbitraryLoanPosition.getTotalRepaid()).toEqBigNumber(preTxTotalRepaid.add(expectedLoanBalance));
  });
});

describe('position value', () => {
  it('does not allow a stale rate, unless the oracle value is 0', async () => {
    const stalenessThreshold = 1000;

    const accountingModuleConfigData = arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs({
      oracle: manualValueOracle,
      stalenessThreshold,
    });

    await arbitraryLoanPositionConfigureLoan({
      comptrollerProxy,
      externalPositionManager,
      signer: fundOwner,
      externalPositionProxy: arbitraryLoanPosition,
      borrower,
      loanAsset,
      amount: await loanAsset.balanceOf(vaultProxy),
      accountingModule,
      accountingModuleConfigData,
      description: '',
    });

    // Warp beyond staleness threshold
    await provider.send('evm_increaseTime', [stalenessThreshold + 1]);
    await provider.send('evm_mine', []);

    // Querying rate should still pass as value is 0
    await arbitraryLoanPosition.connect(fundOwner).getManagedAssets();

    // Update oracle to a positive value
    await manualValueOracle.connect(oracleUpdater).updateValue(1);

    // Warp beyond staleness threshold
    await provider.send('evm_increaseTime', [stalenessThreshold + 1]);
    await provider.send('evm_mine', []);

    await expect(arbitraryLoanPosition.connect(fundOwner).getManagedAssets()).rejects.toBeRevertedWith('Stale oracle');
  });

  it('happy path', async () => {
    const stalenessThreshold = 1000;

    const accountingModuleConfigData = arbitraryLoanTotalNominalDeltaOracleModuleConfigArgs({
      oracle: manualValueOracle,
      stalenessThreshold,
    });

    await arbitraryLoanPositionConfigureLoan({
      comptrollerProxy,
      externalPositionManager,
      signer: fundOwner,
      externalPositionProxy: arbitraryLoanPosition,
      borrower,
      loanAsset,
      amount: await loanAsset.balanceOf(vaultProxy),
      accountingModule,
      accountingModuleConfigData,
      description: '',
    });

    // Create a borrowable amount, borrow a bit, repay a bit
    const borrowableAmount = await arbitraryLoanPosition.getBorrowableAmount();
    const partialBorrowAmount = borrowableAmount.div(4);
    const partialRepayAmount = partialBorrowAmount.div(4);

    await arbitraryLoanPosition.connect(borrower).borrow(partialBorrowAmount);
    await loanAsset.connect(borrower).approve(arbitraryLoanPosition, constants.MaxUint256);
    await arbitraryLoanPosition.connect(borrower).repay(partialRepayAmount);

    // Assert value with oracle at zero
    const valueWithOracleAtZero = borrowableAmount.sub(partialRepayAmount);
    expect(await arbitraryLoanPosition.getManagedAssets.call()).toMatchFunctionOutput(
      arbitraryLoanPosition.getManagedAssets,
      {
        assets_: [loanAsset],
        amounts_: [valueWithOracleAtZero],
      },
    );

    // Assert value with oracle at positive value
    const oracleAbsValue = BigNumber.from(123);
    await manualValueOracle.connect(oracleUpdater).updateValue(oracleAbsValue);

    expect(await arbitraryLoanPosition.getManagedAssets.call()).toMatchFunctionOutput(
      arbitraryLoanPosition.getManagedAssets,
      {
        assets_: [loanAsset],
        amounts_: [valueWithOracleAtZero.add(oracleAbsValue)],
      },
    );

    // Assert value with oracle at negative value
    await manualValueOracle.connect(oracleUpdater).updateValue(-oracleAbsValue);

    expect(await arbitraryLoanPosition.getManagedAssets.call()).toMatchFunctionOutput(
      arbitraryLoanPosition.getManagedAssets,
      {
        assets_: [loanAsset],
        amounts_: [valueWithOracleAtZero.sub(oracleAbsValue)],
      },
    );

    // Assert value with oracle at very large negative value (full original borrowable amount)
    await manualValueOracle.connect(oracleUpdater).updateValue(-borrowableAmount);

    const remainingBorrowableAmount = await arbitraryLoanPosition.getBorrowableAmount();

    expect(await arbitraryLoanPosition.getManagedAssets.call()).toMatchFunctionOutput(
      arbitraryLoanPosition.getManagedAssets,
      {
        assets_: [loanAsset],
        amounts_: [remainingBorrowableAmount],
      },
    );
  });
});
