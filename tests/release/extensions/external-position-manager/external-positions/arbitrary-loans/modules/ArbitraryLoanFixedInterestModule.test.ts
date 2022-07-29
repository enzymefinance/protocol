import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ArbitraryLoanFixedInterestModule,
  ComptrollerLib,
  ExternalPositionManager,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  arbitraryLoanFixedInterestModuleConfigArgs,
  ArbitraryLoanFixedInterestModuleRepaymentTrackingType,
  arbitraryLoanInterestConvertRateToScaledPerSecondRate,
  ArbitraryLoanPositionLib,
  arbitraryLoanScaledPerSecondInterestDue,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  ONE_PERCENT_IN_WEI,
  ONE_YEAR_IN_SECONDS,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  arbitraryLoanPositionConfigureLoan,
  assertEvent,
  createArbitraryLoanPosition,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  setAccountBalance,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

let arbitraryLoanPosition: ArbitraryLoanPositionLib,
  accountingModule: ArbitraryLoanFixedInterestModule,
  externalPositionManager: ExternalPositionManager;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let fundOwner: SignerWithAddress, borrower: SignerWithAddress;
let loanAsset: ITestStandardToken, loanAssetUnit: BigNumber;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner, borrower] = fork.accounts;

  accountingModule = fork.deployment.arbitraryLoanFixedInterestModule;
  externalPositionManager = fork.deployment.externalPositionManager;

  const newFundRes = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

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
  loanAssetUnit = await getAssetUnit(loanAsset);

  await setAccountBalance({ account: vaultProxy, amount: loanAssetUnit.mul(1000), provider, token: loanAsset });
  await setAccountBalance({ account: borrower, amount: loanAssetUnit.mul(1000), provider, token: loanAsset });
});

describe('configure', () => {
  it('does not allow invalid maturity date or a different post-maturity rate without setting a maturity date', async () => {
    const revertMessage = 'Post-maturity rate without valid maturity';

    // Fail: Different rates with no maturity
    const badConfig1 = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: 1,
      scaledPerSecondRatePostMaturity: 0,
      maturity: 0,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.InterestFirst,
      faceValueIsPrincipalOnly: false,
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
        accountingModuleConfigData: badConfig1,
        description: '',
      }),
    ).rejects.toBeRevertedWith(revertMessage);

    // Fail: Maturity in the past
    const badConfig2 = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: 1,
      scaledPerSecondRatePostMaturity: 1,
      maturity: 1,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.InterestFirst,
      faceValueIsPrincipalOnly: false,
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
        accountingModuleConfigData: badConfig2,
        description: '',
      }),
    ).rejects.toBeRevertedWith(revertMessage);

    // Success: Different rates with future maturity
    const goodConfig = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: 1,
      scaledPerSecondRatePostMaturity: 0,
      maturity: (await provider.getBlock('latest')).timestamp + 100,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.InterestFirst,
      faceValueIsPrincipalOnly: false,
    });

    await arbitraryLoanPositionConfigureLoan({
      comptrollerProxy,
      externalPositionManager,
      signer: fundOwner,
      externalPositionProxy: arbitraryLoanPosition,
      borrower,
      loanAsset,
      amount: 0,
      accountingModule,
      accountingModuleConfigData: goodConfig,
      description: '',
    });
  });

  it('does not allow a face value to be principal-only if principal repayment is not tracked', async () => {
    const badConfig = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: 1,
      scaledPerSecondRatePostMaturity: 1,
      maturity: 0,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.None,
      faceValueIsPrincipalOnly: true,
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
        accountingModuleConfigData: badConfig,
        description: '',
      }),
    ).rejects.toBeRevertedWith('Invalid face value config');
  });

  it('happy path', async () => {
    const scaledPerSecondRatePreMaturity = arbitraryLoanInterestConvertRateToScaledPerSecondRate(
      ONE_PERCENT_IN_WEI.mul(10),
    );
    const scaledPerSecondRatePostMaturity = arbitraryLoanInterestConvertRateToScaledPerSecondRate(
      ONE_PERCENT_IN_WEI.mul(20),
    );
    const maturity = ONE_YEAR_IN_SECONDS + (await provider.getBlock('latest')).timestamp;
    const repaymentTrackingType = ArbitraryLoanFixedInterestModuleRepaymentTrackingType.InterestFirst;
    const faceValueIsPrincipalOnly = true;

    const accountingModuleConfigData = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity,
      scaledPerSecondRatePostMaturity,
      maturity,
      repaymentTrackingType,
      faceValueIsPrincipalOnly,
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

    // Assert the config is set correctly
    expect(await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition)).toMatchFunctionOutput(
      accountingModule.getAccountingInfoForLoan,
      {
        totalInterestCached: 0,
        totalInterestCachedTimestamp: 0,
        totalPrincipalRepaid: 0,
        scaledPerSecondRatePreMaturity,
        scaledPerSecondRatePostMaturity,
        maturity,
        repaymentTrackingType,
        faceValueIsPrincipalOnly,
      },
    );

    // Assert event
    assertEvent(receipt, accountingModule.abi.getEvent('ConfigSetForLoan'), {
      loan: arbitraryLoanPosition,
      scaledPerSecondRatePreMaturity,
      scaledPerSecondRatePostMaturity,
      maturity,
      repaymentTrackingType,
      faceValueIsPrincipalOnly,
    });

    expect(receipt).toMatchInlineGasSnapshot('242168');
  });
});

describe('preReconcile', () => {
  it.todo('add coverage');
});

describe('preRepay', () => {
  const borrowAmount = BigNumber.from(123);

  beforeEach(async () => {
    // Set rates to 0 for simplicity
    const accountingModuleConfigData = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: 0,
      scaledPerSecondRatePostMaturity: 0,
      maturity: 0,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.None,
      faceValueIsPrincipalOnly: false,
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

    // Borrow some
    await arbitraryLoanPosition.connect(borrower).borrow(borrowAmount);

    // Pre-approve repayments from borrower
    await loanAsset.connect(borrower).approve(arbitraryLoanPosition, constants.MaxUint256);
  });

  it('does not allow an overpayment', async () => {
    await expect(arbitraryLoanPosition.connect(borrower).repay(borrowAmount.add(1))).rejects.toBeRevertedWith(
      'Overpayment',
    );
  });

  it('correctly parses the max repay amount', async () => {
    const preTxTotalRepaid = await arbitraryLoanPosition.getTotalRepaid();

    await arbitraryLoanPosition.connect(borrower).repay(constants.MaxUint256);

    expect(await arbitraryLoanPosition.getTotalRepaid()).toEqBigNumber(preTxTotalRepaid.add(borrowAmount));
  });
});

describe('interest accrual (checkpoints and loan balance calcs)', () => {
  it('happy path: borrow, repay, and different pre- and post-maturity rates', async () => {
    // Maturity = +1 year
    // Checkpoint halfway to maturity (6 mos)
    // Checkpoint at 2x maturity (2 year)

    const maturity = ONE_YEAR_IN_SECONDS + (await provider.getBlock('latest')).timestamp;
    const scaledPerSecondRatePreMaturity = arbitraryLoanInterestConvertRateToScaledPerSecondRate(
      ONE_PERCENT_IN_WEI.mul(10),
    );
    const scaledPerSecondRatePostMaturity = arbitraryLoanInterestConvertRateToScaledPerSecondRate(
      ONE_PERCENT_IN_WEI.mul(20),
    );

    const accountingModuleConfigData = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity,
      scaledPerSecondRatePostMaturity,
      maturity,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.None,
      faceValueIsPrincipalOnly: false,
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

    // Pre-approve repayments from borrower
    await loanAsset.connect(borrower).approve(arbitraryLoanPosition, constants.MaxUint256);

    // Use same amount for all borrows
    const borrowAmount = loanAssetUnit.mul(100);

    // Borrow first amount
    const borrow1Receipt = await arbitraryLoanPosition.connect(borrower).borrow(borrowAmount);

    const borrow1Time = await transactionTimestamp(borrow1Receipt);

    // After first borrow, no interest should be cached, but the cache timestamp should be the borrow time
    const postBorrow1AccountingInfo = await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition);
    expect(postBorrow1AccountingInfo.totalInterestCached).toEqBigNumber(0);
    expect(postBorrow1AccountingInfo.totalInterestCachedTimestamp).toEqBigNumber(borrow1Time);

    // Wait 6 months (half of maturity)
    await provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS / 2]);
    await provider.send('evm_mine', []);

    // Expected interest at 6 months
    // % due = 1.10 ^(1/2) - 1 = 4.880884817%
    // base amount = 100 units (total borrowed)
    // interest due = 100 units * 0.0488 = 4.88 units
    const expectedFirstAccruedInterest = arbitraryLoanScaledPerSecondInterestDue({
      scaledPerSecondRate: scaledPerSecondRatePreMaturity,
      secondsSinceLastSettled: (await provider.getBlock('latest')).timestamp - borrow1Time,
      loanBalance: borrowAmount,
    });
    expect(expectedFirstAccruedInterest).toBeAroundBigNumber(4880884, 10);

    const expectedSixMonthLoanBalance = borrowAmount
      .add(expectedFirstAccruedInterest)
      .add(await arbitraryLoanPosition.getBorrowableAmount());

    // Validate pre-checkpoint interest calcs via calcFaceValue()
    expect((await arbitraryLoanPosition.getManagedAssets.call()).amounts_[0]).toEqBigNumber(
      expectedSixMonthLoanBalance,
    );

    // Borrow another amount to actually checkpoint interest
    const borrow2Receipt = await arbitraryLoanPosition.connect(borrower).borrow(borrowAmount);

    const borrow2Time = await transactionTimestamp(borrow2Receipt);

    const postBorrow2AccountingInfo = await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition);

    expect(postBorrow2AccountingInfo.totalInterestCached).toBeAroundBigNumber(expectedFirstAccruedInterest, 10);
    expect(postBorrow2AccountingInfo.totalInterestCachedTimestamp).toEqBigNumber(borrow2Time);

    // Wait 1.5 years (total of 1 year pre-maturity and 1 year post-maturity)
    await provider.send('evm_increaseTime', [ONE_YEAR_IN_SECONDS * 1.5]);
    await provider.send('evm_mine', []);

    // Expected interest for last 1.5 years
    // 1. First six months (pre-maturity)
    // % due = 1.10 ^(1/2) - 1 = 4.880884817%
    // base amount = 204.88 units (inclusive of prev checkpointed interest)
    // interest due = 204.88 units * 0.0488 = 10 units
    // 2. Last year (post-maturity)
    // % due = 1.20 - 1 = 20%
    // base amount = 214.88 units (inclusive of prev checkpointed interest and pre-maturity interest)
    // interest due = 214.88 units * 0.2 = 42.98 units
    // ** total interest due = 10 + 42.98 = 52.98 units
    const totalBorrowAmount = await arbitraryLoanPosition.getTotalBorrowed();
    // Include first accrued interest in loanBalance calc
    const expectedSecondAccruedInterestPreMaturity = arbitraryLoanScaledPerSecondInterestDue({
      scaledPerSecondRate: scaledPerSecondRatePreMaturity,
      secondsSinceLastSettled: maturity - borrow2Time,
      loanBalance: totalBorrowAmount.add(expectedFirstAccruedInterest),
    });
    // Include first accrued interest and second pre-maturity interest in loanBalance calc
    const expectedSecondAccruedInterestPostMaturity = arbitraryLoanScaledPerSecondInterestDue({
      scaledPerSecondRate: scaledPerSecondRatePostMaturity,
      secondsSinceLastSettled: (await provider.getBlock('latest')).timestamp - maturity,
      loanBalance: totalBorrowAmount.add(expectedFirstAccruedInterest).add(expectedSecondAccruedInterestPreMaturity),
    });
    const expectedSecondAccruedInterest = expectedSecondAccruedInterestPreMaturity.add(
      expectedSecondAccruedInterestPostMaturity,
    );
    expect(expectedSecondAccruedInterest).toBeAroundBigNumber(52976179, 10);

    const totalExpectedAccruedInterest = expectedFirstAccruedInterest.add(expectedSecondAccruedInterest);

    const expectedTwoYearLoanBalance = totalBorrowAmount
      .add(totalExpectedAccruedInterest)
      .add(await arbitraryLoanPosition.getBorrowableAmount());

    // Validate pre-checkpoint interest calcs via calcFaceValue()
    expect((await arbitraryLoanPosition.getManagedAssets.call()).amounts_[0]).toBeAroundBigNumber(
      expectedTwoYearLoanBalance,
      10,
    );

    // Repay partially to actually checkpoint interest
    const repay1Receipt = await arbitraryLoanPosition.connect(borrower).repay(borrowAmount);

    const repay1Time = await transactionTimestamp(repay1Receipt);

    const postRepay1AccountingInfo = await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition);

    expect(postRepay1AccountingInfo.totalInterestCached).toBeAroundBigNumber(totalExpectedAccruedInterest, 10);
    expect(postRepay1AccountingInfo.totalInterestCachedTimestamp).toEqBigNumber(repay1Time);
  });
});

describe('face value and principal repaid', () => {
  it.todo('happy path: RepaymentTrackingType.None');

  it('happy path: RepaymentTrackingType.PrincipalFirst (face value is principal only)', async () => {
    const rate = arbitraryLoanInterestConvertRateToScaledPerSecondRate(ONE_PERCENT_IN_WEI.mul(10));
    const accountingModuleConfigData = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: rate,
      scaledPerSecondRatePostMaturity: rate,
      maturity: 0,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.PrincipalFirst,
      faceValueIsPrincipalOnly: true,
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

    // Pre-approve repayments from borrower
    await loanAsset.connect(borrower).approve(arbitraryLoanPosition, constants.MaxUint256);

    // Borrow
    const borrowAmount = loanAssetUnit.mul(100);
    await arbitraryLoanPosition.connect(borrower).borrow(borrowAmount);

    // After first borrow, no principal is repaid yet
    expect((await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition)).totalPrincipalRepaid).toEqBigNumber(
      0,
    );

    // Wait 1 month to accrue some interest
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 30]);
    await provider.send('evm_mine', []);

    // Repay a very small amount
    const repay1Amount = BigNumber.from(12);
    const repay1Receipt = await arbitraryLoanPosition.connect(borrower).repay(repay1Amount);

    // Repay amount should have been paid from principal
    expect((await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition)).totalPrincipalRepaid).toEqBigNumber(
      repay1Amount,
    );

    assertEvent(repay1Receipt, accountingModule.abi.getEvent('TotalPrincipalRepaidUpdatedForLoan'), {
      loan: arbitraryLoanPosition,
      totalPrincipalRepaid: repay1Amount,
    });

    // Repay another very small amount
    const repay2Amount = BigNumber.from(13);
    const repay2Receipt = await arbitraryLoanPosition.connect(borrower).repay(repay2Amount);

    const totalPrincipalRepaid = repay1Amount.add(repay2Amount);

    expect((await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition)).totalPrincipalRepaid).toEqBigNumber(
      totalPrincipalRepaid,
    );

    assertEvent(repay2Receipt, accountingModule.abi.getEvent('TotalPrincipalRepaidUpdatedForLoan'), {
      loan: arbitraryLoanPosition,
      totalPrincipalRepaid,
    });

    // Loan balance should be the unpaid principal only (plus borrowable amount)
    const remainingBorrowableAmount = await arbitraryLoanPosition.getBorrowableAmount();
    const totalBorrowed = await arbitraryLoanPosition.getTotalBorrowed();
    expect((await arbitraryLoanPosition.getManagedAssets.call()).amounts_[0]).toBeAroundBigNumber(
      remainingBorrowableAmount.add(totalBorrowed).sub(totalPrincipalRepaid),
    );

    // Pay remainder of amount due
    await arbitraryLoanPosition.connect(borrower).repay(constants.MaxUint256);

    // Total principal repaid should be the total borrowed amount
    expect((await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition)).totalPrincipalRepaid).toEqBigNumber(
      totalBorrowed,
    );

    // Position value should be the borrowable amount only
    expect((await arbitraryLoanPosition.getManagedAssets.call()).amounts_[0]).toBeAroundBigNumber(
      remainingBorrowableAmount,
    );
  });

  it('happy path: RepaymentTrackingType.InterestFirst (face value is full loan value)', async () => {
    const rate = arbitraryLoanInterestConvertRateToScaledPerSecondRate(ONE_PERCENT_IN_WEI.mul(10));
    const accountingModuleConfigData = arbitraryLoanFixedInterestModuleConfigArgs({
      scaledPerSecondRatePreMaturity: rate,
      scaledPerSecondRatePostMaturity: rate,
      maturity: 0,
      repaymentTrackingType: ArbitraryLoanFixedInterestModuleRepaymentTrackingType.InterestFirst,
      faceValueIsPrincipalOnly: false,
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

    // Pre-approve repayments from borrower
    await loanAsset.connect(borrower).approve(arbitraryLoanPosition, constants.MaxUint256);

    // Borrow
    await arbitraryLoanPosition.connect(borrower).borrow(loanAssetUnit.mul(100));

    // Wait 1 month to accrue some interest
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 30]);
    await provider.send('evm_mine', []);

    // Repay a very small amount (less than any interest due)
    const repay1Amount = BigNumber.from(12);
    await arbitraryLoanPosition.connect(borrower).repay(repay1Amount);

    const postRepay1AccountingInfo = await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition);

    // Principal repaid should be 0
    expect(postRepay1AccountingInfo.totalPrincipalRepaid).toEqBigNumber(0);

    const totalInterestAccrued = postRepay1AccountingInfo.totalInterestCached;

    // Pay back more than the interest accrued
    const repay2Amount = totalInterestAccrued.mul(3);
    await arbitraryLoanPosition.connect(borrower).repay(repay2Amount);

    // Principal repaid should be the diff of accrued interest and the repay amount
    // (with buffer given for interest accrued during new blocks)
    expect(
      (await accountingModule.getAccountingInfoForLoan(arbitraryLoanPosition)).totalPrincipalRepaid,
    ).toBeAroundBigNumber(repay2Amount.sub(totalInterestAccrued), 100);
  });
});

describe('position value', () => {
  it.todo('any missing coverage');
});
