import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  encodeArgs,
  ITestNotionalV2Router,
  notionalV2EncodeBorrowTradeType,
  notionalV2EncodeLendTradeType,
  NotionalV2PositionActionId,
  NotionalV2PositionLib,
  ONE_DAY_IN_SECONDS,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  callOnExternalPosition,
  createNewFund,
  createNotionalV2Position,
  deployProtocolFixture,
  getAssetUnit,
  NotionalV2CurrencyId,
  notionalV2GetActiveMarketArraySlot,
  NotionalV2MarketIndex,
  notionalV2PositionAddCollateral,
  notionalV2PositionBorrow,
  notionalV2PositionLend,
  notionalV2PositionRedeem,
  seedAccount,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let comptrollerProxyUsed: ComptrollerLib;
let vaultProxyUsed: VaultLib;

let notionalV2Position: NotionalV2PositionLib;

// https://github.dev/notional-finance/contracts-v2/blob/d89be9474e181b322480830501728ea625e853d0/contracts/global/Constants.sol#L95
const fCashAssetType = 1;

let notionalV2Router: ITestNotionalV2Router;
let fundOwner: SignerWithAddress;

let randomSigner: SignerWithAddress;

let fork: ProtocolDeployment;

const fCashUnit = utils.parseUnits('1', 8);

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner, randomSigner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = comptrollerProxy;

  const { externalPositionProxy } = await createNotionalV2Position({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    signer: fundOwner,
  });

  notionalV2Position = new NotionalV2PositionLib(externalPositionProxy, provider);
  notionalV2Router = new ITestNotionalV2Router(fork.config.notional.notionalContract, provider);
});

describe('init', () => {
  it('happy path', async () => {
    const { receipt } = await createNotionalV2Position({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot('461284');
  });
});

describe('addCollateral', () => {
  it('works as expected (erc20)', async () => {
    const collateralAsset = new StandardToken(fork.config.primitives.usdc, provider);
    const collateralCurrencyId = NotionalV2CurrencyId.Usdc;

    const collateralAssetUnit = await getAssetUnit(collateralAsset);
    const collateralAssetRawAmount = BigNumber.from('1000');
    const collateralAssetAmount = collateralAssetRawAmount.mul(collateralAssetUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: collateralAssetAmount.mul(10),
      provider,
      token: collateralAsset,
    });

    const addCollateralReceipt = await notionalV2PositionAddCollateral({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: collateralCurrencyId,
      collateralAssetAmount,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      signer: fundOwner,
    });

    const accountBalanceAfter = await notionalV2Router.getAccountBalance
      .args(collateralCurrencyId, notionalV2Position)
      .call();

    // Check account balances
    expect(accountBalanceAfter.cashBalance_).toBeGtBigNumber(0);
    expect(addCollateralReceipt).toMatchInlineGasSnapshot('427813');
  });

  it('works as expected (weth)', async () => {
    const collateralAsset = new StandardToken(fork.config.weth, provider);
    const collateralCurrencyId = NotionalV2CurrencyId.Eth;

    const collateralAssetUnit = await getAssetUnit(collateralAsset);
    const collateralAssetRawAmount = BigNumber.from('10');
    const collateralAssetAmount = collateralAssetRawAmount.mul(collateralAssetUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: collateralAssetAmount.mul(10),
      provider,
      token: collateralAsset,
    });

    const addCollateralReceipt = await notionalV2PositionAddCollateral({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: collateralCurrencyId,
      collateralAssetAmount,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      signer: fundOwner,
    });

    const accountBalanceAfter = await notionalV2Router.getAccountBalance
      .args(collateralCurrencyId, notionalV2Position)
      .call();

    // Check account balances
    expect(accountBalanceAfter.cashBalance_).toBeGtBigNumber(0);
    expect(addCollateralReceipt).toMatchInlineGasSnapshot('338629');
  });
});

// During all Lend actions, the full fCashAmount will be filled, using only the necessary underlyingAssetAmount (fCashAmount - interest at maturity)
describe('lend', () => {
  it('reverts if a wrong tradeAction is passed at encodedTrade', async () => {
    // Construct a borrow trade to incorrectly pass in with the encoded Lend action args
    const encodedBorrowTrade = notionalV2EncodeBorrowTradeType(1, 1, 0);

    const actionArgs = encodeArgs(['uint16', 'uint256', 'bytes32'], [1, 1, encodedBorrowTrade]);

    await expect(
      callOnExternalPosition({
        actionArgs,
        actionId: NotionalV2PositionActionId.Lend,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: notionalV2Position.address,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Incorrect trade action type');
  });

  it('works as expected (erc20)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const underlyingAssetRawAmount = BigNumber.from('1000');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const fCashAmount = underlyingAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    const lendReceipt = await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Dai,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const activeMarkets = await notionalV2Router.getActiveMarkets.args(NotionalV2CurrencyId.Dai).call();

    expect(portfolioAfter.length).toEqBigNumber(1);

    expect(portfolioAfter[0].currencyId).toEqBigNumber(NotionalV2CurrencyId.Dai);
    expect(portfolioAfter[0].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfter[0].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfter[0].notional).toEqBigNumber(fCashAmount);

    // Underlying token amount should be lower at the vault after lending
    expect(vaultProxyUnderlyingAssetBalanceAfter).toBeLtBigNumber(vaultProxyUnderlyingAssetBalanceBefore);

    // A slightly lower amount of underlying token should have been used than specified
    expect(vaultProxyUnderlyingAssetBalanceBefore.sub(vaultProxyUnderlyingAssetBalanceAfter)).toBeBetweenBigNumber(
      0,
      underlyingAssetAmount,
    );

    // External position never holds any underlying asset
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(lendReceipt).toMatchInlineGasSnapshot('553877');
  });

  it('works as expected (weth)', async () => {
    const underlyingAsset = new StandardToken(fork.config.weth, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const underlyingAssetRawAmount = BigNumber.from('100');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const fCashAmount = underlyingAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    const lendReceipt = await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Eth,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const activeMarkets = await notionalV2Router.getActiveMarkets.args(NotionalV2CurrencyId.Dai).call();

    expect(portfolioAfter.length).toEqBigNumber(1);

    expect(portfolioAfter[0].currencyId).toEqBigNumber(NotionalV2CurrencyId.Eth);
    expect(portfolioAfter[0].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfter[0].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfter[0].notional).toEqBigNumber(fCashAmount);

    // Underlying token amount should be lower at the vault after lending
    expect(vaultProxyUnderlyingAssetBalanceAfter).toBeLtBigNumber(vaultProxyUnderlyingAssetBalanceBefore);

    // Excess tokens should have been returned to the vault, and the balance diff is lower than the underlyingAssetAmount
    expect(vaultProxyUnderlyingAssetBalanceBefore.sub(vaultProxyUnderlyingAssetBalanceAfter)).toBeLtBigNumber(
      underlyingAssetAmount,
    );

    // External position never holds any underlying asset
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(lendReceipt).toMatchInlineGasSnapshot('512110');
  });

  it('works as expected (repaying debt)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const borrowedAsset = new StandardToken(fork.config.primitives.usdc, provider);

    const lendCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = NotionalV2CurrencyId.Usdc;

    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);
    const borrowedAssetUnit = await getAssetUnit(borrowedAsset);

    // Borrow half of the usdc value lent
    const underlyingAssetRawAmount = BigNumber.from('1000');
    const borrowedAssetRawAmount = underlyingAssetRawAmount.div(2);
    const repaidAssetRawAmount = borrowedAssetRawAmount.div(2);

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);
    const borrowedAssetAmount = borrowedAssetRawAmount.mul(borrowedAssetUnit);
    const repaidAssetAmount = borrowedAssetAmount.div(2);

    const lendAmount = underlyingAssetRawAmount.mul(fCashUnit);
    const borrowAmount = borrowedAssetRawAmount.mul(fCashUnit);
    const repayAmount = repaidAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });
    await seedAccount({
      account: vaultProxyUsed,
      amount: borrowedAssetAmount.mul(10),
      provider,
      token: borrowedAsset,
    });

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: lendAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    // Repay half of the debt
    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: repayAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount: repaidAssetAmount,
    });

    const portfolioAfterRepayHalf = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const activeMarkets = await notionalV2Router.getActiveMarkets.args(NotionalV2CurrencyId.Dai).call();

    expect(portfolioAfterRepayHalf.length).toEqBigNumber(2);

    expect(portfolioAfterRepayHalf[0].currencyId).toEqBigNumber(NotionalV2CurrencyId.Dai);
    expect(portfolioAfterRepayHalf[0].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfterRepayHalf[0].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfterRepayHalf[0].notional).toEqBigNumber(lendAmount);

    expect(portfolioAfterRepayHalf[1].currencyId).toEqBigNumber(NotionalV2CurrencyId.Usdc);
    expect(portfolioAfterRepayHalf[1].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfterRepayHalf[1].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfterRepayHalf[1].notional).toEqBigNumber(-borrowAmount.div(2));

    // Repay the remaining half of the debt
    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: repayAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount: repaidAssetAmount,
    });

    const portfolioAfterRepayFull = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    // Only the collateral should remain
    expect(portfolioAfterRepayFull.length).toEqBigNumber(1);
  });
});

describe('borrow', () => {
  it('reverts if a wrong tradeAction is passed at encodedTrade', async () => {
    // Construct a lend trade to incorrectly pass in with the encoded Borrow action args
    const encodedLendTrade = notionalV2EncodeLendTradeType(1, 1, 0);

    const actionArgs = encodeArgs(['uint16', 'bytes32'], [1, encodedLendTrade]);

    await expect(
      callOnExternalPosition({
        actionArgs,
        actionId: NotionalV2PositionActionId.Borrow,
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: notionalV2Position.address,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Incorrect trade action type');
  });

  it('works as expected (erc20), posting fcash collateral', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const borrowedAsset = new StandardToken(fork.config.primitives.usdc, provider);

    const lendCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = NotionalV2CurrencyId.Usdc;

    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);
    const borrowedAssetUnit = await getAssetUnit(borrowedAsset);

    // Borrow half of the usdc value lent
    const underlyingAssetRawAmount = BigNumber.from('1000');
    const borrowedAssetRawAmount = underlyingAssetRawAmount.div(2);

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);
    const borrowedAssetAmount = borrowedAssetRawAmount.mul(borrowedAssetUnit);

    const lendAmount = underlyingAssetRawAmount.mul(fCashUnit);
    const borrowAmount = borrowedAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: lendAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const vaultProxyBorrowedAssetBalanceBefore = await borrowedAsset.balanceOf(vaultProxyUsed);
    const externalPositionBorrowedAssetBalanceBefore = await borrowedAsset.balanceOf(notionalV2Position);

    const borrowReceipt = await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    const vaultProxyBorrowedAssetBalanceAfter = await borrowedAsset.balanceOf(vaultProxyUsed);
    const externalPositionBorrowedAssetBalanceAfter = await borrowedAsset.balanceOf(notionalV2Position);

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const activeMarkets = await notionalV2Router.getActiveMarkets.args(NotionalV2CurrencyId.Dai).call();

    expect(portfolioAfter.length).toEqBigNumber(2);

    expect(portfolioAfter[0].currencyId).toEqBigNumber(NotionalV2CurrencyId.Dai);
    expect(portfolioAfter[0].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfter[0].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfter[0].notional).toEqBigNumber(lendAmount);

    expect(portfolioAfter[1].currencyId).toEqBigNumber(NotionalV2CurrencyId.Usdc);
    expect(portfolioAfter[1].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfter[1].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfter[1].notional).toEqBigNumber(-borrowAmount);

    // Borrowed token amount should be lower at the vault after lending
    expect(vaultProxyBorrowedAssetBalanceAfter.sub(vaultProxyBorrowedAssetBalanceBefore)).toBeAroundBigNumber(
      borrowedAssetAmount,
      '0.2',
    );
    expect(externalPositionBorrowedAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionBorrowedAssetBalanceBefore).toEqBigNumber(0);

    expect(borrowReceipt).toMatchInlineGasSnapshot('724315');
  });

  it('works as expected (weth), posting erc20 collateral', async () => {
    const collateralAsset = new StandardToken(fork.config.primitives.dai, provider);

    const collateralCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = NotionalV2CurrencyId.Eth;

    const collateralAssetUnit = await getAssetUnit(collateralAsset);

    const collateralAssetRawAmount = BigNumber.from('10000');
    const borrowedAssetRawAmount = BigNumber.from('1');

    const collateralAssetAmount = collateralAssetRawAmount.mul(collateralAssetUnit);

    const borrowAmount = borrowedAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: collateralAssetAmount.mul(10),
      provider,
      token: collateralAsset,
    });

    const borrowReceipt = await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      collateralCurrencyId,
      collateralAssetAmount,
    });

    // Assert correct borrow posted
    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const activeMarkets = await notionalV2Router.getActiveMarkets.args(borrowCurrencyId).call();

    expect(portfolioAfter.length).toEqBigNumber(1);

    expect(portfolioAfter[0].currencyId).toEqBigNumber(borrowCurrencyId);
    expect(portfolioAfter[0].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfter[0].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfter[0].notional).toEqBigNumber(-borrowAmount);

    // Assert collateral correctly posted
    const accountBalanceAfter = await notionalV2Router.getAccountBalance
      .args(collateralCurrencyId, notionalV2Position)
      .call();

    expect(accountBalanceAfter.cashBalance_).toBeGtBigNumber(0);

    expect(borrowReceipt).toMatchInlineGasSnapshot('882045');
  });

  // Posting weth collateral tested in AddCollateral tests

  it('works as expected (partially offsetting fCash loan)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const lendCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = lendCurrencyId;

    const underlyingAssetRawAmount = BigNumber.from('1000');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const lendAmount = underlyingAssetRawAmount.mul(fCashUnit);
    const borrowAmount = lendAmount.add(10);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: lendAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const isBorrowerPositionBefore = await notionalV2Position.isBorrowerPosition();

    const borrowReceipt = await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const activeMarkets = await notionalV2Router.getActiveMarkets.args(NotionalV2CurrencyId.Dai).call();

    const isBorrowerPositionAfter = await notionalV2Position.isBorrowerPosition();

    expect(isBorrowerPositionBefore).toBe(false);
    expect(isBorrowerPositionAfter).toBe(true);

    expect(portfolioAfter.length).toEqBigNumber(1);

    expect(portfolioAfter[0].currencyId).toEqBigNumber(NotionalV2CurrencyId.Dai);
    expect(portfolioAfter[0].maturity).toEqBigNumber(
      activeMarkets[notionalV2GetActiveMarketArraySlot(NotionalV2MarketIndex.SixMonths)].maturity,
    );
    expect(portfolioAfter[0].assetType).toEqBigNumber(fCashAssetType);
    expect(portfolioAfter[0].notional).toEqBigNumber(lendAmount.sub(borrowAmount));

    expect(vaultProxyUnderlyingAssetBalanceAfter).toBeLtBigNumber(vaultProxyUnderlyingAssetBalanceBefore);

    // Excess tokens should have been returned to the vault, and the balance diff is lower than the underlyingAssetAmount
    expect(vaultProxyUnderlyingAssetBalanceBefore.sub(vaultProxyUnderlyingAssetBalanceAfter)).toBeLtBigNumber(
      underlyingAssetAmount,
    );

    // External position never holds any underlying asset
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(borrowReceipt).toMatchInlineGasSnapshot('574554');
  });

  it('works as expected (fully offsetting fCash loan)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const underlyingAssetRawAmount = BigNumber.from('1000');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const lendCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = lendCurrencyId;

    const lendAmount = underlyingAssetRawAmount.mul(fCashUnit);
    const borrowAmount = lendAmount;

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: lendAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const isBorrowerPositionBeforeBorrow = await notionalV2Position.isBorrowerPosition();

    const borrowReceipt = await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    const isBorrowerPositionAfterBorrow = await notionalV2Position.isBorrowerPosition();

    await notionalV2Position.connect(randomSigner).getDebtAssets();

    const isBorrowerPositionAfterGetDebtAssets = await notionalV2Position.isBorrowerPosition();

    expect(isBorrowerPositionBeforeBorrow).toBe(false);
    expect(isBorrowerPositionAfterBorrow).toBe(true);
    expect(isBorrowerPositionAfterGetDebtAssets).toBe(false);

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    expect(portfolioAfter.length).toEqBigNumber(0);

    expect(vaultProxyUnderlyingAssetBalanceAfter).toBeLtBigNumber(vaultProxyUnderlyingAssetBalanceBefore);

    // Excess tokens should have been returned to the vault, and the balance diff is lower than the underlyingAssetAmount
    expect(vaultProxyUnderlyingAssetBalanceBefore.sub(vaultProxyUnderlyingAssetBalanceAfter)).toBeLtBigNumber(
      underlyingAssetAmount,
    );

    // External position never holds any underlying asset
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(borrowReceipt).toMatchInlineGasSnapshot('498653');
  });
});

describe('redeem', () => {
  it('works as expected (partial redemption)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const underlyingAssetRawAmount = BigNumber.from('1000');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const fCashAmount = underlyingAssetRawAmount.mul(fCashUnit);

    const redeemCashAmount = 100;

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Dai,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.ThreeMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    // Wait until maturity settlement to redeem fCash
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 93]);

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    // Not really necessary, but it replicates the conditions we would have before making a redemption
    await notionalV2Router.connect(randomSigner).initializeMarkets(1, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(2, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(3, false);

    await notionalV2Router.connect(randomSigner).settleAccount(notionalV2Position.address);

    const notionalYieldBalanceBefore = await notionalV2Router.getAccountBalance
      .args(NotionalV2CurrencyId.Dai, notionalV2Position)
      .call();

    const redeemReceipt = await notionalV2PositionRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Dai,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      signer: fundOwner,
      yieldTokenAmount: redeemCashAmount,
    });

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const notionalYieldBalanceAfter = await notionalV2Router.getAccountBalance(
      NotionalV2CurrencyId.Dai,
      notionalV2Position,
    );

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    expect(portfolioAfter.length).toEqBigNumber(0);

    const notionalCashBalanceDiff = notionalYieldBalanceBefore.cashBalance_.sub(notionalYieldBalanceAfter.cashBalance_);

    expect(notionalCashBalanceDiff).toEqBigNumber(redeemCashAmount);
    expect(vaultProxyUnderlyingAssetBalanceAfter.sub(vaultProxyUnderlyingAssetBalanceBefore)).toBeGtBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(redeemReceipt).toMatchInlineGasSnapshot('378347');
  });

  it('works as expected (full redemption)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const underlyingAssetRawAmount = BigNumber.from('1000');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const fCashAmount = underlyingAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Dai,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.ThreeMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    // Wait until maturity settlement to redeem fCash
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 93]);

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    // Not really necessary, but it replicates the conditions we would have before making a redemption
    await notionalV2Router.connect(randomSigner).initializeMarkets(1, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(2, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(3, false);

    await notionalV2Router.connect(randomSigner).settleAccount(notionalV2Position.address);

    const notionalYieldBalanceBefore = await notionalV2Router.getAccountBalance(
      NotionalV2CurrencyId.Dai,
      notionalV2Position,
    );

    const redeemReceipt = await notionalV2PositionRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Dai,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      signer: fundOwner,
      yieldTokenAmount: notionalYieldBalanceBefore.cashBalance_,
    });

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const notionalYieldBalanceAfter = await notionalV2Router.getAccountBalance(
      NotionalV2CurrencyId.Dai,
      notionalV2Position,
    );

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    expect(portfolioAfter.length).toEqBigNumber(0);

    expect(notionalYieldBalanceAfter.cashBalance_).toEqBigNumber(0);
    expect(vaultProxyUnderlyingAssetBalanceAfter.sub(vaultProxyUnderlyingAssetBalanceBefore)).toBeGtBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(redeemReceipt).toMatchInlineGasSnapshot('371724');
  });

  it('works as expected (weth)', async () => {
    const underlyingAsset = new StandardToken(fork.config.weth, provider);
    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);

    const underlyingAssetRawAmount = BigNumber.from('100');

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);

    const fCashAmount = underlyingAssetRawAmount.mul(fCashUnit);

    const redeemCashAmount = 100;

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Eth,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.ThreeMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    // Wait until maturity settlement to redeem fCash
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 93]);

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(notionalV2Position);

    // Not really necessary, but it replicates the conditions we would have before making a redemption
    await notionalV2Router.connect(randomSigner).initializeMarkets(1, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(2, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(3, false);

    await notionalV2Router.connect(randomSigner).settleAccount(notionalV2Position.address);

    const notionalYieldBalanceBefore = await notionalV2Router
      .connect(provider)
      .getAccountBalance(NotionalV2CurrencyId.Eth, notionalV2Position);

    const redeemReceipt = await notionalV2PositionRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: NotionalV2CurrencyId.Eth,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      signer: fundOwner,
      yieldTokenAmount: redeemCashAmount,
    });

    const portfolioAfter = await notionalV2Router.getAccountPortfolio(notionalV2Position);

    const notionalYieldBalanceAfter = await notionalV2Router.getAccountBalance(
      NotionalV2CurrencyId.Eth,
      notionalV2Position,
    );

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);
    const externalPositionUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(notionalV2Position);

    expect(portfolioAfter.length).toEqBigNumber(0);

    const notionalCashBalanceDiff = notionalYieldBalanceBefore.cashBalance_.sub(notionalYieldBalanceAfter.cashBalance_);

    expect(notionalCashBalanceDiff).toEqBigNumber(redeemCashAmount);
    expect(vaultProxyUnderlyingAssetBalanceAfter.sub(vaultProxyUnderlyingAssetBalanceBefore)).toBeGtBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceAfter).toEqBigNumber(0);
    expect(externalPositionUnderlyingAssetBalanceBefore).toEqBigNumber(0);

    expect(redeemReceipt).toMatchInlineGasSnapshot('345555');
  });
});

describe('getManagedAssets', () => {
  it('works as expected: one pre-settlement and one post-settlement loan of the same underlying asset (and one borrow to ignore)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const yieldAsset = fork.config.compound.ctokens.cdai;

    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);
    const underlyingAssetAmount = BigNumber.from('1000000').mul(underlyingAssetUnit);

    const lendCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = NotionalV2CurrencyId.Usdc;

    const fCashAmount = BigNumber.from('10000');

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    const vaultProxyUnderlyingAssetBalanceBefore = await underlyingAsset.balanceOf(vaultProxyUsed);

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.ThreeMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const vaultProxyUnderlyingAssetBalanceAfter = await underlyingAsset.balanceOf(vaultProxyUsed);

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: 100,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    // Wait until maturity of the three months loan to redeem fCash
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 93]);

    // Not really necessary, but it replicates the conditions we would have before making a redemption
    await notionalV2Router.connect(randomSigner).initializeMarkets(1, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(2, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(3, false);

    await notionalV2Router.connect(randomSigner).settleAccount(notionalV2Position.address);

    const vaultProxyUnderlyingAssetBalanceDiff = vaultProxyUnderlyingAssetBalanceBefore.sub(
      vaultProxyUnderlyingAssetBalanceAfter,
    );

    const managedAssets = await notionalV2Position.getManagedAssets.call();

    expect(managedAssets.assets_.length).toEqBigNumber(2);

    expect(managedAssets.assets_[0]).toMatchAddress(underlyingAsset.address);
    expect(managedAssets.assets_[1]).toMatchAddress(yieldAsset);

    expect(managedAssets.amounts_[0]).toBeAroundBigNumber(vaultProxyUnderlyingAssetBalanceDiff, '0.03');
    expect(managedAssets.assets_[0]).toBeGtBigNumber(0);
  });
});

describe('getDebtAssets', () => {
  it('works as expected: one pre-settlement and one post-settlement borrow of the same underlying asset (and one lend to ignore)', async () => {
    const underlyingAsset = new StandardToken(fork.config.primitives.dai, provider);
    const borrowedAsset = new StandardToken(fork.config.primitives.usdc, provider);

    const underlyingAssetUnit = await getAssetUnit(underlyingAsset);
    const borrowedAssetUnit = await getAssetUnit(borrowedAsset);

    const lendCurrencyId = NotionalV2CurrencyId.Dai;
    const borrowCurrencyId = NotionalV2CurrencyId.Usdc;

    // Borrow half of the usdc value lent
    const underlyingAssetRawAmount = BigNumber.from('1000');
    const borrowedAssetRawAmount = underlyingAssetRawAmount.div(4);

    const underlyingAssetAmount = underlyingAssetRawAmount.mul(underlyingAssetUnit);
    const borrowedAssetAmount = borrowedAssetRawAmount.mul(borrowedAssetUnit);

    const lendAmount = underlyingAssetRawAmount.mul(fCashUnit);
    const borrowAmount = borrowedAssetRawAmount.mul(fCashUnit);

    await seedAccount({
      account: vaultProxyUsed,
      amount: underlyingAssetAmount.mul(10),
      provider,
      token: underlyingAsset,
    });

    await notionalV2PositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      currencyId: lendCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: lendAmount,
      marketIndex: NotionalV2MarketIndex.ThreeMonths,
      minLendRate: 0,
      signer: fundOwner,
      underlyingAssetAmount,
    });

    const vaultProxyBorrowedAssetBalanceBefore = await borrowedAsset.balanceOf(vaultProxyUsed);

    // Borrow two different maturities, one will settle and be accounted on balances, the other will remain on the portfolio
    await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.ThreeMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    await notionalV2PositionBorrow({
      comptrollerProxy: comptrollerProxyUsed,
      borrowCurrencyId,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: notionalV2Position.address,
      fCashAmount: borrowAmount,
      marketIndex: NotionalV2MarketIndex.SixMonths,
      minLendRate: 0,
      signer: fundOwner,
    });

    const vaultProxyBorrowedAssetBalanceAfter = await borrowedAsset.balanceOf(vaultProxyUsed);

    const vaultProxyUnderlyingAssetBalanceDiff = vaultProxyBorrowedAssetBalanceAfter.sub(
      vaultProxyBorrowedAssetBalanceBefore,
    );

    const debtAssetsBeforeSettlement = await notionalV2Position.getDebtAssets.call();

    expect(debtAssetsBeforeSettlement.assets_.length).toEqBigNumber(1);

    expect(debtAssetsBeforeSettlement.amounts_[0]).toBeAroundBigNumber(vaultProxyUnderlyingAssetBalanceDiff, '0.03');
    expect(debtAssetsBeforeSettlement.assets_[0]).toEqual(borrowedAsset.address);

    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 93]);

    // Not really necessary, but it replicates the conditions we would have before making a redemption
    await notionalV2Router.connect(randomSigner).initializeMarkets(1, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(2, false);
    await notionalV2Router.connect(randomSigner).initializeMarkets(3, false);

    await notionalV2Router.connect(randomSigner).settleAccount(notionalV2Position.address);

    const debtAssets = await notionalV2Position.getDebtAssets.call();

    expect(debtAssets.assets_.length).toEqBigNumber(2);

    expect(debtAssets.amounts_[0]).toBeAroundBigNumber(borrowedAssetAmount, '0.03');
    expect(debtAssets.assets_[0]).toMatchAddress(borrowedAsset.address);
    expect(debtAssets.assets_[1]).toMatchAddress(fork.config.compound.ctokens.cusdc);
    expect(debtAssets.amounts_[1]).toBeGtBigNumber(0);
  });
});
