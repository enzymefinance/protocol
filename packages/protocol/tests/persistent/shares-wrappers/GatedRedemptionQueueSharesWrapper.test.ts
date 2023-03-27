import type { ContractReceipt } from '@enzymefinance/ethers';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  GatedRedemptionQueueSharesWrapperFactory,
  GatedRedemptionQueueSharesWrapperLib,
  GatedRedemptionQueueSharesWrapperRedemptionWindowConfig,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  GatedRedemptionQueueSharesWrapperNativeAssetAddress,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  ONE_HUNDRED_PERCENT_IN_WEI,
  ONE_PERCENT_IN_WEI,
  TEN_PERCENT_IN_WEI,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  assertEvent,
  createNewFund,
  deployGatedRedemptionQueueSharesWrapper,
  deployProtocolFixture,
  getAssetUnit,
  setAccountBalance,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import { BigNumber, constants } from 'ethers';

const randomAddressValue = randomAddress();

let fork: ProtocolDeployment;

let sharesWrapperFactory: GatedRedemptionQueueSharesWrapperFactory;
let fundOwner: SignerWithAddress,
  manager: SignerWithAddress,
  investor1: SignerWithAddress,
  investor2: SignerWithAddress,
  investor3: SignerWithAddress,
  randomUser: SignerWithAddress;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let denominationAsset: ITestStandardToken, denominationAssetUnit: BigNumber;
let sharesUnit: BigNumber;
let sharesWrapper: GatedRedemptionQueueSharesWrapperLib;
let sharesWrapperDeploymentReceipt: ContractReceipt<any>;
let redemptionAsset: ITestStandardToken;
let redemptionWindowConfig: GatedRedemptionQueueSharesWrapperRedemptionWindowConfig;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  [fundOwner, manager, investor1, investor2, investor3, randomUser] = fork.accounts;
  sharesWrapperFactory = fork.deployment.gatedRedemptionQueueSharesWrapperFactory;

  denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);
  denominationAssetUnit = await getAssetUnit(denominationAsset);

  // Deploy a new fund
  const newFundRes = await createNewFund({
    denominationAsset,
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

  sharesUnit = await getAssetUnit(vaultProxy);

  // Define config
  redemptionAsset = denominationAsset;
  redemptionWindowConfig = {
    firstWindowStart: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS * 10,
    frequency: ONE_DAY_IN_SECONDS * 30,
    duration: ONE_DAY_IN_SECONDS * 7,
    relativeSharesCap: TEN_PERCENT_IN_WEI,
  };

  // Deploy a wrapper with defined config
  const deploySharesWrapperRes = await deployGatedRedemptionQueueSharesWrapper({
    signer: randomUser,
    sharesWrapperFactory,
    vaultProxy,
    managers: [manager],
    redemptionAsset,
    useDepositApprovals: false,
    useRedemptionApprovals: false,
    useTransferApprovals: false,
    redemptionWindowConfig,
  });
  sharesWrapper = deploySharesWrapperRes.sharesWrapper;
  sharesWrapperDeploymentReceipt = deploySharesWrapperRes.receipt;

  // Seed relevant accounts with denomination asset
  const seedAmount = denominationAssetUnit.mul(1000);
  await setAccountBalance({ account: investor1, amount: seedAmount, provider, token: denominationAsset });
  await setAccountBalance({ account: investor2, amount: seedAmount, provider, token: denominationAsset });
  await setAccountBalance({ account: investor3, amount: seedAmount, provider, token: denominationAsset });

  // Grant max denominationAsset approval for each investor
  await denominationAsset.connect(investor1).approve(sharesWrapper, constants.MaxUint256);
  await denominationAsset.connect(investor2).approve(sharesWrapper, constants.MaxUint256);
  await denominationAsset.connect(investor3).approve(sharesWrapper, constants.MaxUint256);

  // Turn off protocol fees to make calcs easier
  await fork.deployment.protocolFeeTracker.setFeeBpsDefault(0);
});

describe('library', () => {
  it('has valid ERC20 properties', async () => {
    const sharesWrapperLib = fork.deployment.gatedRedemptionQueueSharesWrapperLib;

    expect(await sharesWrapperLib.name()).toBe('Wrapped Enzyme Shares Lib');
    expect(await sharesWrapperLib.symbol()).toBe(`wENZF-lib`);
  });
});

describe('init', () => {
  it('cannot be called twice', async () => {
    // shares wrapper is already deployed

    await expect(
      sharesWrapper.init(vaultProxy, [], redemptionAsset, true, true, true, redemptionWindowConfig),
    ).rejects.toBeRevertedWith('Initialized');
  });

  it('does not allow an invalid vault', async () => {
    await expect(
      deployGatedRedemptionQueueSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy: randomAddressValue,
        managers: [manager],
        redemptionAsset,
        useDepositApprovals: true,
        useRedemptionApprovals: true,
        useTransferApprovals: true,
        redemptionWindowConfig,
      }),
    ).rejects.toBeRevertedWith('Invalid vault');
  });

  it('happy path', async () => {
    // shares wrapper is already deployed

    // Initial wrapper config is tested in factory

    // ERC20 properties
    const sharesName = await vaultProxy.name();
    expect(await sharesWrapper.name()).toBe(`Wrapped ${sharesName}`);
    const sharesSymbol = await vaultProxy.symbol();
    expect(await sharesWrapper.symbol()).toBe(`w${sharesSymbol}`);
    expect(await sharesWrapper.decimals()).toEqBigNumber(18);

    assertEvent(sharesWrapperDeploymentReceipt, sharesWrapper.abi.getEvent('Initialized'), {
      vaultProxy,
    });
  });
});

describe('investment flow', () => {
  describe('deposit', () => {
    it('reverts if insufficient shares are received', async () => {
      await expect(
        sharesWrapper.connect(investor1).deposit(denominationAsset, denominationAssetUnit, constants.MaxUint256),
      ).rejects.toBeRevertedWith('Insufficient shares');
    });

    it('happy path', async () => {
      const deposit1AmountInUnits = 11;
      const deposit2AmountInUnits = 3;

      const deposit1Amount = denominationAssetUnit.mul(deposit1AmountInUnits);
      const deposit2Amount = denominationAssetUnit.mul(deposit2AmountInUnits);

      const expectedSharesReceived1 = sharesUnit.mul(deposit1AmountInUnits);
      const expectedSharesReceived2 = sharesUnit.mul(deposit2AmountInUnits);

      // Investor1: deposits
      const deposit1Receipt = await sharesWrapper.connect(investor1).deposit(denominationAsset, deposit1Amount, 1);

      // The expected supply should have been minted by vault => shares wrapper => investor
      const investor1WrappedShares = await sharesWrapper.balanceOf(investor1);
      expect(investor1WrappedShares).toEqBigNumber(expectedSharesReceived1);
      expect(await vaultProxy.balanceOf(sharesWrapper)).toEqBigNumber(investor1WrappedShares);

      // The supplies of vault and wrapper should be investor1's balance
      expect(await sharesWrapper.totalSupply()).toEqBigNumber(investor1WrappedShares);
      expect(await vaultProxy.totalSupply()).toEqBigNumber(investor1WrappedShares);

      // Assert event
      assertEvent(deposit1Receipt, 'Deposited', {
        user: investor1.address,
        depositToken: denominationAsset.address,
        depositTokenAmount: deposit1Amount,
        sharesReceived: investor1WrappedShares,
      });

      // Investor2: deposits
      const deposit2Receipt = await sharesWrapper.connect(investor2).deposit(denominationAsset, deposit2Amount, 1);

      // The expected supply should have been minted by vault => shares wrapper => investor
      const investor2WrappedShares = await sharesWrapper.balanceOf(investor2);
      expect(investor2WrappedShares).toEqBigNumber(expectedSharesReceived2);

      // The supplies of vault and wrapper should be the total of both investor balances
      const expectedTotalShares = investor1WrappedShares.add(investor2WrappedShares);
      expect(await sharesWrapper.totalSupply()).toEqBigNumber(expectedTotalShares);
      expect(await vaultProxy.totalSupply()).toEqBigNumber(expectedTotalShares);

      // Since not in the redemption window, relative shares should not have been checkpointed
      expect((await sharesWrapper.getRedemptionQueue()).relativeSharesCheckpointed_).toEqBigNumber(0);

      // Assert event
      assertEvent(deposit2Receipt, 'Deposited', {
        user: investor2.address,
        depositToken: denominationAsset.address,
        depositTokenAmount: deposit2Amount,
        sharesReceived: investor2WrappedShares,
      });

      // Check the gas of both deposits
      expect(deposit1Receipt).toMatchInlineGasSnapshot('381493');
      expect(deposit2Receipt).toMatchInlineGasSnapshot('268185');
    });

    it('happy path: within redemption window', async () => {
      // Deposit and add shares to redemption queue
      await sharesWrapper.connect(investor1).deposit(denominationAsset, denominationAssetUnit, 1);
      await sharesWrapper.connect(investor1).requestRedeem(await sharesWrapper.balanceOf(investor1));

      // Warp to redemption window
      const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
        (await provider.getBlock('latest')).timestamp,
      );
      await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

      // Deposit some more
      const depositInWindowReceipt = await sharesWrapper
        .connect(investor1)
        .deposit(denominationAsset, denominationAssetUnit, 1);

      // Since in the redemption window, relative shares should have been checkpointed
      expect((await sharesWrapper.getRedemptionQueue()).relativeSharesCheckpointed_).toEqBigNumber(
        await transactionTimestamp(depositInWindowReceipt),
      );
    });

    describe('uses deposit approvals', () => {
      beforeEach(async () => {
        await sharesWrapper.connect(manager).setUseDepositApprovals(true);
      });

      it('does not allow using a non-exact approval amount', async () => {
        const investor1ApprovalAmount = denominationAssetUnit.mul(3);

        await sharesWrapper
          .connect(manager)
          .setDepositApprovals([investor1], [denominationAsset], [investor1ApprovalAmount]);

        const badDepositAmount = investor1ApprovalAmount.sub(1);

        await expect(
          sharesWrapper.connect(investor1).deposit(denominationAsset, badDepositAmount, 1),
        ).rejects.toBeRevertedWith('Approval mismatch');
      });

      it('happy path', async () => {
        const investor1ApprovalAmount = denominationAssetUnit.mul(3);

        await sharesWrapper
          .connect(manager)
          .setDepositApprovals([investor1], [denominationAsset], [investor1ApprovalAmount]);

        // Deposit works
        await sharesWrapper.connect(investor1).deposit(denominationAsset, investor1ApprovalAmount, 1);

        // Approval should be removed
        expect(await sharesWrapper.getDepositApproval(investor1, denominationAsset)).toEqBigNumber(0);
      });

      it.todo('happy path: unlimited approval');
    });
  });

  describe('requestRedeem', () => {
    beforeEach(async () => {
      const deposit1Amount = denominationAssetUnit.mul(11);
      const deposit2Amount = denominationAssetUnit.mul(3);

      // Both investors deposit
      await sharesWrapper.connect(investor1).deposit(denominationAsset, deposit1Amount, 1);
      await sharesWrapper.connect(investor2).deposit(denominationAsset, deposit2Amount, 1);
    });

    it('cannot be called inside a redemption window', async () => {
      // Warp to redemption window
      const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
        (await provider.getBlock('latest')).timestamp,
      );
      await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

      await expect(sharesWrapper.connect(investor1).requestRedeem(1)).rejects.toBeRevertedWith(
        'Inside redemption window',
      );
    });

    it('does not allow user without enough shares', async () => {
      const investor1Shares = await sharesWrapper.balanceOf(investor1);
      await expect(sharesWrapper.connect(investor1).requestRedeem(investor1Shares.add(1))).rejects.toBeRevertedWith(
        'Exceeds balance',
      );
    });

    it('happy path', async () => {
      const investor1Shares = await sharesWrapper.balanceOf(investor1);

      const investor1RedemptionAmount1 = investor1Shares.div(7);
      const investor1RedemptionAmount2 = investor1Shares.div(7);
      const investor2RedemptionAmount = investor1Shares.div(5);
      const expectedTotalSharesPending = investor1RedemptionAmount1
        .add(investor1RedemptionAmount2)
        .add(investor2RedemptionAmount);

      // Request redemption for both investors
      const request1Receipt = await sharesWrapper.connect(investor1).requestRedeem(investor1RedemptionAmount1);
      const request2Receipt = await sharesWrapper.connect(investor2).requestRedeem(investor2RedemptionAmount);

      // Do an additional request for investor1 (test additive nature of redemptions)
      await sharesWrapper.connect(investor1).requestRedeem(investor1RedemptionAmount2);

      // Validate queue and user requests
      expect(await sharesWrapper.getRedemptionQueue()).toMatchFunctionOutput(sharesWrapper.getRedemptionQueue, {
        totalSharesPending_: expectedTotalSharesPending,
        relativeSharesAllowed_: 0,
        relativeSharesCheckpointed_: 0,
      });
      expect(await sharesWrapper.getRedemptionQueueUsersLength()).toEqBigNumber(2);
      expect(await sharesWrapper.getRedemptionQueueUserByIndex(0)).toMatchAddress(investor1);
      expect(await sharesWrapper.getRedemptionQueueUserByIndex(1)).toMatchAddress(investor2);
      expect(await sharesWrapper.getRedemptionQueueUsers()).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUsers,
        [investor1.address, investor2.address],
      );
      expect(await sharesWrapper.getRedemptionQueueUserRequest(investor1)).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUserRequest,
        {
          index: 0,
          lastRedeemed: 0,
          sharesPending: investor1RedemptionAmount1.add(investor1RedemptionAmount2),
        },
      );
      expect(await sharesWrapper.getRedemptionQueueUserRequest(investor2)).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUserRequest,
        {
          index: 1,
          lastRedeemed: 0,
          sharesPending: investor2RedemptionAmount,
        },
      );

      // Assert events
      assertEvent(request1Receipt, 'RedemptionRequestAdded', {
        user: investor1.address,
        sharesAmount: investor1RedemptionAmount1,
      });
      assertEvent(request2Receipt, 'RedemptionRequestAdded', {
        user: investor2.address,
        sharesAmount: investor2RedemptionAmount,
      });

      // Check the gas of both requests
      expect(request1Receipt).toMatchInlineGasSnapshot('132863');
      expect(request2Receipt).toMatchInlineGasSnapshot('98639');
    });

    describe('uses redemption approvals', () => {
      beforeEach(async () => {
        await sharesWrapper.connect(manager).setUseRedemptionApprovals(true);
      });

      it('does not allow using more than approval amount', async () => {
        await expect(sharesWrapper.connect(investor1).requestRedeem(1)).rejects.toBeRevertedWith('Exceeds approval');
      });

      it('happy path', async () => {
        const investor1ApprovalAmount = 123;

        await sharesWrapper.connect(manager).setRedemptionApprovals([investor1], [investor1ApprovalAmount]);

        // Partial redemption request works
        await sharesWrapper.connect(investor1).requestRedeem(1);

        // Approval should be removed
        expect(await sharesWrapper.getRedemptionApproval(investor1)).toEqBigNumber(0);
      });

      it.todo('happy path: unlimited approval');
    });
  });

  describe('cancelRequestRedeem', () => {
    beforeEach(async () => {
      const deposit1Amount = denominationAssetUnit.mul(11);
      const deposit2Amount = denominationAssetUnit.mul(3);

      // Both investors deposit
      await sharesWrapper.connect(investor1).deposit(denominationAsset, deposit1Amount, 1);
      await sharesWrapper.connect(investor2).deposit(denominationAsset, deposit2Amount, 1);
    });

    it('cannot be called inside of redemption window', async () => {
      // Warp to redemption window
      const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
        (await provider.getBlock('latest')).timestamp,
      );
      await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

      await expect(sharesWrapper.connect(investor1).cancelRequestRedeem()).rejects.toBeRevertedWith(
        'Inside redemption window',
      );
    });

    it('cannot be called if the user has no request', async () => {
      await expect(sharesWrapper.connect(investor1).cancelRequestRedeem()).rejects.toBeRevertedWith('No request');
    });

    it('happy path', async () => {
      const investor1RequestAmount = (await sharesWrapper.balanceOf(investor1)).div(5);
      const investor2RequestAmount = (await sharesWrapper.balanceOf(investor2)).div(5);
      const preCancelTotalSharesPending = investor1RequestAmount.add(investor2RequestAmount);

      // Both investors request to redeem
      await sharesWrapper.connect(investor1).requestRedeem(investor1RequestAmount);
      await sharesWrapper.connect(investor2).requestRedeem(investor2RequestAmount);

      // Investor1 cancels their request
      const receipt = await sharesWrapper.connect(investor1).cancelRequestRedeem();

      // Investor1 should be removed from the queue
      expect((await sharesWrapper.getRedemptionQueue()).totalSharesPending_).toEqBigNumber(
        preCancelTotalSharesPending.sub(investor1RequestAmount),
      );
      expect(await sharesWrapper.getRedemptionQueueUsers()).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUsers,
        [investor2],
      );
      expect(await sharesWrapper.getRedemptionQueueUserRequest(investor1)).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUserRequest,
        {
          index: 0,
          lastRedeemed: 0,
          sharesPending: 0,
        },
      );
      expect(await sharesWrapper.getRedemptionQueueUserRequest(investor2)).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUserRequest,
        {
          index: 0,
          lastRedeemed: 0,
          sharesPending: investor2RequestAmount,
        },
      );

      // Assert event
      assertEvent(receipt, 'RedemptionRequestRemoved', {
        user: investor1.address,
      });

      expect(receipt).toMatchInlineGasSnapshot('60158');
    });
  });

  describe('redeemFromQueue', () => {
    beforeEach(async () => {
      const deposit1Amount = denominationAssetUnit.mul(11);
      const deposit2Amount = denominationAssetUnit.mul(3);
      const deposit3Amount = denominationAssetUnit.mul(5);

      // All investors deposit
      await sharesWrapper.connect(investor1).deposit(denominationAsset, deposit1Amount, 1);
      await sharesWrapper.connect(investor2).deposit(denominationAsset, deposit2Amount, 1);
      await sharesWrapper.connect(investor3).deposit(denominationAsset, deposit3Amount, 1);
    });

    describe('two investors in queue', () => {
      let investor1SharesAmount: BigNumber, investor2SharesAmount: BigNumber;
      let investor1RedemptionAmount: BigNumber, investor2RedemptionAmount: BigNumber;

      beforeEach(async () => {
        investor1SharesAmount = await sharesWrapper.balanceOf(investor1);
        investor2SharesAmount = await sharesWrapper.balanceOf(investor2);

        // Define arbitrary redemption request amounts
        investor1RedemptionAmount = investor1SharesAmount.div(3);
        investor2RedemptionAmount = investor2SharesAmount.div(3);

        // Investors 1 and 2 request to redeem
        await sharesWrapper.connect(investor1).requestRedeem(investor1RedemptionAmount);
        await sharesWrapper.connect(investor2).requestRedeem(investor2RedemptionAmount);
      });

      it('does not allow calls outside the redemption window', async () => {
        // Prior to 1st redemption window should fail
        await expect(sharesWrapper.connect(manager).redeemFromQueue(0, 0)).rejects.toBeRevertedWith(
          'Outside redemption window',
        );

        // Warp just beyond 1st redemption window end, and should fail again
        const firstWindowEnd = BigNumber.from(redemptionWindowConfig.firstWindowStart).add(
          redemptionWindowConfig.duration,
        );
        const secsUntilWindowEnd = firstWindowEnd.sub((await provider.getBlock('latest')).timestamp);
        await provider.send('evm_increaseTime', [secsUntilWindowEnd.toNumber() + 1]);

        await expect(sharesWrapper.connect(manager).redeemFromQueue(0, 0)).rejects.toBeRevertedWith(
          'Outside redemption window',
        );
      });

      it('does not allow an out-of-range _endIndex', async () => {
        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

        await expect(sharesWrapper.connect(manager).redeemFromQueue(0, 100)).rejects.toBeRevertedWith(
          'Out-of-range _endIndex',
        );
      });

      it('does not allow an _endIndex smaller than the _startIndex', async () => {
        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

        await expect(sharesWrapper.connect(manager).redeemFromQueue(1, 0)).rejects.toBeRevertedWith(
          'Misordered indexes',
        );
      });

      it('does not allow a second redemption for a user in the window', async () => {
        // Set the cap below the queued shares total, so the user only redeems partially
        const nextRedemptionWindowConfig = redemptionWindowConfig;
        nextRedemptionWindowConfig.relativeSharesCap = ONE_PERCENT_IN_WEI;
        await sharesWrapper.connect(manager).setRedemptionWindowConfig(nextRedemptionWindowConfig);

        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

        // Redeeming investor2 should work the first time
        await sharesWrapper.connect(manager).redeemFromQueue(1, 1);

        // It should not work the second time
        await expect(sharesWrapper.connect(manager).redeemFromQueue(1, 1)).rejects.toBeRevertedWith(
          'Already redeemed in window',
        );
      });

      it('happy path: above cap, redeem entire queue', async () => {
        // Set the cap below the queued shares total
        const nextRedemptionWindowConfig = redemptionWindowConfig;
        nextRedemptionWindowConfig.relativeSharesCap = ONE_PERCENT_IN_WEI;
        await sharesWrapper.connect(manager).setRedemptionWindowConfig(nextRedemptionWindowConfig);

        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

        const preRedeemInvestor1RedemptionAssetBal = await redemptionAsset.balanceOf(investor1);
        const preRedeemInvestor2RedemptionAssetBal = await redemptionAsset.balanceOf(investor2);
        const preRedeemVaultRedemptionAssetBal = await redemptionAsset.balanceOf(vaultProxy);
        const preRedeemWrapperSupply = await sharesWrapper.totalSupply();

        // Redeem entire queue
        const receipt = await sharesWrapper.connect(manager).redeemFromQueue(0, constants.MaxUint256);

        // Allow some tolerance for shares redeemed and asset received calcs
        const expectedAmountsTolerance = 10;

        // Validate the cap worked as-intended, by checking the total amount of shares redeemed
        const postRedeemWrapperSupply = await sharesWrapper.totalSupply();
        const expectedRedeemedSharesTotal = preRedeemWrapperSupply
          .mul(nextRedemptionWindowConfig.relativeSharesCap)
          .div(ONE_HUNDRED_PERCENT_IN_WEI);
        expect(postRedeemWrapperSupply).toBeAroundBigNumber(
          preRedeemWrapperSupply.sub(expectedRedeemedSharesTotal),
          expectedAmountsTolerance,
        );

        // Calculate the expected amounts of shares redeemed and asset received, based on the stored relativeSharesAllowed
        const relativeSharesAllowed = (await sharesWrapper.getRedemptionQueue()).relativeSharesAllowed_;
        const [expectedInvestor1SharesRedeemed, expectedInvestor2SharesRedeemed] = [
          investor1RedemptionAmount,
          investor2RedemptionAmount,
        ].map((amount) => amount.mul(relativeSharesAllowed).div(ONE_HUNDRED_PERCENT_IN_WEI));
        const [expectedInvestor1Payout, expectedInvestor2Payout] = [
          expectedInvestor1SharesRedeemed,
          expectedInvestor2SharesRedeemed,
        ].map((sharesRedeemed) => sharesRedeemed.mul(preRedeemVaultRedemptionAssetBal).div(preRedeemWrapperSupply));

        // Validate the users had their shares burned correctly
        expect(await sharesWrapper.balanceOf(investor1)).toEqBigNumber(
          investor1SharesAmount.sub(expectedInvestor1SharesRedeemed),
        );
        expect(await sharesWrapper.balanceOf(investor2)).toEqBigNumber(
          investor2SharesAmount.sub(expectedInvestor2SharesRedeemed),
        );

        // Validate each user received the expected amount of redemption asset
        expect(await redemptionAsset.balanceOf(investor1)).toBeAroundBigNumber(
          preRedeemInvestor1RedemptionAssetBal.add(expectedInvestor1Payout),
          expectedAmountsTolerance,
        );
        expect(await redemptionAsset.balanceOf(investor2)).toBeAroundBigNumber(
          preRedeemInvestor2RedemptionAssetBal.add(expectedInvestor2Payout),
          expectedAmountsTolerance,
        );

        // Validate the shares wrapper and vault have equal balances
        expect(postRedeemWrapperSupply).toEqBigNumber(await vaultProxy.totalSupply());

        // Assert events
        // Queue slice is iterated backwards from end
        const events = extractEvent(receipt, 'Redeemed');
        expect(events.length).toBe(2);
        expect(events[0]).toMatchEventArgs({
          user: investor2,
          sharesAmount: expectedInvestor2SharesRedeemed,
        });
        expect(events[1]).toMatchEventArgs({
          user: investor1,
          sharesAmount: expectedInvestor1SharesRedeemed,
        });

        // Queue and request updating is validated in the three-investor tests below
      });

      it('happy path: above cap, redeem two users in separate txs', async () => {
        // Here, we are mostly interested in relative shares only being checkpointed once

        // Set the cap below the queued shares total, so the user only redeems partially
        const nextRedemptionWindowConfig = redemptionWindowConfig;
        nextRedemptionWindowConfig.relativeSharesCap = ONE_PERCENT_IN_WEI;
        await sharesWrapper.connect(manager).setRedemptionWindowConfig(nextRedemptionWindowConfig);

        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

        // Redeem investor1
        await sharesWrapper.connect(manager).redeemFromQueue(0, 0);

        const queueAfterFirstRedemption = await sharesWrapper.getRedemptionQueue();

        // Then redeem investor2
        await sharesWrapper.connect(manager).redeemFromQueue(1, 1);

        // The relativeSharesAllowed should not have been set again during the 2nd tx
        const queueAfterSecondRedemption = await sharesWrapper.getRedemptionQueue();
        expect(queueAfterSecondRedemption.relativeSharesAllowed_).toEqBigNumber(
          queueAfterFirstRedemption.relativeSharesAllowed_,
        );
        expect(queueAfterSecondRedemption.relativeSharesCheckpointed_).toEqBigNumber(
          queueAfterFirstRedemption.relativeSharesCheckpointed_,
        );
      });

      it('happy path: redeem for native asset', async () => {
        const wrappedNativeAsset = new ITestStandardToken(fork.config.wrappedNativeAsset, provider);

        // Set redemption asset to native asset
        await sharesWrapper.connect(manager).setRedemptionAsset(GatedRedemptionQueueSharesWrapperNativeAssetAddress);

        // Add a ton of wrapped native asset to the fund so that redemptions can be filled
        const gav = await comptrollerProxy.calcGav.call();
        const wrappedNativeAssetAmountToAdd = await fork.deployment.valueInterpreter.calcCanonicalAssetValue
          .args(denominationAsset, gav.mul(100), wrappedNativeAsset)
          .call();
        await addNewAssetsToFund({
          signer: fundOwner,
          comptrollerProxy,
          integrationManager: fork.deployment.integrationManager,
          assets: [wrappedNativeAsset],
          amounts: [wrappedNativeAssetAmountToAdd],
          provider,
        });

        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);

        // Get pre-tx balances and shares to redeem for both investors
        const preRedeemInvestor1EthBal = await provider.getBalance(investor1.address);
        const preRedeemInvestor2EthBal = await provider.getBalance(investor2.address);
        const investor1SharesRedeemed = (await sharesWrapper.getRedemptionQueueUserRequest(investor1)).sharesPending;
        const investor2SharesRedeemed = (await sharesWrapper.getRedemptionQueueUserRequest(investor2)).sharesPending;
        const totalSharesRedeemed = investor1SharesRedeemed.add(investor2SharesRedeemed);

        // Redeem all investors
        await sharesWrapper.connect(manager).redeemFromQueue(0, constants.MaxUint256);

        // Estimate the amount each investor should have received
        const nativeAssetRedeemed = wrappedNativeAssetAmountToAdd.sub(await wrappedNativeAsset.balanceOf(vaultProxy));
        const expectedInvestor1Payout = nativeAssetRedeemed.mul(investor1SharesRedeemed).div(totalSharesRedeemed);
        expect(expectedInvestor1Payout).toBeGtBigNumber(0);
        const expectedInvestor2Payout = nativeAssetRedeemed.mul(investor2SharesRedeemed).div(totalSharesRedeemed);
        expect(expectedInvestor2Payout).toBeGtBigNumber(0);

        // Assert investor balances increased as expected
        expect(await provider.getBalance(investor1.address)).toEqBigNumber(
          preRedeemInvestor1EthBal.add(expectedInvestor1Payout),
        );
        expect(await provider.getBalance(investor2.address)).toEqBigNumber(
          preRedeemInvestor2EthBal.add(expectedInvestor2Payout),
        );
      });
    });

    describe('three investors in the queue: below cap', () => {
      // At this point already tested: redeeming entire queue + over the cap, burning shares,
      // redeeming correct amount from vaultProxy, event emission.

      // In these test cases we want to test uncapped filling of partial ranges from the front and back of the queue
      // in order to check for correct removal and reordering of queue indexes

      let investor1RedemptionAmount: BigNumber, investor3RedemptionAmount: BigNumber;

      beforeEach(async () => {
        const investor1SharesAmount = await sharesWrapper.balanceOf(investor1);
        const investor2SharesAmount = await sharesWrapper.balanceOf(investor2);
        const investor3SharesAmount = await sharesWrapper.balanceOf(investor3);

        // Define arbitrary redemption request amounts
        investor1RedemptionAmount = investor1SharesAmount.div(3);
        const investor2RedemptionAmount = investor2SharesAmount.div(3);
        investor3RedemptionAmount = investor3SharesAmount.div(3);

        // All investors request to redeem
        await sharesWrapper.connect(investor1).requestRedeem(investor1RedemptionAmount);
        await sharesWrapper.connect(investor2).requestRedeem(investor2RedemptionAmount);
        await sharesWrapper.connect(investor3).requestRedeem(investor3RedemptionAmount);

        // Set cap to 100% so requests can be fully filled
        const nextRedemptionWindowConfig = redemptionWindowConfig;
        nextRedemptionWindowConfig.relativeSharesCap = ONE_HUNDRED_PERCENT_IN_WEI;
        await sharesWrapper.connect(manager).setRedemptionWindowConfig(nextRedemptionWindowConfig);

        // Warp to redemption window
        const secsUntilWindow = BigNumber.from(redemptionWindowConfig.firstWindowStart).sub(
          (await provider.getBlock('latest')).timestamp,
        );
        await provider.send('evm_increaseTime', [secsUntilWindow.toNumber()]);
      });

      it('happy path: multiple users, start of queue', async () => {
        // Redeem investors 1 and 2 (first two in the queue)
        const receipt = await sharesWrapper.connect(manager).redeemFromQueue(0, 1);

        // Validate that only investor3 remains in the queue
        expect(await sharesWrapper.getRedemptionQueue()).toMatchFunctionOutput(sharesWrapper.getRedemptionQueue, {
          totalSharesPending_: investor3RedemptionAmount,
          relativeSharesAllowed_: ONE_HUNDRED_PERCENT_IN_WEI,
          relativeSharesCheckpointed_: await transactionTimestamp(receipt),
        });
        expect(await sharesWrapper.getRedemptionQueueUsers()).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUsers,
          [investor3],
        );
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor3)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: investor3RedemptionAmount,
          },
        );

        // The requests of investors 1 and 2 should have been deleted
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor1)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: 0,
          },
        );
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor2)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: 0,
          },
        );
      });

      it('happy path: multiple users, end of queue', async () => {
        // Redeem investors 2 and 3 (last two in the queue)
        const receipt = await sharesWrapper.connect(manager).redeemFromQueue(1, 2);

        // Validate that only investor1 remains in the queue
        expect(await sharesWrapper.getRedemptionQueue()).toMatchFunctionOutput(sharesWrapper.getRedemptionQueue, {
          totalSharesPending_: investor1RedemptionAmount,
          relativeSharesAllowed_: ONE_HUNDRED_PERCENT_IN_WEI,
          relativeSharesCheckpointed_: await transactionTimestamp(receipt),
        });
        expect(await sharesWrapper.getRedemptionQueueUsers()).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUsers,
          [investor1],
        );
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor1)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: investor1RedemptionAmount,
          },
        );

        // The requests of investors 2 and 3 should have been deleted
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor2)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: 0,
          },
        );
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor3)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: 0,
          },
        );
      });

      it('happy path: single user, middle of queue', async () => {
        // Redeem investor 2 only (middle of queue)
        const receipt = await sharesWrapper.connect(manager).redeemFromQueue(1, 1);

        // Validate that only investor1 and investor3 remain in the queue
        expect(await sharesWrapper.getRedemptionQueue()).toMatchFunctionOutput(sharesWrapper.getRedemptionQueue, {
          totalSharesPending_: investor1RedemptionAmount.add(investor3RedemptionAmount),
          relativeSharesAllowed_: ONE_HUNDRED_PERCENT_IN_WEI,
          relativeSharesCheckpointed_: await transactionTimestamp(receipt),
        });
        expect(await sharesWrapper.getRedemptionQueueUsers()).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUsers,
          [investor1, investor3],
        );
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor1)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: investor1RedemptionAmount,
          },
        );
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor3)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 1,
            lastRedeemed: 0,
            sharesPending: investor3RedemptionAmount,
          },
        );

        // The request of investor2 should have been deleted
        expect(await sharesWrapper.getRedemptionQueueUserRequest(investor2)).toMatchFunctionOutput(
          sharesWrapper.getRedemptionQueueUserRequest,
          {
            index: 0,
            lastRedeemed: 0,
            sharesPending: 0,
          },
        );
      });
    });
  });

  describe('kick', () => {
    beforeEach(async () => {
      const deposit1Amount = denominationAssetUnit.mul(11);
      const deposit2Amount = denominationAssetUnit.mul(3);

      // Both investors deposit
      await sharesWrapper.connect(investor1).deposit(denominationAsset, deposit1Amount, 1);
      await sharesWrapper.connect(investor2).deposit(denominationAsset, deposit2Amount, 1);
    });

    it.todo('can only be called by the manager/owner');

    it.todo('happy path: no shares pending');

    it('happy path', async () => {
      const preTxInvestor1Shares = await sharesWrapper.balanceOf(investor1);

      const investor1RequestAmount = preTxInvestor1Shares.div(3);
      const investor2RequestAmount = await sharesWrapper.balanceOf(investor2);
      const totalSharesPending = investor1RequestAmount.add(investor2RequestAmount);

      // Both investors request to redeem
      await sharesWrapper.connect(investor1).requestRedeem(investor1RequestAmount);
      await sharesWrapper.connect(investor2).requestRedeem(investor2RequestAmount);

      const preTxInvestor1RedemptionAssetBal = await redemptionAsset.balanceOf(investor1);

      // Kick investor1 from queue
      const receipt = await sharesWrapper.connect(manager).kick(investor1);

      // Investor1 should have received the redemption asset and have no shares
      expect(await redemptionAsset.balanceOf(investor1)).toBeGtBigNumber(preTxInvestor1RedemptionAssetBal);
      expect(await sharesWrapper.balanceOf(investor1)).toEqBigNumber(0);

      // Investor1's request should have been removed from the queue.
      // Since the redemption is not a "queue" redemption, relative shares should not have been checkpointed
      expect(await sharesWrapper.getRedemptionQueue()).toMatchFunctionOutput(sharesWrapper.getRedemptionQueue, {
        totalSharesPending_: totalSharesPending.sub(investor1RequestAmount),
        relativeSharesAllowed_: 0,
        relativeSharesCheckpointed_: 0,
      });
      expect(await sharesWrapper.getRedemptionQueueUsers()).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUsers,
        [investor2],
      );
      expect(await sharesWrapper.getRedemptionQueueUserRequest(investor1)).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUserRequest,
        {
          index: 0,
          lastRedeemed: 0,
          sharesPending: 0,
        },
      );
      expect(await sharesWrapper.getRedemptionQueueUserRequest(investor2)).toMatchFunctionOutput(
        sharesWrapper.getRedemptionQueueUserRequest,
        {
          index: 0,
          lastRedeemed: 0,
          sharesPending: investor2RequestAmount,
        },
      );

      // Assert event
      assertEvent(receipt, 'Kicked', {
        user: investor1,
        sharesAmount: preTxInvestor1Shares,
      });
    });
  });
});

describe('transfers', () => {
  beforeEach(async () => {
    // Deposit to create some wrapped shares for investor1
    await sharesWrapper.connect(investor1).deposit(denominationAsset, denominationAssetUnit, 1);
  });

  it('does not allow transferring shares in the redemption queue', async () => {
    const investor1Shares = await sharesWrapper.balanceOf(investor1);
    const requestRedeemAmount = investor1Shares.div(11);
    const sharesNotInQueue = investor1Shares.sub(requestRedeemAmount);

    // Add some shares to redemption queue
    await sharesWrapper.connect(investor1).requestRedeem(requestRedeemAmount);

    const badTransferAmount = sharesNotInQueue.add(1);

    // Cannot transfer queued shares
    await expect(sharesWrapper.connect(investor1).transfer(investor2, badTransferAmount)).rejects.toBeRevertedWith(
      'In redemption queue',
    );

    // Can transfer all unqueued shares
    await sharesWrapper.connect(investor1).transfer(investor2, sharesNotInQueue);
  });

  it('happy path', async () => {
    const investor1ApprovalAmount = (await sharesWrapper.balanceOf(investor1)).div(3);

    // Transfer works
    await sharesWrapper.connect(investor1).transfer(investor2, investor1ApprovalAmount);
    expect(await sharesWrapper.balanceOf(investor2)).toEqBigNumber(investor1ApprovalAmount);
  });

  describe('uses transfer approvals', () => {
    beforeEach(async () => {
      await sharesWrapper.connect(manager).setUseTransferApprovals(true);
    });

    it('does not allow using a non-exact approval amount', async () => {
      const investor1ApprovalAmount = (await sharesWrapper.balanceOf(investor1)).div(3);

      await sharesWrapper.connect(manager).setTransferApprovals([investor1], [investor2], [investor1ApprovalAmount]);

      const badTransferAmount = investor1ApprovalAmount.sub(1);

      await expect(sharesWrapper.connect(investor1).transfer(investor2, badTransferAmount)).rejects.toBeRevertedWith(
        'Approval mismatch',
      );
    });

    it('happy path', async () => {
      const investor1ApprovalAmount = (await sharesWrapper.balanceOf(investor1)).div(3);

      await sharesWrapper.connect(manager).setTransferApprovals([investor1], [investor2], [investor1ApprovalAmount]);

      // Transfer works
      await sharesWrapper.connect(investor1).transfer(investor2, investor1ApprovalAmount);
      expect(await sharesWrapper.balanceOf(investor2)).toEqBigNumber(investor1ApprovalAmount);

      // Approval should be removed
      expect(await sharesWrapper.getTransferApproval(investor1, investor2)).toEqBigNumber(0);
    });

    it.todo('happy path: unlimited approval');
  });

  describe('forceTransfer', () => {
    it('cannot be called by manager', async () => {
      await expect(sharesWrapper.connect(manager).forceTransfer(investor1, investor2)).rejects.toBeRevertedWith(
        'Unauthorized',
      );
    });

    it('happy path', async () => {
      const preTransferInvestor1Bal = await sharesWrapper.balanceOf(investor1);
      const preTransferInvestor2Bal = await sharesWrapper.balanceOf(investor2);

      // Add some shares to redemption queue
      await sharesWrapper.connect(investor1).requestRedeem(123);

      const receipt = await sharesWrapper.connect(fundOwner).forceTransfer(investor1, investor2);

      // Assert sender was removed from redemption queue
      expect((await sharesWrapper.getRedemptionQueue()).totalSharesPending_).toEqBigNumber(0);

      // Assert shares transferred
      expect(await sharesWrapper.balanceOf(investor1)).toEqBigNumber(0);
      expect(await sharesWrapper.balanceOf(investor2)).toEqBigNumber(
        preTransferInvestor2Bal.add(preTransferInvestor1Bal),
      );

      assertEvent(receipt, 'TransferForced', {
        sender: investor1.address,
        recipient: investor2.address,
        amount: preTransferInvestor1Bal,
      });
    });
  });
});

describe('redemption window calcs', () => {
  describe('calcLatestRedemptionWindow', () => {
    it('happy path', async () => {
      const firstWindowStart = BigNumber.from(redemptionWindowConfig.firstWindowStart);
      const frequency = BigNumber.from(redemptionWindowConfig.frequency);
      const duration = BigNumber.from(redemptionWindowConfig.duration);

      // Remove the redemption window config
      await sharesWrapper
        .connect(manager)
        .setRedemptionWindowConfig({ firstWindowStart: 0, frequency: 0, duration: 0, relativeSharesCap: 0 });

      // Prior to setting config, should be no window
      expect(await sharesWrapper.calcLatestRedemptionWindow()).toMatchFunctionOutput(
        sharesWrapper.calcLatestRedemptionWindow,
        {
          windowStart_: 0,
          windowEnd_: 0,
        },
      );

      // Re-set the redemption window config used in the tests in this file
      await sharesWrapper.connect(manager).setRedemptionWindowConfig(redemptionWindowConfig);

      // Since first redemption window is in the future, should still be no window
      expect(await sharesWrapper.calcLatestRedemptionWindow()).toMatchFunctionOutput(
        sharesWrapper.calcLatestRedemptionWindow,
        {
          windowStart_: 0,
          windowEnd_: 0,
        },
      );

      // Warp to start of first window
      await provider.send('evm_increaseTime', [
        firstWindowStart.sub((await provider.getBlock('latest')).timestamp).toNumber(),
      ]);
      await provider.send('evm_mine', []);

      expect(await sharesWrapper.calcLatestRedemptionWindow()).toMatchFunctionOutput(
        sharesWrapper.calcLatestRedemptionWindow,
        {
          windowStart_: firstWindowStart,
          windowEnd_: firstWindowStart.add(duration),
        },
      );

      // Warp to near end of full frequency period, before 2nd window. Latest window should still be the 1st.
      const bufferBeforeNextWindow = 60;
      await provider.send('evm_increaseTime', [frequency.sub(bufferBeforeNextWindow).toNumber()]);
      await provider.send('evm_mine', []);

      expect(await sharesWrapper.calcLatestRedemptionWindow()).toMatchFunctionOutput(
        sharesWrapper.calcLatestRedemptionWindow,
        {
          windowStart_: firstWindowStart,
          windowEnd_: firstWindowStart.add(duration),
        },
      );

      // Warp to the 2nd window start
      await provider.send('evm_increaseTime', [bufferBeforeNextWindow]);
      await provider.send('evm_mine', []);

      expect(await sharesWrapper.calcLatestRedemptionWindow()).toMatchFunctionOutput(
        sharesWrapper.calcLatestRedemptionWindow,
        {
          windowStart_: firstWindowStart.add(frequency),
          windowEnd_: firstWindowStart.add(frequency).add(duration),
        },
      );
    });
  });
});

describe('settings', () => {
  describe('managers', () => {
    describe('add', () => {
      const managerToAdd = randomAddressValue;

      it('does not allow a user who is already a manager', async () => {
        await expect(sharesWrapper.connect(manager).addManagers([managerToAdd])).rejects.toBeRevertedWith(
          'Unauthorized',
        );
      });

      it('happy path', async () => {
        expect(await sharesWrapper.isManager(managerToAdd)).toBe(false);

        // Add manager
        const receipt = await sharesWrapper.connect(fundOwner).addManagers([managerToAdd]);

        expect(await sharesWrapper.isManager(managerToAdd)).toBe(true);

        assertEvent(receipt, 'ManagerAdded', {
          user: managerToAdd,
        });
      });
    });

    describe('remove', () => {
      const managerToRemove = randomAddressValue;

      beforeEach(async () => {
        // Add manager that will be removed
        await sharesWrapper.connect(fundOwner).addManagers([managerToRemove]);

        expect(await sharesWrapper.isManager(managerToRemove)).toBe(true);
      });

      it('cannot be called by a manager', async () => {
        await expect(sharesWrapper.connect(manager).removeManagers([managerToRemove])).rejects.toBeRevertedWith(
          'Unauthorized',
        );
      });

      it('happy path', async () => {
        // Remove the manager
        const receipt = await sharesWrapper.connect(fundOwner).removeManagers([managerToRemove]);

        expect(await sharesWrapper.isManager(managerToRemove)).toBe(false);

        assertEvent(receipt, 'ManagerRemoved', {
          user: managerToRemove,
        });
      });
    });
  });

  describe('approvals', () => {
    describe('setDepositApprovals', () => {
      it.todo('tests');
    });

    describe('setRedemptionApprovals', () => {
      it.todo('tests');
    });

    describe('setTransferApprovals', () => {
      it.todo('tests');
    });

    describe('setUseDepositApprovals', () => {
      let newValue: boolean;

      beforeEach(async () => {
        newValue = !(await sharesWrapper.depositApprovalsAreUsed());
      });

      it('cannot be called by a random user', async () => {
        await expect(sharesWrapper.connect(randomUser).setUseDepositApprovals(newValue)).rejects.toBeRevertedWith(
          'Unauthorized',
        );
      });

      it('happy path', async () => {
        const receipt = await sharesWrapper.connect(manager).setUseDepositApprovals(newValue);

        expect(await sharesWrapper.depositApprovalsAreUsed()).toBe(newValue);

        assertEvent(receipt, 'UseDepositApprovalsSet', {
          useApprovals: newValue,
        });
      });
    });

    describe('setUseRedemptionApprovals', () => {
      let newValue: boolean;

      beforeEach(async () => {
        newValue = !(await sharesWrapper.redemptionApprovalsAreUsed());
      });

      it('cannot be called by a random user', async () => {
        await expect(sharesWrapper.connect(randomUser).setUseRedemptionApprovals(newValue)).rejects.toBeRevertedWith(
          'Unauthorized',
        );
      });

      it('happy path', async () => {
        const receipt = await sharesWrapper.connect(manager).setUseRedemptionApprovals(newValue);

        expect(await sharesWrapper.redemptionApprovalsAreUsed()).toBe(newValue);

        assertEvent(receipt, 'UseRedemptionApprovalsSet', {
          useApprovals: newValue,
        });
      });
    });

    describe('setUseTransferApprovals', () => {
      let newValue: boolean;

      beforeEach(async () => {
        newValue = !(await sharesWrapper.transferApprovalsAreUsed());
      });

      it('cannot be called by a random user', async () => {
        await expect(sharesWrapper.connect(randomUser).setUseTransferApprovals(newValue)).rejects.toBeRevertedWith(
          'Unauthorized',
        );
      });

      it('happy path', async () => {
        const receipt = await sharesWrapper.connect(manager).setUseTransferApprovals(newValue);

        expect(await sharesWrapper.transferApprovalsAreUsed()).toBe(newValue);

        assertEvent(receipt, 'UseTransferApprovalsSet', {
          useApprovals: newValue,
        });
      });
    });
  });

  describe('setRedemptionWindowConfig', () => {
    it('happy path: empty values', async () => {
      // Validate the windowConfig is not empty
      expect((await sharesWrapper.getRedemptionWindowConfig()).firstWindowStart).toBeGtBigNumber(0);

      // Empty the config
      expect(
        await sharesWrapper.connect(manager).setRedemptionWindowConfig({
          firstWindowStart: 0,
          frequency: 0,
          duration: 0,
          relativeSharesCap: 0,
        }),
      );

      // Simply asserting non-failure is enough
    });

    describe('non-empty values', () => {
      it('does not allow a firstWindowStart in the past', async () => {
        const nextWindowConfig = redemptionWindowConfig;
        nextWindowConfig.firstWindowStart = 1;

        await expect(
          sharesWrapper.connect(manager).setRedemptionWindowConfig(nextWindowConfig),
        ).rejects.toBeRevertedWith('Invalid firstWindowStart');
      });

      it('does not allow an empty duration', async () => {
        const nextWindowConfig = redemptionWindowConfig;
        nextWindowConfig.duration = 0;

        await expect(
          sharesWrapper.connect(manager).setRedemptionWindowConfig(nextWindowConfig),
        ).rejects.toBeRevertedWith('No duration');
      });

      it('does not allow a frequency less than duration', async () => {
        const nextWindowConfig = redemptionWindowConfig;
        nextWindowConfig.frequency = BigNumber.from(nextWindowConfig.duration).sub(1);

        await expect(
          sharesWrapper.connect(manager).setRedemptionWindowConfig(nextWindowConfig),
        ).rejects.toBeRevertedWith('duration exceeds frequency');
      });

      it('does not allow a relativeSharesCap greater than 100%', async () => {
        const nextWindowConfig = redemptionWindowConfig;
        nextWindowConfig.relativeSharesCap = ONE_HUNDRED_PERCENT_IN_WEI.add(1);

        await expect(
          sharesWrapper.connect(manager).setRedemptionWindowConfig(nextWindowConfig),
        ).rejects.toBeRevertedWith('relativeSharesCap exceeds 100%');
      });

      it('happy path: non-empty values', async () => {
        // Increase values in file-level config to assure new values
        const firstWindowStart = BigNumber.from(redemptionWindowConfig.firstWindowStart).add(2);
        const frequency = BigNumber.from(redemptionWindowConfig.frequency).add(2);
        const duration = BigNumber.from(redemptionWindowConfig.duration).add(2);
        const relativeSharesCap = BigNumber.from(redemptionWindowConfig.relativeSharesCap).add(2);

        const receipt = await sharesWrapper.connect(manager).setRedemptionWindowConfig({
          firstWindowStart,
          frequency,
          duration,
          relativeSharesCap,
        });

        // Assert the new config has been set
        expect(await sharesWrapper.getRedemptionWindowConfig()).toMatchFunctionOutput(
          sharesWrapper.getRedemptionWindowConfig,
          {
            firstWindowStart,
            frequency,
            duration,
            relativeSharesCap,
          },
        );

        // Assert the event
        assertEvent(receipt, 'RedemptionWindowConfigSet', {
          firstWindowStart,
          frequency,
          duration,
          relativeSharesCap,
        });
      });
    });
  });

  describe('setRedemptionAsset', () => {
    const redemptionAsset = randomAddressValue;

    it('cannot be called by a random user', async () => {
      await expect(sharesWrapper.connect(randomUser).setRedemptionAsset(redemptionAsset)).rejects.toBeRevertedWith(
        'Unauthorized',
      );
    });

    it('happy path', async () => {
      const receipt = await sharesWrapper.connect(manager).setRedemptionAsset(redemptionAsset);

      expect(await sharesWrapper.getRedemptionAsset()).toMatchAddress(redemptionAsset);

      assertEvent(receipt, 'RedemptionAssetSet', {
        asset: redemptionAsset,
      });
    });
  });
});
