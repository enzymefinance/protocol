import { sameAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager, VaultLib } from '@enzymefinance/protocol';
import {
  ETH_ADDRESS,
  ITestSolvV2ConvertiblePool,
  ITestSolvV2ConvertibleVoucher,
  ITestSolvV2InitialConvertibleOfferingMarket,
  ITestSolvV2ManualPriceOracle,
  ITestSolvV2PriceOracleManager,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_WEEK_IN_SECONDS,
  SolvV2ConvertibleIssuerPositionLib,
  SolvV2SalePriceType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SolvV2ConvertibleIssuerPositionCreateOfferParams } from '@enzymefinance/testutils';
import {
  assertEvent,
  createNewFund,
  createSolvV2ConvertibleIssuerPosition,
  deployProtocolFixture,
  getAssetUnit,
  impersonateSigner,
  seedAccount,
  solvV2ConvertibleIssuerPositionCreateOffer,
  solvV2ConvertibleIssuerPositionReconcile,
  solvV2ConvertibleIssuerPositionRefund,
  solvV2ConvertibleIssuerPositionRemoveOffer,
  solvV2ConvertibleIssuerPositionWithdraw,
} from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

const voucherUnit = utils.parseUnits('1', 26);

let fundOwner: SignerWithAddress;
let buyer: SignerWithAddress;
let currencyToken: ITestStandardToken;
let currencyUnit: BigNumber;
let underlyingToken: ITestStandardToken;
let underlyingUnit: BigNumber;

let comptrollerProxy: ComptrollerLib;
let externalPositionManager: ExternalPositionManager;
let vaultProxy: VaultLib;
let initialConvertibleOfferingMarket: ITestSolvV2InitialConvertibleOfferingMarket;
let solvV2ConvertibleIssuerPosition: SolvV2ConvertibleIssuerPositionLib;
let solvDeployer: SignerWithAddress;
let voucher: ITestSolvV2ConvertibleVoucher;
let voucherPool: ITestSolvV2ConvertiblePool;

let fork: ProtocolDeployment;

let offerId: BigNumberish;
let startTime: number;
let endTime: number;
let maturity: number;
let timeToMaturity: number;
let highestPrice: BigNumber;
let lowestPrice: BigNumber;
let priceData: BytesLike;
let tokenInAmount: BigNumber;
let slotId: BigNumber;
let createOfferArgs: SolvV2ConvertibleIssuerPositionCreateOfferParams;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner, buyer] = fork.accounts;

  // Initialize fund and external position
  const fund = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = fund.comptrollerProxy;
  vaultProxy = fund.vaultProxy;

  externalPositionManager = fork.deployment.externalPositionManager;

  const { externalPositionProxy } = await createSolvV2ConvertibleIssuerPosition({
    comptrollerProxy,
    externalPositionManager,
    signer: fundOwner,
  });
  solvV2ConvertibleIssuerPosition = new SolvV2ConvertibleIssuerPositionLib(externalPositionProxy, provider);

  // All tests use the USF convertible voucher (except the test for multiple voucher issuance)
  currencyToken = new ITestStandardToken(fork.config.primitives.usdt, provider);
  currencyUnit = await getAssetUnit(currencyToken);
  underlyingToken = new ITestStandardToken(fork.config.unsupportedAssets.usf, provider);
  underlyingUnit = await getAssetUnit(underlyingToken);

  solvDeployer = await impersonateSigner({ provider, signerAddress: fork.config.solvFinanceV2.deployer });
  initialConvertibleOfferingMarket = new ITestSolvV2InitialConvertibleOfferingMarket(
    fork.config.solvFinanceV2.initialConvertibleOfferingMarket,
    solvDeployer,
  );
  voucherPool = new ITestSolvV2ConvertiblePool(fork.config.solvFinanceV2.convertibles.usf.pool, solvDeployer);
  voucher = new ITestSolvV2ConvertibleVoucher(fork.config.solvFinanceV2.convertibles.usf.voucher, provider);

  // Seed the vaultProxy with underlying and currency, and buyer with currency
  const underlyingAmount = underlyingUnit.mul(100_000);
  const currencyAmount = currencyUnit.mul(100_000);
  await seedAccount({ account: buyer, amount: currencyAmount, provider, token: currencyToken });
  await seedAccount({ account: vaultProxy, amount: currencyAmount, provider, token: currencyToken });
  await seedAccount({ account: vaultProxy, amount: underlyingAmount, provider, token: underlyingToken });

  // Approve buyer spend on solv offering market
  await currencyToken.connect(buyer).approve(initialConvertibleOfferingMarket, constants.MaxUint256);

  // Get the next IVO id
  offerId = await initialConvertibleOfferingMarket.nextOfferingId.call();

  // Set the EP as the voucher manager so they can create the Initial Voucher Offering (IVO)
  await initialConvertibleOfferingMarket.setVoucherManager(voucher, [solvV2ConvertibleIssuerPosition], true);

  // Parameters of the IVO
  const { timestamp } = await provider.getBlock('latest');
  startTime = timestamp;
  endTime = timestamp + ONE_DAY_IN_SECONDS;
  timeToMaturity = ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS;
  maturity = timestamp + timeToMaturity;

  // Prices are hardcoded as 8 decimals regardless of currency token
  lowestPrice = utils.parseUnits('0.5', 8);
  highestPrice = utils.parseUnits('2', 8);
  // Price of one unit. Has to be formatted as a zero-padded hex string of length 32
  priceData = utils.hexZeroPad(currencyUnit.toHexString(), 32);

  // The amount of posted collateral for the IVO
  tokenInAmount = underlyingUnit.mul(1000);

  // Create offer args
  createOfferArgs = {
    comptrollerProxy,
    currency: currencyToken,
    endTime,
    externalPositionManager,
    externalPositionProxy: solvV2ConvertibleIssuerPosition,
    max: 0,
    min: 0,
    mintParameter: {
      effectiveTime: startTime,
      highestPrice,
      lowestPrice,
      maturity,
      tokenInAmount,
    },
    priceData,
    priceType: SolvV2SalePriceType.Fixed,
    signer: fundOwner,
    startTime,
    useAllowList: false,
    voucher,
  };

  slotId = await voucher.getSlot(
    solvV2ConvertibleIssuerPosition,
    currencyToken,
    lowestPrice,
    highestPrice,
    startTime,
    maturity,
    0,
  );
});

describe('Actions.Offer', () => {
  it('should revert when eth is specified as currency', async () => {
    expect(
      solvV2ConvertibleIssuerPositionCreateOffer({ ...createOfferArgs, currency: ETH_ADDRESS }),
    ).rejects.toBeRevertedWith('__validateNotNativeToken: Native asset is unsupported');
  });

  it('works as expected', async () => {
    // Set non-default min and max values to ensure that they are set properly
    const min = 1;
    const max = voucherUnit;
    const receipt = await solvV2ConvertibleIssuerPositionCreateOffer({ ...createOfferArgs, min, max });

    // Value of external position should be equal to deposited collateral
    const managedAssets = await solvV2ConvertibleIssuerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toBe(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);
    expect(managedAssets.amounts_[0]).toEqBigNumber(tokenInAmount);

    // Check that the offer has been properly added on Solv's contract
    const offer = await initialConvertibleOfferingMarket.offerings(offerId);
    expect(offer.currency).toMatchAddress(createOfferArgs.currency);
    expect(offer.endTime).toBe(createOfferArgs.endTime);
    expect(offer.isValid).toBe(true);
    expect(offer.issuer).toMatchAddress(solvV2ConvertibleIssuerPosition);
    expect(offer.max).toEqBigNumber(max);
    expect(offer.min).toEqBigNumber(min);
    expect(offer.priceType).toBe(createOfferArgs.priceType);
    expect(offer.startTime).toEqBigNumber(createOfferArgs.startTime);
    // Expected total units is (underlying sent * lowestPrice)
    const expectedTotalUnits = lowestPrice.mul(tokenInAmount);
    expect(offer.totalUnits).toEqBigNumber(expectedTotalUnits);
    // No unit sold yet so units = totalUnits
    expect(offer.units).toEqBigNumber(expectedTotalUnits);
    expect(offer.useAllowList).toBe(false);
    expect(offer.voucher).toMatchAddress(createOfferArgs.voucher);

    // Check that the mint parameters have been properly added on Solv's contract
    const solvMintParameter = await initialConvertibleOfferingMarket.mintParameters(offerId);
    const { mintParameter } = createOfferArgs;
    expect(solvMintParameter.effectiveTime).toEqBigNumber(mintParameter.effectiveTime);
    expect(solvMintParameter.highestPrice).toEqBigNumber(mintParameter.highestPrice);
    expect(solvMintParameter.lowestPrice).toEqBigNumber(mintParameter.lowestPrice);
    expect(solvMintParameter.maturity).toEqBigNumber(mintParameter.maturity);
    expect(solvMintParameter.tokenInAmount).toEqBigNumber(mintParameter.tokenInAmount);

    // Check that the voucher has been added to the contract's storage
    const vouchers = await solvV2ConvertibleIssuerPosition.getIssuedVouchers();
    expect(vouchers.length).toBe(1);
    expect(vouchers[0]).toMatchAddress(voucher);

    // Check that the offer has been added to the contract's storage
    const offers = await solvV2ConvertibleIssuerPosition.getOffers();
    expect(offers.length).toBe(1);
    expect(offers[0]).toEqBigNumber(offerId);

    assertEvent(receipt, solvV2ConvertibleIssuerPosition.abi.getEvent('IssuedVoucherAdded'), {
      voucher,
    });
    assertEvent(receipt, solvV2ConvertibleIssuerPosition.abi.getEvent('OfferAdded'), {
      offerId,
    });

    expect(receipt).toMatchInlineGasSnapshot(`578889`);
  });
});

describe('Actions.RemoveOffer', () => {
  let initialVaultUnderlyingBalance: BigNumber;

  beforeEach(async () => {
    initialVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);
    await solvV2ConvertibleIssuerPositionCreateOffer({ ...createOfferArgs, startTime: startTime + 100 });
  });

  it('works as expected - before ivo start', async () => {
    const vaultUnderlyingBalanceBefore = await underlyingToken.balanceOf(vaultProxy);
    expect(vaultUnderlyingBalanceBefore).toBeLtBigNumber(initialVaultUnderlyingBalance);

    const receipt = await solvV2ConvertibleIssuerPositionRemoveOffer({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      offerId,
      signer: fundOwner,
    });

    const vaultUnderlyingBalanceAfter = await underlyingToken.balanceOf(vaultProxy);

    expect(vaultUnderlyingBalanceAfter).toEqBigNumber(initialVaultUnderlyingBalance);

    const offers = await solvV2ConvertibleIssuerPosition.getOffers();
    expect(offers.length).toBe(0);

    assertEvent(receipt, solvV2ConvertibleIssuerPosition.abi.getEvent('OfferRemoved'), {
      offerId,
    });

    expect(receipt).toMatchInlineGasSnapshot(`298120`);
  });

  it('works as expected - after buys and ivo end', async () => {
    // Warp time to post-IVO start
    await provider.send('evm_increaseTime', [ONE_HOUR_IN_SECONDS]);
    await provider.send('evm_mine', []);

    // Buy voucher
    await initialConvertibleOfferingMarket.connect(buyer).buy(offerId, voucherUnit);

    // Warp time to post maturity
    await provider.send('evm_increaseTime', [timeToMaturity]);
    await provider.send('evm_mine', []);

    const managedAssets = await solvV2ConvertibleIssuerPosition.getManagedAssets.call();
    const offer = await initialConvertibleOfferingMarket.offerings(offerId);
    const expectedOutstandingUnderlying = offer.units.div(lowestPrice);

    // Proceeds of sale (minus solv market fees) should be in managed assets, in addition to underlying of unsold IVO units
    expect(managedAssets.assets_.length).toBe(2);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedOutstandingUnderlying);
    expect(managedAssets.assets_[1]).toMatchAddress(currencyToken);
    // Expected receivable currency is price of voucher minus 50bps fees
    const expectedReceivableCurrency = BigNumber.from(priceData).sub(BigNumber.from(priceData).mul(50).div(10000));
    expect(managedAssets.amounts_[1]).toEqBigNumber(expectedReceivableCurrency);

    const vaultUnderlyingBalanceBefore = await underlyingToken.balanceOf(vaultProxy);
    const vaultCurrencyBalanceBefore = await currencyToken.balanceOf(vaultProxy);

    await solvV2ConvertibleIssuerPositionRemoveOffer({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      offerId,
      signer: fundOwner,
    });

    // Vault underlying balance should have increased
    const vaultUnderlyingBalanceDelta = (await underlyingToken.balanceOf(vaultProxy)).sub(vaultUnderlyingBalanceBefore);
    expect(vaultUnderlyingBalanceDelta).toEqBigNumber(expectedOutstandingUnderlying);

    // Receivable currency received should have been reconciled back to the vault
    const vaultCurrencyBalanceDelta = (await currencyToken.balanceOf(vaultProxy)).sub(vaultCurrencyBalanceBefore);
    expect(vaultCurrencyBalanceDelta).toEqBigNumber(expectedReceivableCurrency);
  });

  it('works as expected - fulfilled ivo', async () => {
    // Warp time to post-IVO start
    await provider.send('evm_increaseTime', [ONE_HOUR_IN_SECONDS]);
    await provider.send('evm_mine', []);

    const preBuyOffering = await initialConvertibleOfferingMarket.offerings(offerId);

    // Buy all available units
    await initialConvertibleOfferingMarket.connect(buyer).buy(offerId, preBuyOffering.units);

    // Check that there are no units remaining in the offering
    const postBuyOffering = await initialConvertibleOfferingMarket.offerings(offerId);
    expect(postBuyOffering.units).toEqBigNumber(0);

    // Warp time to post maturity
    await provider.send('evm_increaseTime', [timeToMaturity]);
    await provider.send('evm_mine', []);

    // Remove offer
    const receipt = await solvV2ConvertibleIssuerPositionRemoveOffer({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      offerId,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot(`296548`);
  });
});

describe('Actions.Reconcile', () => {
  beforeEach(async () => {
    await solvV2ConvertibleIssuerPositionCreateOffer(createOfferArgs);
  });

  it('works as expected', async () => {
    // Buy voucher
    await initialConvertibleOfferingMarket.connect(buyer).buy(offerId, voucherUnit);

    // Check that some currency has been received by the EP
    const externalPositionBalance = await currencyToken.balanceOf(solvV2ConvertibleIssuerPosition);
    expect(externalPositionBalance).toBeGtBigNumber(0);

    // Reconcile
    const receipt = await solvV2ConvertibleIssuerPositionReconcile({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
    });

    // Check that the currency has been received by the vault
    expect(await currencyToken.balanceOf(vaultProxy)).toBeGtBigNumber(0);

    expect(receipt).toMatchInlineGasSnapshot(`229132`);
  });
});

describe('Actions.Refund', () => {
  beforeEach(async () => {
    await solvV2ConvertibleIssuerPositionCreateOffer(createOfferArgs);

    // Buy voucher so that there are minted vouchers to refund
    await initialConvertibleOfferingMarket.connect(buyer).buy(offerId, voucherUnit);

    // Reconcile so that there is no outstanding currency in the EP
    await solvV2ConvertibleIssuerPositionReconcile({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
    });
  });

  it('works as expected', async () => {
    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleIssuerPositionRefund({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
      slotId,
      voucher,
    });

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    // Check that currency balance has decreased
    expect(preVaultCurrencyBalance).toBeGtBigNumber(postVaultCurrencyBalance);

    // Check that all transferred currency has been used for refund (no currency outstanding in the EP)
    expect(await currencyToken.balanceOf(solvV2ConvertibleIssuerPosition)).toEqBigNumber(0);

    // Check that slot is marked as refunded
    const slotDetail = await voucher.getSlotDetail(slotId);
    expect(slotDetail.isIssuerRefunded).toBe(true);

    expect(receipt).toMatchInlineGasSnapshot(`261139`);
  });
});

describe('Actions.Withdraw', () => {
  beforeEach(async () => {
    await solvV2ConvertibleIssuerPositionCreateOffer(createOfferArgs);

    // Buy voucher
    await initialConvertibleOfferingMarket.connect(buyer).buy(offerId, voucherUnit);

    // Reconcile proceeds of the sale
    await solvV2ConvertibleIssuerPositionReconcile({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
    });
  });

  it('works as expected', async () => {
    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    // Warp time beyond maturity
    await provider.send('evm_increaseTime', [timeToMaturity]);
    await provider.send('evm_mine', []);

    // Update Oracle
    const oracleManager = new ITestSolvV2PriceOracleManager(fork.config.solvFinanceV2.priceOracleManager, solvDeployer);
    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.manualPriceOracle);

    const manualPriceOracle = new ITestSolvV2ManualPriceOracle(
      fork.config.solvFinanceV2.manualPriceOracle,
      solvDeployer,
    );

    // Set price to the highestPrice to ensure that some underlying can be withdrawn
    await manualPriceOracle._setPrice(underlyingToken, maturity, highestPrice);

    await voucherPool.settleConvertiblePrice(slotId);

    const preManagedAssets = await solvV2ConvertibleIssuerPosition.getManagedAssets.call();
    expect(preManagedAssets.assets_.length).toBe(1);
    expect(preManagedAssets.assets_[0]).toMatchAddress(underlyingToken);
    const preManagedUnderlying = preManagedAssets.amounts_[0];

    const receipt = await solvV2ConvertibleIssuerPositionWithdraw({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
      slotId,
      voucher,
    });

    // Send an getManagedAssets tx first to remove the issued voucher
    const managedAssetsReceipt = await solvV2ConvertibleIssuerPosition.connect(fundOwner).getManagedAssets();
    // Call getManagedAssets to retrieve return values (not affected by previous tx)
    const postManagedAssets = await solvV2ConvertibleIssuerPosition.getManagedAssets.call();
    expect(preManagedAssets.assets_.length).toBe(1);
    expect(postManagedAssets.assets_[0]).toMatchAddress(underlyingToken);
    const postManagedUnderlying = postManagedAssets.amounts_[0];
    const postVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    // Check that underlying balance has increased
    expect(postVaultUnderlyingBalance).toBeGtBigNumber(preVaultUnderlyingBalance);

    // Underlying balance delta should equal managedUnderlyingDelta
    const managedUnderlyingDelta = preManagedUnderlying.sub(postManagedUnderlying);
    const vaultUnderlyingDelta = postVaultUnderlyingBalance.sub(preVaultUnderlyingBalance);
    expect(vaultUnderlyingDelta).toEqBigNumber(managedUnderlyingDelta);

    // Check that slot is marked as withdrawn
    const slotDetail = await voucher.getSlotDetail(slotId);
    expect(slotDetail.isIssuerWithdrawn).toBe(true);

    // Voucher should have been automatically removed on calling getManagedAssets when all issued vouchers are withdrawn
    assertEvent(managedAssetsReceipt, solvV2ConvertibleIssuerPosition.abi.getEvent('IssuedVoucherRemoved'), {
      voucher,
    });

    expect((await solvV2ConvertibleIssuerPosition.getIssuedVouchers()).length).toBe(0);

    expect(receipt).toMatchInlineGasSnapshot(`291296`);
  });

  it('works as expected - with refund', async () => {
    const preRefundVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    await solvV2ConvertibleIssuerPositionRefund({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
      slotId,
      voucher,
    });

    const postRefundVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    const refundCost = preRefundVaultCurrencyBalance.sub(postRefundVaultCurrencyBalance);

    // Warp time beyond maturity
    await provider.send('evm_increaseTime', [timeToMaturity]);

    // Update Oracle
    const oracleManager = new ITestSolvV2PriceOracleManager(fork.config.solvFinanceV2.priceOracleManager, solvDeployer);
    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.manualPriceOracle);

    const manualPriceOracle = new ITestSolvV2ManualPriceOracle(
      fork.config.solvFinanceV2.manualPriceOracle,
      solvDeployer,
    );

    // Set price to above the highestPrice so that the currency can be withdrawn (settled in underlying when price is > highestPrice, even when refunded)
    await manualPriceOracle._setPrice(underlyingToken, maturity, highestPrice.mul(2));

    await voucherPool.settleConvertiblePrice(slotId);

    const preWithdrawVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleIssuerPositionWithdraw({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvV2ConvertibleIssuerPosition,
      signer: fundOwner,
      slotId,
      voucher,
    });

    const postWithdrawVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    const withdrawalAmount = postWithdrawVaultCurrencyBalance.sub(preWithdrawVaultCurrencyBalance);

    // Check that the cost of the refund has been withdrawn
    expect(withdrawalAmount).toEqBigNumber(refundCost);

    expect(receipt).toMatchInlineGasSnapshot(`348631`);
  });
});

describe('multiple voucher issuance', () => {
  it('works as expected', async () => {
    // Seed underlying and currency
    const underlyingToken2 = new ITestStandardToken(fork.config.unsupportedAssets.perp, provider);
    const currencyToken2 = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const underlyingToken2Unit = await getAssetUnit(underlyingToken2);
    const currencyToken2Unit = await getAssetUnit(currencyToken2);

    await seedAccount({
      account: vaultProxy,
      amount: underlyingToken2Unit.mul(100_000),
      provider,
      token: underlyingToken2,
    });
    await seedAccount({
      account: vaultProxy,
      amount: currencyToken2Unit.mul(100_000),
      provider,
      token: currencyToken2,
    });

    const voucher2 = new ITestSolvV2ConvertibleVoucher(
      fork.config.solvFinanceV2.convertibles.perp.voucher,
      solvDeployer,
    );

    // Set the EP as the voucher manager so they can create the Initial Voucher Offering (IVO)
    await initialConvertibleOfferingMarket.setVoucherManager(voucher2, [solvV2ConvertibleIssuerPosition], true);

    // Create two offers for two different vouchers
    await solvV2ConvertibleIssuerPositionCreateOffer(createOfferArgs);

    const offerId2 = await initialConvertibleOfferingMarket.nextOfferingId.call();

    const receipt = await solvV2ConvertibleIssuerPositionCreateOffer({
      ...createOfferArgs,
      currency: currencyToken2,
      voucher: voucher2,
    });

    assertEvent(receipt, solvV2ConvertibleIssuerPosition.abi.getEvent('IssuedVoucherAdded'), {
      voucher: voucher2,
    });
    assertEvent(receipt, solvV2ConvertibleIssuerPosition.abi.getEvent('OfferAdded'), {
      offerId: offerId2,
    });

    // Assert that the second voucher has been added
    const vouchers = await solvV2ConvertibleIssuerPosition.getIssuedVouchers();
    expect(vouchers.length).toBe(2);
    expect(vouchers[1]).toMatchAddress(voucher2);

    // Assert that the second offer has been added
    const offers = await solvV2ConvertibleIssuerPosition.getOffers();
    expect(offers.length).toBe(2);
    expect(offers[1]).toEqBigNumber(offerId2);

    // Warp time to post maturity
    await provider.send('evm_increaseTime', [timeToMaturity]);
    await provider.send('evm_mine', []);

    const managedAssets = await solvV2ConvertibleIssuerPosition.getManagedAssets.call();

    // Managed assets should contain both underlying tokens
    expect(managedAssets.assets_.length).toBe(2);
    const underlyingTokenIndex = managedAssets.assets_.findIndex((asset) => sameAddress(asset, underlyingToken));
    const underlyingToken2Index = managedAssets.assets_.findIndex((asset) => sameAddress(asset, underlyingToken2));
    // `findIndex` returns -1 when an item is not found
    expect(underlyingTokenIndex).not.toBe(-1);
    expect(underlyingToken2Index).not.toBe(-1);

    expect(receipt).toMatchInlineGasSnapshot(`497195`);
  });
});
