import { extractEvent } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  ProtocolFeeReserveLib,
  ProtocolFeeTracker,
  StandardToken,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertEvent,
  assertNoEvent,
  buyShares,
  calcMlnValueAndBurnAmountForSharesBuyback,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
  redeemSharesForSpecificAssets,
  redeemSharesInKind,
} from '@enzymefinance/testutils';
import { BigNumber, BigNumberish } from 'ethers';

// Use a half year for fees just to not use exactly 1 year
const halfYearInSeconds = (60 * 60 * 24 * 365.25) / 2;
let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('buyBackProtocolFeeShares', () => {
  let protocolFeeReserveProxy: ProtocolFeeReserveLib;
  let fundOwner: SignerWithAddress, remainingAccounts: SignerWithAddress[];
  let denominationAsset: StandardToken, mln: StandardToken;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let preTxGav: BigNumberish, preTxSharesSupply: BigNumberish;
  let feeSharesCollected: BigNumberish;

  beforeEach(async () => {
    [fundOwner, ...remainingAccounts] = fork.accounts;

    protocolFeeReserveProxy = fork.deployment.protocolFeeReserveProxy;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    mln = new StandardToken(fork.config.primitives.mln, whales.mln);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      denominationAsset,
      // Invest the 1st time to give a positive supply of shares and allow accruing protocol fee
      investment: {
        buyer: fundOwner,
        investmentAmount: await getAssetUnit(denominationAsset),
        seedBuyer: true,
      },
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    // Warp time to accrue protocol fee, then pay the protocol fee to issue shares to the ProtocolFeeReserveProxy
    await provider.send('evm_increaseTime', [halfYearInSeconds]);

    // Redeem some shares to pay out the protocol fee
    await redeemSharesInKind({
      comptrollerProxy,
      signer: fundOwner,
      quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
    });

    feeSharesCollected = await vaultProxy.balanceOf(protocolFeeReserveProxy);
    expect(feeSharesCollected).toBeGtBigNumber(0);

    // Seed the fund with more MLN than needed to buyback the target shares
    // 1 MLN : 1 USDC is more than enough
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      assets: [mln],
      amounts: [await getAssetUnit(mln)],
    });

    preTxGav = await comptrollerProxy.calcGav.args(true).call();
    preTxSharesSupply = await vaultProxy.totalSupply();
  });

  it('cannot be called by a random user', async () => {
    const [randomUser] = remainingAccounts;

    await expect(
      comptrollerProxy.connect(randomUser).buyBackProtocolFeeShares(feeSharesCollected),
    ).rejects.toBeRevertedWith('Unauthorized');
  });

  it('happy path: buyback all shares collected (called by owner)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    const sharesToBuyBack = feeSharesCollected;

    const preTxVaultMlnBalance = await mln.balanceOf(vaultProxy);

    await comptrollerProxy.connect(fundOwner).buyBackProtocolFeeShares(sharesToBuyBack);

    const { mlnValue, mlnAmountToBurn } = await calcMlnValueAndBurnAmountForSharesBuyback({
      valueInterpreter,
      mln,
      denominationAsset,
      sharesSupply: preTxSharesSupply,
      gav: preTxGav,
      buybackSharesAmount: sharesToBuyBack,
    });
    expect(mlnValue).toBeGtBigNumber(0);

    // Assert that the correct amount of MLN was burned
    expect(await mln.balanceOf(vaultProxy)).toEqBigNumber(preTxVaultMlnBalance.sub(mlnAmountToBurn));

    // Assert that all shares of the ProtocolFeeReserveProxy were burned
    expect(await vaultProxy.balanceOf(protocolFeeReserveProxy)).toEqBigNumber(0);
  });

  it('happy path: buyback partial shares collected (called by asset manager)', async () => {
    // Add an asset manager
    const [assetManager] = remainingAccounts;
    await vaultProxy.addAssetManagers([assetManager]);

    const valueInterpreter = fork.deployment.valueInterpreter;

    const sharesToBuyBack = BigNumber.from(feeSharesCollected).div(4);

    const preTxVaultMlnBalance = await mln.balanceOf(vaultProxy);

    await comptrollerProxy.connect(fundOwner).buyBackProtocolFeeShares(sharesToBuyBack);

    const { mlnValue, mlnAmountToBurn } = await calcMlnValueAndBurnAmountForSharesBuyback({
      valueInterpreter,
      mln,
      denominationAsset,
      sharesSupply: preTxSharesSupply,
      gav: preTxGav,
      buybackSharesAmount: sharesToBuyBack,
    });
    expect(mlnValue).toBeGtBigNumber(0);

    // Assert that the correct amount of MLN was burned
    expect(await mln.balanceOf(vaultProxy)).toEqBigNumber(preTxVaultMlnBalance.sub(mlnAmountToBurn));

    // Assert that the correct number of shares of the ProtocolFeeReserveProxy were burned
    expect(await vaultProxy.balanceOf(protocolFeeReserveProxy)).toEqBigNumber(
      BigNumber.from(feeSharesCollected).sub(sharesToBuyBack),
    );
  });
});

describe('auto-buybacks', () => {
  let protocolFeeReserveProxy: ProtocolFeeReserveLib,
    protocolFeeTracker: ProtocolFeeTracker,
    valueInterpreter: ValueInterpreter;
  let fundOwner: SignerWithAddress;
  let denominationAsset: StandardToken, mln: StandardToken;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let preTxSharesSupply: BigNumberish;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;

    protocolFeeReserveProxy = fork.deployment.protocolFeeReserveProxy;
    protocolFeeTracker = fork.deployment.protocolFeeTracker;
    valueInterpreter = fork.deployment.valueInterpreter;

    denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    mln = new StandardToken(fork.config.primitives.mln, whales.mln);

    const newFundRes = await createNewFund({
      signer: fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      denominationAsset,
      // Invest the 1st time to give a positive supply of shares and allow accruing protocol fee
      investment: {
        buyer: fundOwner,
        investmentAmount: await getAssetUnit(denominationAsset),
        seedBuyer: true,
      },
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;

    // Get the initial shares supply
    preTxSharesSupply = await vaultProxy.totalSupply();

    // Turn on auto-buybacks
    await comptrollerProxy.setAutoProtocolFeeSharesBuyback(true);

    // Warp time to accrue protocol fee
    await provider.send('evm_increaseTime', [halfYearInSeconds]);

    // Reset call history to isolate new protocol fee events
    provider.history.clear();
  });

  describe('not enough MLN balance', () => {
    let gav: BigNumberish;

    beforeEach(async () => {
      // Seed the fund with a very small amount of MLN, not enough to buyback the target shares
      await addNewAssetsToFund({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        assets: [mln],
        amounts: [10],
      });

      gav = await comptrollerProxy.calcGav.args(true).call();
    });

    it('happy path: buyShares()', async () => {
      const receipt = await buyShares({
        comptrollerProxy,
        denominationAsset,
        buyer: fundOwner,
        seedBuyer: true,
      });

      // Parse newly-collected protocol fee shares from event
      const feePaidForVaultEvents = extractEvent(receipt, protocolFeeTracker.abi.getEvent('FeePaidForVault'));
      expect(feePaidForVaultEvents.length).toBe(1);
      const newFeeSharesCollected = feePaidForVaultEvents[0].args.sharesAmount;

      const totalProtocolFeeSharesCollected = await vaultProxy.balanceOf(protocolFeeReserveProxy);

      const { mlnValue } = await calcMlnValueAndBurnAmountForSharesBuyback({
        valueInterpreter,
        mln,
        denominationAsset,
        gav,
        sharesSupply: newFeeSharesCollected.add(preTxSharesSupply),
        buybackSharesAmount: totalProtocolFeeSharesCollected,
      });
      expect(mlnValue).toBeGtBigNumber(0);

      // Assert the failure event was correctly fired
      assertEvent(receipt, 'BuyBackMaxProtocolFeeSharesFailed', {
        failureReturnData: expect.any(String),
        sharesAmount: totalProtocolFeeSharesCollected,
        buybackValueInMln: mlnValue,
        gav,
      });

      // Assert the shares buyback event was not fired
      assertNoEvent(receipt, protocolFeeReserveProxy.abi.getEvent('SharesBoughtBack'));
    });

    it('happy path: redeemSharesInKind() - redeem full', async () => {
      const receipt = await redeemSharesInKind({
        comptrollerProxy,
        signer: fundOwner,
      });

      // Parse newly-collected protocol fee shares from event
      const feePaidForVaultEvents = extractEvent(receipt, protocolFeeTracker.abi.getEvent('FeePaidForVault'));
      expect(feePaidForVaultEvents.length).toBe(1);
      const newFeeSharesCollected = feePaidForVaultEvents[0].args.sharesAmount;

      const totalProtocolFeeSharesCollected = await vaultProxy.balanceOf(protocolFeeReserveProxy);

      const { mlnValue } = await calcMlnValueAndBurnAmountForSharesBuyback({
        valueInterpreter,
        mln,
        denominationAsset,
        gav,
        sharesSupply: newFeeSharesCollected.add(preTxSharesSupply),
        buybackSharesAmount: totalProtocolFeeSharesCollected,
      });
      expect(mlnValue).toBeGtBigNumber(0);

      // Assert the failure event was correctly fired
      assertEvent(receipt, 'BuyBackMaxProtocolFeeSharesFailed', {
        failureReturnData: expect.any(String),
        sharesAmount: totalProtocolFeeSharesCollected,
        buybackValueInMln: mlnValue,
        gav,
      });

      // Assert the shares buyback event was not fired
      assertNoEvent(receipt, protocolFeeReserveProxy.abi.getEvent('SharesBoughtBack'));
    });

    it('happy path: redeemSharesForSpecifiedAssets() - redeem partial', async () => {
      const receipt = await redeemSharesForSpecificAssets({
        comptrollerProxy,
        signer: fundOwner,
        quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
        payoutAssets: [denominationAsset],
        payoutAssetPercentages: [10000],
      });

      // Parse newly-collected protocol fee shares from event
      const feePaidForVaultEvents = extractEvent(receipt, protocolFeeTracker.abi.getEvent('FeePaidForVault'));
      expect(feePaidForVaultEvents.length).toBe(1);
      const newFeeSharesCollected = feePaidForVaultEvents[0].args.sharesAmount;

      const totalProtocolFeeSharesCollected = await vaultProxy.balanceOf(protocolFeeReserveProxy);

      const { mlnValue } = await calcMlnValueAndBurnAmountForSharesBuyback({
        valueInterpreter,
        mln,
        denominationAsset,
        gav,
        sharesSupply: newFeeSharesCollected.add(preTxSharesSupply),
        buybackSharesAmount: totalProtocolFeeSharesCollected,
      });
      expect(mlnValue).toBeGtBigNumber(0);

      // Assert the failure event was correctly fired
      assertEvent(receipt, 'BuyBackMaxProtocolFeeSharesFailed', {
        failureReturnData: expect.any(String),
        sharesAmount: totalProtocolFeeSharesCollected,
        buybackValueInMln: mlnValue,
        gav,
      });

      // Assert the shares buyback event was not fired
      assertNoEvent(receipt, protocolFeeReserveProxy.abi.getEvent('SharesBoughtBack'));
    });
  });

  describe('enough MLN balance', () => {
    let preTxGav: BigNumberish;

    beforeEach(async () => {
      // Seed the fund with more MLN than needed to buyback the target shares
      // 1 MLN : 1 USDC is more than enough
      await addNewAssetsToFund({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        assets: [mln],
        amounts: [await getAssetUnit(mln)],
      });

      preTxGav = await comptrollerProxy.calcGav.args(true).call();
    });

    it('happy path: buyShares()', async () => {
      const receipt = await buyShares({
        comptrollerProxy,
        denominationAsset,
        buyer: fundOwner,
        seedBuyer: true,
      });

      // Assert via event that protocol fee shares were bought back
      const sharesBoughtBackEvents = extractEvent(receipt, protocolFeeReserveProxy.abi.getEvent('SharesBoughtBack'));
      expect(sharesBoughtBackEvents.length).toBe(1);
      const sharesBoughtBackArgs = sharesBoughtBackEvents[0].args;
      expect(sharesBoughtBackArgs.vaultProxy).toMatchAddress(vaultProxy);

      // Parse newly-collected protocol fee shares from event
      const feePaidForVaultEvents = extractEvent(receipt, protocolFeeTracker.abi.getEvent('FeePaidForVault'));
      expect(feePaidForVaultEvents.length).toBe(1);
      const feeSharesCollected = feePaidForVaultEvents[0].args.sharesAmount;
      expect(feeSharesCollected).toBeGteBigNumber(0);

      const { mlnValue, mlnAmountToBurn } = await calcMlnValueAndBurnAmountForSharesBuyback({
        valueInterpreter,
        mln,
        denominationAsset,
        sharesSupply: feeSharesCollected.add(preTxSharesSupply),
        gav: preTxGav,
        buybackSharesAmount: sharesBoughtBackArgs.sharesAmount,
      });
      expect(mlnValue).toBeGtBigNumber(0);

      // Assert correct MLN value and burned amounts
      expect(sharesBoughtBackArgs.mlnValue).toEqBigNumber(mlnValue);
      expect(sharesBoughtBackArgs.mlnBurned).toEqBigNumber(mlnAmountToBurn);
    });

    it('happy path: redeemSharesInKind() - redeem full', async () => {
      const receipt = await redeemSharesInKind({
        comptrollerProxy,
        signer: fundOwner,
      });

      // Assert via event that protocol fee shares were bought back
      const events = extractEvent(receipt, protocolFeeReserveProxy.abi.getEvent('SharesBoughtBack'));
      expect(events.length).toBe(1);
      const sharesBoughtBackArgs = events[0].args;
      expect(sharesBoughtBackArgs.vaultProxy).toMatchAddress(vaultProxy);

      // Parse newly-collected protocol fee shares from event
      const feePaidForVaultEvents = extractEvent(receipt, protocolFeeTracker.abi.getEvent('FeePaidForVault'));
      expect(feePaidForVaultEvents.length).toBe(1);
      const feeSharesCollected = feePaidForVaultEvents[0].args.sharesAmount;
      expect(feeSharesCollected).toBeGteBigNumber(0);

      const { mlnValue, mlnAmountToBurn } = await calcMlnValueAndBurnAmountForSharesBuyback({
        valueInterpreter,
        mln,
        denominationAsset,
        sharesSupply: feeSharesCollected.add(preTxSharesSupply),
        gav: preTxGav,
        buybackSharesAmount: sharesBoughtBackArgs.sharesAmount,
      });
      expect(mlnValue).toBeGtBigNumber(0);

      // Assert correct MLN value and burned amounts
      expect(sharesBoughtBackArgs.mlnValue).toEqBigNumber(mlnValue);
      expect(sharesBoughtBackArgs.mlnBurned).toEqBigNumber(mlnAmountToBurn);
    });

    it('happy path: redeemSharesForSpecifiedAssets() - redeem partial', async () => {
      // Use a very small shares amount since fund has been inflated with a lot of MLN
      const receipt = await redeemSharesForSpecificAssets({
        comptrollerProxy,
        signer: fundOwner,
        quantity: 1000,
        payoutAssets: [denominationAsset],
        payoutAssetPercentages: [10000],
      });

      // Assert via event that protocol fee shares were bought back
      const events = extractEvent(receipt, protocolFeeReserveProxy.abi.getEvent('SharesBoughtBack'));
      expect(events.length).toBe(1);
      const sharesBoughtBackArgs = events[0].args;
      expect(sharesBoughtBackArgs.vaultProxy).toMatchAddress(vaultProxy);

      // Parse newly-collected protocol fee shares from event
      const feePaidForVaultEvents = extractEvent(receipt, protocolFeeTracker.abi.getEvent('FeePaidForVault'));
      expect(feePaidForVaultEvents.length).toBe(1);
      const feeSharesCollected = feePaidForVaultEvents[0].args.sharesAmount;
      expect(feeSharesCollected).toBeGteBigNumber(0);

      const { mlnValue, mlnAmountToBurn } = await calcMlnValueAndBurnAmountForSharesBuyback({
        valueInterpreter,
        mln,
        denominationAsset,
        sharesSupply: feeSharesCollected.add(preTxSharesSupply),
        gav: preTxGav,
        buybackSharesAmount: sharesBoughtBackArgs.sharesAmount,
      });
      expect(mlnValue).toBeGtBigNumber(0);

      // Assert correct MLN value and burned amounts
      expect(sharesBoughtBackArgs.mlnValue).toEqBigNumber(mlnValue);
      expect(sharesBoughtBackArgs.mlnBurned).toEqBigNumber(mlnAmountToBurn);
    });
  });
});
