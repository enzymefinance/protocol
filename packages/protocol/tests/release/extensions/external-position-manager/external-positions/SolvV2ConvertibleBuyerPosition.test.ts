import { extractEvent } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager, VaultLib } from '@enzymefinance/protocol';
import {
  ETH_ADDRESS,
  ITestSolvV2ConvertibleManualPriceOracle,
  ITestSolvV2ConvertibleMarket,
  ITestSolvV2ConvertiblePool,
  ITestSolvV2ConvertiblePriceOracleManager,
  ITestSolvV2ConvertibleVoucher,
  ITestSolvV2InitialConvertibleOfferingMarket,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  ONE_WEEK_IN_SECONDS,
  SolvV2ConvertibleBuyerPositionLib,
  SolvV2SalePriceType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertExternalPositionAssetsToReceive,
  assertNoEvent,
  createNewFund,
  createSolvV2ConvertibleBuyerPosition,
  deployProtocolFixture,
  getAssetUnit,
  impersonateSigner,
  setAccountBalance,
  solvV2ConvertibleBuyerPositionBuyOffering,
  solvV2ConvertibleBuyerPositionBuySaleByAmount,
  solvV2ConvertibleBuyerPositionBuySaleByUnits,
  solvV2ConvertibleBuyerPositionClaim,
  solvV2ConvertibleBuyerPositionCreateSaleDecliningPrice,
  solvV2ConvertibleBuyerPositionCreateSaleFixedPrice,
  solvV2ConvertibleBuyerPositionReconcile,
  solvV2ConvertibleBuyerPositionRemoveSale,
} from '@enzymefinance/testutils';
import type { BigNumber, BigNumberish, BytesLike } from 'ethers';
import { constants, utils } from 'ethers';

const voucherUnit = utils.parseUnits('1', 26);

let fundOwner: SignerWithAddress;
let issuer: SignerWithAddress;
let currencyToken: ITestStandardToken;
let currencyUnit: BigNumber;
let underlyingToken: ITestStandardToken;
let underlyingUnit: BigNumber;

let comptrollerProxy: ComptrollerLib;
let externalPositionManager: ExternalPositionManager;
let vaultProxy: VaultLib;
let convertibleMarket: ITestSolvV2ConvertibleMarket;
let initialConvertibleOfferingMarket: ITestSolvV2InitialConvertibleOfferingMarket;
let solvConvertibleBuyerPosition: SolvV2ConvertibleBuyerPositionLib;
let oracleManager: ITestSolvV2ConvertiblePriceOracleManager;
let manualPriceOracle: ITestSolvV2ConvertibleManualPriceOracle;
let voucher: ITestSolvV2ConvertibleVoucher;
let voucherPool: ITestSolvV2ConvertiblePool;

let fork: ProtocolDeployment;

let offerId: BigNumberish;
let startTime: number;
let endTime: number;
let maturity: number;
let highestPrice: BigNumber;
let lowestPrice: BigNumber;
let priceData: BytesLike;
let tokenInAmount: BigNumber;
let slotId: BigNumber;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner, issuer] = fork.accounts;

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

  const { externalPositionProxy } = await createSolvV2ConvertibleBuyerPosition({
    comptrollerProxy,
    externalPositionManager,
    signer: fundOwner,
  });

  // All tests use the USF convertible voucher
  currencyToken = new ITestStandardToken(fork.config.primitives.usdt, provider);
  currencyUnit = await getAssetUnit(currencyToken);
  underlyingToken = new ITestStandardToken(fork.config.solvFinanceV2.convertibles.vouchers.usf.underlying, provider);
  underlyingUnit = await getAssetUnit(underlyingToken);

  solvConvertibleBuyerPosition = new SolvV2ConvertibleBuyerPositionLib(externalPositionProxy, provider);
  const solvDeployer = await impersonateSigner({ provider, signerAddress: fork.config.solvFinanceV2.deployer });
  oracleManager = new ITestSolvV2ConvertiblePriceOracleManager(
    fork.config.solvFinanceV2.convertibles.priceOracleManager,
    solvDeployer,
  );
  manualPriceOracle = new ITestSolvV2ConvertibleManualPriceOracle(
    fork.config.solvFinanceV2.convertibles.manualPriceOracle,
    solvDeployer,
  );
  convertibleMarket = new ITestSolvV2ConvertibleMarket(fork.config.solvFinanceV2.convertibles.market, solvDeployer);
  initialConvertibleOfferingMarket = new ITestSolvV2InitialConvertibleOfferingMarket(
    fork.config.solvFinanceV2.convertibles.initialOfferingMarket,
    solvDeployer,
  );
  voucher = new ITestSolvV2ConvertibleVoucher(fork.config.solvFinanceV2.convertibles.vouchers.usf.voucher, provider);
  voucherPool = new ITestSolvV2ConvertiblePool(fork.config.solvFinanceV2.convertibles.vouchers.usf.pool, solvDeployer);

  // Seed the vaultProxy with currency, and issuer with underlying and currency
  const underlyingAmount = underlyingUnit.mul(100_000);
  const currencyAmount = currencyUnit.mul(100_000);
  await setAccountBalance({ account: vaultProxy, amount: currencyAmount, provider, token: currencyToken });
  await setAccountBalance({ account: issuer, amount: currencyAmount, provider, token: currencyToken });
  await setAccountBalance({ account: issuer, amount: underlyingAmount, provider, token: underlyingToken });

  // Approve issuer spend on solv markets
  await underlyingToken.connect(issuer).approve(initialConvertibleOfferingMarket, constants.MaxUint256);
  await currencyToken.connect(issuer).approve(initialConvertibleOfferingMarket, constants.MaxUint256);
  await currencyToken.connect(issuer).approve(convertibleMarket, constants.MaxUint256);

  // Set the issuer as the voucher manager so they can create the Initial Voucher Offering (IVO)
  await initialConvertibleOfferingMarket.setVoucherManager(voucher, [issuer], true);

  // Get the next IVO id
  offerId = await initialConvertibleOfferingMarket.nextOfferingId.call();

  // Parameters of the IVO
  const { timestamp } = await provider.getBlock('latest');
  startTime = timestamp;
  endTime = timestamp + ONE_DAY_IN_SECONDS;
  maturity = endTime + ONE_WEEK_IN_SECONDS;

  // Prices are hardcoded as 8 decimals regardless of currency token
  highestPrice = utils.parseUnits('2', 8);
  lowestPrice = utils.parseUnits('0.5', 8);

  // Price of one unit. Has to be formatted as a zero-padded hex string of length 32
  priceData = utils.hexZeroPad(currencyUnit.toHexString(), 32);

  // The amount of posted collateral for the IVO
  tokenInAmount = underlyingUnit.mul(1000);

  // Create an IVO
  await initialConvertibleOfferingMarket
    .connect(issuer)
    .offer(voucher, currencyToken, '0', voucherUnit, startTime, endTime, false, 0, priceData, {
      effectiveTime: startTime,
      highestPrice,
      lowestPrice,
      maturity,
      tokenInAmount,
    });

  slotId = await voucher.getSlot(issuer, currencyToken, lowestPrice, highestPrice, startTime, maturity, 0);
});

describe('buy IVO action', () => {
  it('works as expected', async () => {
    const { tokenId, receipt } = await solvV2ConvertibleBuyerPositionBuyOffering({
      comptrollerProxy,
      offerId,
      units: voucherUnit,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
    });

    // Check that the tokenId is owned by the EP
    expect(await voucher.ownerOf(tokenId)).toMatchAddress(solvConvertibleBuyerPosition);

    // Check that the EP does not hold currency
    expect(await currencyToken.balanceOf(solvConvertibleBuyerPosition)).toEqBigNumber(0);

    const voucherIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherIds.length).toBe(1);
    expect(voucherIds[0].tokenId).toEqBigNumber(tokenId);
    expect(voucherIds[0].voucher).toMatchAddress(voucher);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdAdded'), {
      tokenId,
      voucher,
    });

    assertExternalPositionAssetsToReceive({ receipt, assets: [] });

    expect(receipt).toMatchInlineGasSnapshot(`963889`);
  });
});

describe('buy sale actions', () => {
  let saleId: BigNumber;
  let tokenId: BigNumber;
  let price: BigNumber;

  beforeEach(async () => {
    // Have a user buy all vouchers from the IVO and then put them for sale on the marketplace
    const receipt = await initialConvertibleOfferingMarket.connect(issuer).buy(offerId, voucherUnit);
    const extractedEvent = extractEvent(receipt, initialConvertibleOfferingMarket.abi.getEvent('Traded'));
    tokenId = extractedEvent[0].args.voucherId as BigNumber;

    saleId = await convertibleMarket.nextSaleId.call();

    await voucher.connect(issuer).approve(convertibleMarket, tokenId);

    const min = 0;
    const max = voucherUnit;
    price = currencyUnit;

    // Publish fixed price sale
    await convertibleMarket
      .connect(issuer)
      .publishFixedPrice(voucher, tokenId, currencyToken, min, max, startTime, false, price);
  });

  it('works as expected - buy sales by amount (full amount)', async () => {
    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionBuySaleByAmount({
      amount: currencyUnit,
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      saleId,
      signer: fundOwner,
    });

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    expect(postVaultCurrencyBalance).toEqBigNumber(preVaultCurrencyBalance.sub(currencyUnit));

    // Check that the tokenId is owned by the EP
    expect(await voucher.ownerOf(tokenId)).toMatchAddress(solvConvertibleBuyerPosition);

    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toBe(1);
    expect(voucherTokenIds[0].tokenId).toEqBigNumber(tokenId);
    expect(voucherTokenIds[0].voucher).toMatchAddress(voucher);

    // Check that the EP does not hold currency
    expect(await currencyToken.balanceOf(solvConvertibleBuyerPosition)).toEqBigNumber(0);

    assertExternalPositionAssetsToReceive({ receipt, assets: [] });

    expect(receipt).toMatchInlineGasSnapshot(`466257`);
  });

  it('works as expected - buy sales by units (partial sale units)', async () => {
    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionBuySaleByUnits({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      saleId,
      signer: fundOwner,
      units: voucherUnit.div(2),
    });

    // Since we buy half a voucher unit, currencyPaid is the price/2
    const currencyPaid = price.div(2);

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    expect(postVaultCurrencyBalance).toEqBigNumber(preVaultCurrencyBalance.sub(currencyPaid));

    // Check that the EP does not hold currency
    expect(await currencyToken.balanceOf(solvConvertibleBuyerPosition)).toEqBigNumber(0);

    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toBe(1);
    // When buying a partial sale, a new tokenId gets generated
    expect(voucherTokenIds[0].tokenId).toEqBigNumber(tokenId.add(1));
    expect(voucherTokenIds[0].voucher).toMatchAddress(voucher);

    assertExternalPositionAssetsToReceive({ receipt, assets: [] });

    expect(receipt).toMatchInlineGasSnapshot(`660612`);
  });
});

describe('claim voucher', () => {
  let boughtUnits: BigNumber;
  let tokenId: BigNumber;

  beforeEach(async () => {
    boughtUnits = voucherUnit;

    tokenId = (
      await solvV2ConvertibleBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId,
        units: boughtUnits,
        externalPositionManager,
        externalPositionProxy: solvConvertibleBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;

    // Warp time to maturity
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    // Update Oracle
    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);

    // Set price to above the highestPrice so that the claim returns underlying
    await manualPriceOracle._setPrice(underlyingToken, maturity, highestPrice.mul(2));

    await voucherPool.settleConvertiblePrice(slotId);
  });

  it('works as expected - partial claiming', async () => {
    const underlyingBalancePre = await underlyingToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
      units: boughtUnits.div(2),
    });

    const underlyingBalancePost = await underlyingToken.balanceOf(vaultProxy);

    // Check that the vault has received some underlying
    expect(underlyingBalancePost).toBeGtBigNumber(underlyingBalancePre);

    // Check that the voucherTokenId is still stored
    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toEqual(1);
    const voucherTokenId = voucherTokenIds[0];
    expect(voucherTokenId.tokenId).toEqBigNumber(tokenId);
    expect(voucherTokenId.voucher).toMatchAddress(voucher);

    assertNoEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'));

    // Should receive underlying and currency tokens
    assertExternalPositionAssetsToReceive({ receipt, assets: [underlyingToken, currencyToken] });

    expect(receipt).toMatchInlineGasSnapshot(`371410`);
  });

  it('works as expected - full claiming with exact amount', async () => {
    const underlyingBalancePre = await underlyingToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
      units: boughtUnits,
    });

    const underlyingBalancePost = await underlyingToken.balanceOf(vaultProxy);

    // Check that the vault has received some underlying
    expect(underlyingBalancePost).toBeGtBigNumber(underlyingBalancePre);

    // Check that the voucherTokenId has been removed
    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toEqual(0);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'), {
      tokenId,
      voucher,
    });

    expect(receipt).toMatchInlineGasSnapshot(`385073`);
  });

  it('works as expected - full claiming with MAX_UINT', async () => {
    const underlyingBalancePre = await underlyingToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
      units: constants.MaxUint256,
    });

    const underlyingBalancePost = await underlyingToken.balanceOf(vaultProxy);

    // Check that the vault has received some underlying
    expect(underlyingBalancePost).toBeGtBigNumber(underlyingBalancePre);

    // Check that the voucherTokenId has been removed
    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toEqual(0);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'), {
      tokenId,
      voucher,
    });

    expect(receipt).toMatchInlineGasSnapshot(`385350`);
  });
});

describe('sales creation actions', () => {
  let tokenId: BigNumber;

  beforeEach(async () => {
    tokenId = (
      await solvV2ConvertibleBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId,
        units: voucherUnit,
        externalPositionManager,
        externalPositionProxy: solvConvertibleBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;
  });

  it('works as expected - declining price', async () => {
    // Declining price args
    const duration = ONE_WEEK_IN_SECONDS;
    const interval = 600;
    const lowest = currencyUnit.div(2);
    const highest = currencyUnit;

    const nextSaleId = await convertibleMarket.nextSaleId.call();
    const receipt = await solvV2ConvertibleBuyerPositionCreateSaleDecliningPrice({
      comptrollerProxy,
      currency: currencyToken,
      duration,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      highest,
      interval,
      lowest,
      max: voucherUnit,
      min: '0',
      signer: fundOwner,
      startTime,
      tokenId,
      useAllowList: false,
      voucher,
    });

    // Check that the sale has been added to the EP storage
    const sales = await solvConvertibleBuyerPosition.getSales();
    expect(sales.length).toBe(1);
    expect(sales[0].currency).toMatchAddress(currencyToken);
    expect(sales[0].saleId).toEqBigNumber(nextSaleId);

    // Check that the sale struct has been properly added on the solv marketplace
    const sale = await convertibleMarket.sales.args(nextSaleId).call();

    expect(sale.currency).toMatchAddress(currencyToken);
    expect(sale.isValid).toBe(true);
    expect(sale.min).toEqBigNumber(0);
    expect(sale.max).toEqBigNumber(voucherUnit);
    expect(sale.priceType).toBe(SolvV2SalePriceType.Declining);
    expect(sale.saleId).toEqBigNumber(nextSaleId);
    expect(sale.seller).toMatchAddress(solvConvertibleBuyerPosition);
    expect(sale.startTime).toEqBigNumber(startTime);
    expect(sale.tokenId).toEqBigNumber(tokenId);
    expect(sale.useAllowList).toBe(false);
    expect(sale.voucher).toMatchAddress(voucher);

    // Check that the price has been properly set
    const decliningPrice = await convertibleMarket.getDecliningPrice(nextSaleId);
    expect(decliningPrice.duration_).toEqBigNumber(duration);
    expect(decliningPrice.highest_).toEqBigNumber(highest);
    expect(decliningPrice.interval_).toEqBigNumber(interval);
    expect(decliningPrice.lowest_).toEqBigNumber(lowest);
    expect(decliningPrice.startTime_).toEqBigNumber(startTime);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('SaleAdded'), {
      saleId: nextSaleId,
      currency: currencyToken.address,
    });

    // Check that the voucherTokenId has been removed
    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toBe(0);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'), {
      tokenId,
      voucher,
    });

    assertExternalPositionAssetsToReceive({ receipt, assets: [] });

    expect(receipt).toMatchInlineGasSnapshot(`521098`);
  });

  it('works as expected - fixed price', async () => {
    const nextSaleId = await convertibleMarket.nextSaleId.call();
    const receipt = await solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
      comptrollerProxy,
      currency: currencyToken,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      max: voucherUnit,
      min: '0',
      price: currencyUnit,
      signer: fundOwner,
      startTime,
      tokenId,
      useAllowList: false,
      voucher,
    });

    // Check that the sale has been added
    const sales = await solvConvertibleBuyerPosition.getSales();
    expect(sales.length).toBe(1);
    expect(sales[0].currency).toMatchAddress(currencyToken);
    expect(sales[0].saleId).toEqBigNumber(nextSaleId);

    // Check that the sale struct has been properly added on the solv marketplace
    const sale = await convertibleMarket.sales.args(nextSaleId).call();

    expect(sale.currency).toMatchAddress(currencyToken);
    expect(sale.isValid).toBe(true);
    expect(sale.min).toEqBigNumber(0);
    expect(sale.max).toEqBigNumber(voucherUnit);
    expect(sale.priceType).toBe(SolvV2SalePriceType.Fixed);
    expect(sale.saleId).toEqBigNumber(nextSaleId);
    expect(sale.seller).toMatchAddress(solvConvertibleBuyerPosition);
    expect(sale.startTime).toEqBigNumber(startTime);
    expect(sale.tokenId).toEqBigNumber(tokenId);
    expect(sale.useAllowList).toBe(false);
    expect(sale.voucher).toMatchAddress(voucher);

    // Check that the price has been properly set
    const fixedPrice = await convertibleMarket.getFixedPrice(nextSaleId);
    expect(fixedPrice).toEqBigNumber(currencyUnit);

    // Check that the voucherTokenId has been removed
    const voucherTokenIds = await solvConvertibleBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toBe(0);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'), {
      tokenId,
      voucher,
    });

    assertExternalPositionAssetsToReceive({ receipt, assets: [] });

    expect(receipt).toMatchInlineGasSnapshot(`491788`);
  });

  it('works as expected - reconcile', async () => {
    const nextSaleId = await convertibleMarket.nextSaleId.call();
    await solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
      comptrollerProxy,
      currency: currencyToken,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      max: voucherUnit,
      min: '0',
      price: currencyUnit,
      signer: fundOwner,
      startTime,
      tokenId,
      useAllowList: false,
      voucher,
    });

    // Have a 3rd party take a sale created by the fund, which pays the sale currency into the EP
    await convertibleMarket.connect(issuer).buyByAmount(nextSaleId, currencyUnit);

    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionReconcile({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
    });

    // Vault balance should have increased by what the user paid for the sale minus the 1.5% fee
    const valueToReconcile = currencyUnit.sub(currencyUnit.mul(15).div(1000));
    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    expect(postVaultCurrencyBalance).toEqBigNumber(preVaultCurrencyBalance.add(valueToReconcile));

    // Should receive currency token
    assertExternalPositionAssetsToReceive({ receipt, assets: [currencyToken] });

    expect(receipt).toMatchInlineGasSnapshot(`195927`);
  });

  it('reverts with native asset currency - declining price', async () => {
    expect(
      solvV2ConvertibleBuyerPositionCreateSaleDecliningPrice({
        comptrollerProxy,
        currency: ETH_ADDRESS,
        duration: 0,
        externalPositionManager,
        externalPositionProxy: solvConvertibleBuyerPosition,
        highest: 0,
        interval: 0,
        lowest: 0,
        max: voucherUnit,
        min: '0',
        signer: fundOwner,
        startTime,
        tokenId,
        useAllowList: false,
        voucher,
      }),
    ).rejects.toBeRevertedWith('Native asset is unsupported');
  });

  it('reverts with native asset currency - fixed price', async () => {
    expect(
      solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
        comptrollerProxy,
        currency: ETH_ADDRESS,
        externalPositionManager,
        externalPositionProxy: solvConvertibleBuyerPosition,
        max: voucherUnit,
        min: '0',
        price: 0,
        signer: fundOwner,
        startTime,
        tokenId,
        useAllowList: false,
        voucher,
      }),
    ).rejects.toBeRevertedWith('Native asset is unsupported');
  });
});

describe('remove sale action', () => {
  let saleId: BigNumber;
  let tokenId: BigNumber;

  beforeEach(async () => {
    tokenId = (
      await solvV2ConvertibleBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId,
        units: voucherUnit,
        externalPositionManager,
        externalPositionProxy: solvConvertibleBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;

    saleId = await convertibleMarket.nextSaleId.call();

    await solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
      comptrollerProxy,
      currency: currencyToken,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      max: voucherUnit,
      min: '0',
      price: currencyUnit,
      signer: fundOwner,
      startTime,
      tokenId,
      useAllowList: false,
      voucher,
    });
  });

  it('works as expected - remove sale (partially fulfilled)', async () => {
    // Assert that tokenId is not held by the EP
    const preTokenOwner = await voucher.ownerOf(tokenId);
    expect(preTokenOwner).toMatchAddress(convertibleMarket);

    await convertibleMarket.connect(issuer).buyByAmount(saleId, currencyUnit.div(2));

    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    const receipt = await solvV2ConvertibleBuyerPositionRemoveSale({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      saleId,
      signer: fundOwner,
    });

    // Assert that tokenId is back in the EP
    const postTokenOwner = await voucher.ownerOf(tokenId);
    expect(postTokenOwner).toMatchAddress(solvConvertibleBuyerPosition);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdAdded'), {
      tokenId,
      voucher,
    });

    // Assert that the sale has been removed
    const sales = await solvConvertibleBuyerPosition.getSales();
    expect(sales.length).toBe(0);

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('SaleRemoved'), {
      currency: currencyToken.address,
      saleId,
    });

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    // Should reconcile
    expect(postVaultCurrencyBalance).toBeGtBigNumber(preVaultCurrencyBalance);

    // Should receive currency token
    assertExternalPositionAssetsToReceive({ receipt, assets: [currencyToken] });

    expect(receipt).toMatchInlineGasSnapshot(`383246`);
  });

  it('works as expected - remove sale (fulfilled)', async () => {
    await convertibleMarket.connect(issuer).buyByAmount(saleId, currencyUnit);

    const receipt = await solvV2ConvertibleBuyerPositionRemoveSale({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      saleId,
      signer: fundOwner,
    });

    assertEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('SaleRemoved'), { saleId, currency: currencyToken });
    // VoucherTokenId should not be added when sale has been fulfilled
    assertNoEvent(receipt, solvConvertibleBuyerPosition.abi.getEvent('VoucherTokenIdAdded'));

    // Should receive currency token
    assertExternalPositionAssetsToReceive({ receipt, assets: [currencyToken] });

    expect(receipt).toMatchInlineGasSnapshot(`220024`);
  });
});

describe('get managed assets', () => {
  let tokenId: BigNumber;

  beforeEach(async () => {
    await currencyToken.connect(issuer).approve(voucherPool, constants.MaxUint256);

    tokenId = (
      await solvV2ConvertibleBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId,
        units: voucherUnit,
        externalPositionManager,
        externalPositionProxy: solvConvertibleBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;
  });

  it('reverts when holding a mature voucher with no settlement price', async () => {
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    expect(solvConvertibleBuyerPosition.getManagedAssets.call()).rejects.toBeRevertedWith('Price not settled');
  });

  it('works as expected - settle price under lower bound', async () => {
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    // Update Oracle to a manual price oracle to manipulate the price
    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);

    await manualPriceOracle._setPrice(underlyingToken, maturity, lowestPrice.div(2));
    await voucherPool.settleConvertiblePrice(slotId);

    const managedAssets = await solvConvertibleBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(lowestPrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    const postVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);
    const vaultUnderlyingDelta = postVaultUnderlyingBalance.sub(preVaultUnderlyingBalance);
    expect(vaultUnderlyingDelta).toEqBigNumber(expectedAmount);
  });

  it('works as expected - settle price between lower & upper bounds', async () => {
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);
    // Settlement price halfway between lowest and highest
    const settlePrice = lowestPrice.add(highestPrice).div(2);
    await manualPriceOracle._setPrice(underlyingToken, maturity, settlePrice);
    await voucherPool.settleConvertiblePrice(slotId);

    const managedAssets = await solvConvertibleBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(settlePrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    const postVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);
    const vaultUnderlyingDelta = postVaultUnderlyingBalance.sub(preVaultUnderlyingBalance);
    expect(vaultUnderlyingDelta).toEqBigNumber(expectedAmount);
  });

  it('works as expected - settle price above upper bound', async () => {
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);
    await manualPriceOracle._setPrice(underlyingToken, maturity, highestPrice.mul(2));
    await voucherPool.settleConvertiblePrice(slotId);

    const managedAssets = await solvConvertibleBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(highestPrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    const postVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);
    const vaultUnderlyingDelta = postVaultUnderlyingBalance.sub(preVaultUnderlyingBalance);
    expect(vaultUnderlyingDelta).toEqBigNumber(expectedAmount);
  });

  it('works as expected - refunded slot, price settled below upper bound', async () => {
    // Refund
    await voucherPool.connect(issuer).refund(slotId);

    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);
    await manualPriceOracle._setPrice(underlyingToken, maturity, lowestPrice);
    await voucherPool.settleConvertiblePrice(slotId);

    const managedAssets = await solvConvertibleBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(currencyToken);

    const expectedAmount = voucherUnit.mul(currencyUnit).div(voucherUnit);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    const vaultCurrencyDelta = postVaultCurrencyBalance.sub(preVaultCurrencyBalance);
    expect(vaultCurrencyDelta).toEqBigNumber(expectedAmount);
  });

  it('works as expected - one voucher above upper bound, one voucher below lower bound, including partially filled sale', async () => {
    const nextOfferId = Number((await initialConvertibleOfferingMarket.nextOfferingId.call()).toString());
    // Offer and buy a 2nd voucher with a different maturity (to create a different slot)
    const maturity2 = maturity + ONE_DAY_IN_SECONDS;
    await initialConvertibleOfferingMarket
      .connect(issuer)
      .offer(voucher, currencyToken, '0', voucherUnit, startTime, endTime, false, 0, priceData, {
        effectiveTime: startTime,
        highestPrice,
        lowestPrice,
        maturity: maturity2,
        tokenInAmount,
      });

    const slotId2 = await voucher.getSlot(issuer, currencyToken, lowestPrice, highestPrice, startTime, maturity2, 0);

    const { tokenId: tokenId2 } = await solvV2ConvertibleBuyerPositionBuyOffering({
      comptrollerProxy,
      offerId: nextOfferId,
      units: voucherUnit,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
    });

    // Create a fixed price sale with tokenId2 using a different currency
    const currencyToken2 = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const currencyUnit2 = await getAssetUnit(currencyToken2);
    const nextSaleId = await convertibleMarket.nextSaleId.call();
    await solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
      comptrollerProxy,
      currency: currencyToken2,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      max: voucherUnit,
      min: '0',
      price: currencyUnit2,
      signer: fundOwner,
      startTime,
      tokenId: tokenId2,
      useAllowList: false,
      voucher,
    });

    // Have a 3rd party partially take the sale created by the fund
    const boughtAmount = currencyUnit2.div(2);
    await setAccountBalance({ account: issuer, amount: boughtAmount, provider, token: currencyToken2 });
    await currencyToken2.connect(issuer).approve(convertibleMarket, boughtAmount);
    await convertibleMarket.connect(issuer).buyByAmount(nextSaleId, boughtAmount);

    // Increase time by endTime + maturityTime of second voucher
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + maturity2]);
    await provider.send('evm_mine', []);

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);
    // Settle first slot price to above highestPrice
    await manualPriceOracle._setPrice(underlyingToken, maturity, highestPrice.mul(2));
    await voucherPool.settleConvertiblePrice(slotId);
    // Settle second slot price to below lowestPrice
    await manualPriceOracle._setPrice(underlyingToken, maturity + ONE_DAY_IN_SECONDS, lowestPrice.div(2));
    await voucherPool.settleConvertiblePrice(slotId2);

    const managedAssets = await solvConvertibleBuyerPosition.getManagedAssets.call();
    // Should return the voucher underlying + the currency from the partial sale
    expect(managedAssets.assets_.length).toEqual(2);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);
    expect(managedAssets.assets_[1]).toMatchAddress(currencyToken2);

    const expectedUnderlyingAmount1 = voucherUnit.div(highestPrice);
    // Since the sale is half-filled, the underlying value is halved (the other half is in currencyToken2, from the sale)
    const expectedUnderlyingAmount2 = voucherUnit.div(lowestPrice).div(2);
    const expectedUnderlyingAmount = expectedUnderlyingAmount1.add(expectedUnderlyingAmount2);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedUnderlyingAmount);

    // The expected currency amount is the sale proceeds minus the 1.5% marketplace fee
    const expectedCurrencyAmount = boughtAmount.sub(boughtAmount.mul(15).div(1000));
    expect(managedAssets.amounts_[1]).toEqBigNumber(expectedCurrencyAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2ConvertibleBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    // Should only contain the expected underlying amount from 1 (non-removed sale can't be claimed)
    const postVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);
    const vaultUnderlyingDelta = postVaultUnderlyingBalance.sub(preVaultUnderlyingBalance);
    expect(vaultUnderlyingDelta).toEqBigNumber(expectedUnderlyingAmount1);
  });

  it('works as expected - matured sale with settled price and unsold units', async () => {
    await solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
      comptrollerProxy,
      currency: currencyToken,
      externalPositionManager,
      externalPositionProxy: solvConvertibleBuyerPosition,
      max: voucherUnit,
      min: '0',
      price: currencyUnit,
      signer: fundOwner,
      startTime,
      tokenId,
      useAllowList: false,
      voucher,
    });

    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.convertibles.manualPriceOracle);
    await manualPriceOracle._setPrice(underlyingToken, maturity, highestPrice.mul(2));
    await voucherPool.settleConvertiblePrice(slotId);

    const managedAssets = await solvConvertibleBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(highestPrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);
  });
});
