import type { ComptrollerLib, ExternalPositionManager, VaultLib } from '@enzymefinance/protocol';
import {
  ITestSolvV2BondManualPriceOracle,
  ITestSolvV2BondPool,
  ITestSolvV2BondPriceOracleManager,
  ITestSolvV2BondVoucher,
  ITestSolvV2InitialConvertibleOfferingMarket,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  ONE_WEEK_IN_SECONDS,
  SolvV2BondBuyerPositionLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertExternalPositionAssetsToReceive,
  assertNoEvent,
  createNewFund,
  createSolvV2BondBuyerPosition,
  deployProtocolFixture,
  getAssetUnit,
  impersonateSigner,
  setAccountBalance,
  solvV2BondBuyerPositionBuyOffering,
  solvV2BondBuyerPositionClaim,
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
let initialBondOfferingMarket: ITestSolvV2InitialConvertibleOfferingMarket;
let solvBondBuyerPosition: SolvV2BondBuyerPositionLib;
let oracleManager: ITestSolvV2BondPriceOracleManager;
let manualPriceOracle: ITestSolvV2BondManualPriceOracle;
let voucher: ITestSolvV2BondVoucher;
let voucherPool: ITestSolvV2BondPool;

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

  const { externalPositionProxy } = await createSolvV2BondBuyerPosition({
    comptrollerProxy,
    externalPositionManager,
    signer: fundOwner,
  });

  solvBondBuyerPosition = new SolvV2BondBuyerPositionLib(externalPositionProxy, provider);

  currencyToken = new ITestStandardToken(fork.config.weth, provider);
  currencyUnit = await getAssetUnit(currencyToken);
  underlyingToken = new ITestStandardToken(fork.config.solvFinanceV2.bonds.vouchers.bviUsdWeth.underlying, provider);
  underlyingUnit = await getAssetUnit(underlyingToken);

  const solvDeployer = await impersonateSigner({ provider, signerAddress: fork.config.solvFinanceV2.deployer });
  oracleManager = new ITestSolvV2BondPriceOracleManager(
    fork.config.solvFinanceV2.bonds.priceOracleManager,
    solvDeployer,
  );
  manualPriceOracle = new ITestSolvV2BondManualPriceOracle(
    fork.config.solvFinanceV2.bonds.manualPriceOracle,
    solvDeployer,
  );
  initialBondOfferingMarket = new ITestSolvV2InitialConvertibleOfferingMarket(
    fork.config.solvFinanceV2.bonds.initialOfferingMarket,
    solvDeployer,
  );
  voucher = new ITestSolvV2BondVoucher(fork.config.solvFinanceV2.bonds.vouchers.bviUsdWeth.voucher, provider);
  voucherPool = new ITestSolvV2BondPool(fork.config.solvFinanceV2.bonds.vouchers.bviUsdWeth.pool, solvDeployer);

  // Seed the vaultProxy with currency, and issuer with underlying and currency
  const underlyingAmount = underlyingUnit.mul(100_000);
  const currencyAmount = currencyUnit.mul(100_000);
  await setAccountBalance({ account: vaultProxy, amount: currencyAmount, provider, token: currencyToken });
  await setAccountBalance({ account: issuer, amount: currencyAmount, provider, token: currencyToken });
  await setAccountBalance({ account: issuer, amount: underlyingAmount, provider, token: underlyingToken });

  // Approve issuer spend on solv markets
  await underlyingToken.connect(issuer).approve(initialBondOfferingMarket, constants.MaxUint256);
  await currencyToken.connect(issuer).approve(initialBondOfferingMarket, constants.MaxUint256);

  // Set the issuer as the voucher manager so they can create the Initial Voucher Offering (IVO)
  await initialBondOfferingMarket.setVoucherManager(voucher, [issuer], true);

  // Get the next IVO id
  offerId = await initialBondOfferingMarket.nextOfferingId.call();

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
  await initialBondOfferingMarket
    .connect(issuer)
    .offer(voucher, currencyToken, '0', voucherUnit, startTime, endTime, false, 0, priceData, {
      effectiveTime: startTime,
      highestPrice,
      lowestPrice,
      maturity,
      tokenInAmount,
    });

  slotId = await voucher.getSlot(issuer, currencyToken, lowestPrice, highestPrice, startTime, maturity);
});

describe('buy IVO action', () => {
  it('works as expected', async () => {
    const { tokenId, receipt } = await solvV2BondBuyerPositionBuyOffering({
      comptrollerProxy,
      offerId,
      units: voucherUnit,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
    });

    // Check that the tokenId is owned by the EP
    expect(await voucher.ownerOf(tokenId)).toMatchAddress(solvBondBuyerPosition);
    // Check that the EP does not hold currency
    expect(await currencyToken.balanceOf(solvBondBuyerPosition)).toEqBigNumber(0);
    const voucherIds = await solvBondBuyerPosition.getVoucherTokenIds();
    expect(voucherIds.length).toBe(1);
    expect(voucherIds[0].tokenId).toEqBigNumber(tokenId);
    expect(voucherIds[0].voucher).toMatchAddress(voucher);
    assertEvent(receipt, solvBondBuyerPosition.abi.getEvent('VoucherTokenIdAdded'), {
      tokenId,
      voucher,
    });
    assertExternalPositionAssetsToReceive({ receipt, assets: [] });
    expect(receipt).toMatchInlineGasSnapshot(`1008593`);
  });
});

describe('claim voucher', () => {
  let boughtUnits: BigNumber;
  let tokenId: BigNumber;

  beforeEach(async () => {
    boughtUnits = voucherUnit;

    tokenId = (
      await solvV2BondBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId,
        units: boughtUnits,
        externalPositionManager,
        externalPositionProxy: solvBondBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;

    // Warp time to maturity
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    // Update Oracle
    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.bonds.manualPriceOracle);

    // Set price to above the highestPrice so that the claim returns underlying
    await manualPriceOracle.setPrice(underlyingToken, currencyToken, maturity, highestPrice.mul(2));

    await voucherPool.setSettlePrice(slotId);
  });

  it('works as expected - partial claiming', async () => {
    const underlyingBalancePre = await underlyingToken.balanceOf(vaultProxy);

    const receipt = await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
      units: boughtUnits.div(2),
    });

    const underlyingBalancePost = await underlyingToken.balanceOf(vaultProxy);

    // Check that the vault has received some underlying
    expect(underlyingBalancePost).toBeGtBigNumber(underlyingBalancePre);

    // Check that the voucherTokenId is still stored
    const voucherTokenIds = await solvBondBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toEqual(1);
    const voucherTokenId = voucherTokenIds[0];
    expect(voucherTokenId.tokenId).toEqBigNumber(tokenId);
    expect(voucherTokenId.voucher).toMatchAddress(voucher);

    assertNoEvent(receipt, solvBondBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'));

    // Should receive underlying and currency tokens
    assertExternalPositionAssetsToReceive({ receipt, assets: [underlyingToken, currencyToken] });

    expect(receipt).toMatchInlineGasSnapshot(`362934`);
  });

  it('works as expected - full claiming with exact amount', async () => {
    const underlyingBalancePre = await underlyingToken.balanceOf(vaultProxy);

    const receipt = await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
      units: boughtUnits,
    });

    const underlyingBalancePost = await underlyingToken.balanceOf(vaultProxy);

    // Check that the vault has received some underlying
    expect(underlyingBalancePost).toBeGtBigNumber(underlyingBalancePre);

    // Check that the voucherTokenId has been removed
    const voucherTokenIds = await solvBondBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toEqual(0);

    assertEvent(receipt, solvBondBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'), {
      tokenId,
      voucher,
    });

    expect(receipt).toMatchInlineGasSnapshot(`371797`);
  });

  it('works as expected - full claiming with MAX_UINT', async () => {
    const underlyingBalancePre = await underlyingToken.balanceOf(vaultProxy);

    const receipt = await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
      units: constants.MaxUint256,
    });

    const underlyingBalancePost = await underlyingToken.balanceOf(vaultProxy);

    // Check that the vault has received some underlying
    expect(underlyingBalancePost).toBeGtBigNumber(underlyingBalancePre);

    // Check that the voucherTokenId has been removed
    const voucherTokenIds = await solvBondBuyerPosition.getVoucherTokenIds();
    expect(voucherTokenIds.length).toEqual(0);

    assertEvent(receipt, solvBondBuyerPosition.abi.getEvent('VoucherTokenIdRemoved'), {
      tokenId,
      voucher,
    });

    expect(receipt).toMatchInlineGasSnapshot(`372074`);
  });
});

describe('get managed assets', () => {
  let tokenId: BigNumber;

  beforeEach(async () => {
    await currencyToken.connect(issuer).approve(voucherPool, constants.MaxUint256);

    tokenId = (
      await solvV2BondBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId,
        units: voucherUnit,
        externalPositionManager,
        externalPositionProxy: solvBondBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;
  });

  it('reverts when holding a mature voucher with no settlement price', async () => {
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    expect(solvBondBuyerPosition.getManagedAssets.call()).rejects.toBeRevertedWith('Price not settled');
  });

  it('works as expected - settle price under lower bound', async () => {
    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    // Update Oracle to a manual price oracle to manipulate the price
    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.bonds.manualPriceOracle);

    await manualPriceOracle.setPrice(underlyingToken, currencyToken, maturity, lowestPrice.div(2));
    await voucherPool.setSettlePrice(slotId);

    const managedAssets = await solvBondBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(lowestPrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
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

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.bonds.manualPriceOracle);
    // Settlement price halfway between lowest and highest
    const settlePrice = lowestPrice.add(highestPrice).div(2);
    await manualPriceOracle.setPrice(underlyingToken, currencyToken, maturity, settlePrice);
    await voucherPool.setSettlePrice(slotId);

    const managedAssets = await solvBondBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(settlePrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
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

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.bonds.manualPriceOracle);
    await manualPriceOracle.setPrice(underlyingToken, currencyToken, maturity, highestPrice.mul(2));
    await voucherPool.setSettlePrice(slotId);

    const managedAssets = await solvBondBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(underlyingToken);

    const expectedAmount = voucherUnit.div(highestPrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
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

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.bonds.manualPriceOracle);
    await manualPriceOracle.setPrice(underlyingToken, currencyToken, maturity, lowestPrice);
    await voucherPool.setSettlePrice(slotId);

    const managedAssets = await solvBondBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(1);
    expect(managedAssets.assets_[0]).toMatchAddress(currencyToken);

    const expectedAmount = voucherUnit.mul(currencyUnit).div(voucherUnit);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedAmount);

    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);

    await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    const vaultCurrencyDelta = postVaultCurrencyBalance.sub(preVaultCurrencyBalance);
    expect(vaultCurrencyDelta).toEqBigNumber(expectedAmount);
  });

  it('works as expected - two vouchers with one refunded', async () => {
    // Create a second IVO
    const offerId2 = await initialBondOfferingMarket.nextOfferingId.call();

    // Parameters of the second IVO
    const { timestamp: timestamp2 } = await provider.getBlock('latest');
    const startTime2 = timestamp2;
    const endTime2 = timestamp2 + ONE_HOUR_IN_SECONDS;
    const maturity2 = endTime + ONE_WEEK_IN_SECONDS;

    const highestPrice2 = utils.parseUnits('2', 8);
    const lowestPrice2 = utils.parseUnits('0.5', 8);

    // Price of one unit. Has to be formatted as a zero-padded hex string of length 32
    const priceData2 = utils.hexZeroPad(currencyUnit.toHexString(), 32);

    // The amount of posted collateral for the IVO
    const tokenInAmount2 = underlyingUnit.mul(1000);

    // Create the second IVO
    await initialBondOfferingMarket
      .connect(issuer)
      .offer(voucher, currencyToken, '0', voucherUnit, startTime2, endTime2, false, 0, priceData2, {
        effectiveTime: startTime2,
        highestPrice: highestPrice2,
        lowestPrice: lowestPrice2,
        maturity: maturity2,
        tokenInAmount: tokenInAmount2,
      });

    const slotId2 = await voucher.getSlot(issuer, currencyToken, lowestPrice2, highestPrice2, startTime2, maturity2);

    // Buy second voucher
    const tokenId2 = (
      await solvV2BondBuyerPositionBuyOffering({
        comptrollerProxy,
        offerId: offerId2,
        units: voucherUnit,
        externalPositionManager,
        externalPositionProxy: solvBondBuyerPosition,
        signer: fundOwner,
      })
    ).tokenId;

    // Refund 1st voucher
    await voucherPool.connect(issuer).refund(slotId);

    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS + ONE_WEEK_IN_SECONDS]);
    await provider.send('evm_mine', []);

    await oracleManager._setVoucherOracle(voucher, fork.config.solvFinanceV2.bonds.manualPriceOracle);
    await manualPriceOracle.setPrice(underlyingToken, currencyToken, maturity, lowestPrice);
    await voucherPool.setSettlePrice(slotId);
    await voucherPool.setSettlePrice(slotId2);

    const managedAssets = await solvBondBuyerPosition.getManagedAssets.call();
    expect(managedAssets.assets_.length).toEqual(2);
    expect(managedAssets.assets_[0]).toMatchAddress(currencyToken);
    expect(managedAssets.assets_[1]).toMatchAddress(underlyingToken);

    const expectedCurrencyAmount = voucherUnit.mul(currencyUnit).div(voucherUnit);
    const expectedUnderlyingAmount = voucherUnit.div(lowestPrice);
    expect(managedAssets.amounts_[0]).toEqBigNumber(expectedCurrencyAmount);
    expect(managedAssets.amounts_[1]).toEqBigNumber(expectedUnderlyingAmount);

    const preVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    const preVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    // Claim first (refunded) voucher
    await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
      tokenId,
      voucher,
    });

    // Only the second voucher should now be part of managedAssets
    const postFirstClaimManagedAssets = await solvBondBuyerPosition.getManagedAssets.call();
    expect(postFirstClaimManagedAssets.assets_.length).toEqual(1);
    expect(postFirstClaimManagedAssets.assets_[0]).toMatchAddress(underlyingToken);

    expect(postFirstClaimManagedAssets.amounts_[0]).toEqBigNumber(expectedUnderlyingAmount);

    await solvV2BondBuyerPositionClaim({
      comptrollerProxy,
      externalPositionManager,
      externalPositionProxy: solvBondBuyerPosition,
      signer: fundOwner,
      tokenId: tokenId2,
      voucher,
    });

    const postVaultCurrencyBalance = await currencyToken.balanceOf(vaultProxy);
    const postVaultUnderlyingBalance = await underlyingToken.balanceOf(vaultProxy);

    const vaultCurrencyDelta = postVaultCurrencyBalance.sub(preVaultCurrencyBalance);
    const vaultUnderlyingDelta = postVaultUnderlyingBalance.sub(preVaultUnderlyingBalance);

    expect(vaultCurrencyDelta).toEqBigNumber(expectedCurrencyAmount);
    expect(vaultUnderlyingDelta).toEqBigNumber(expectedUnderlyingAmount);
  });
});
