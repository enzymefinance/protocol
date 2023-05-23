import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type {
  AddressListRegistry,
  ArbitraryTokenPhasedSharesWrapperFactory,
  ComptrollerLib,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  AddressListUpdateType,
  ArbitraryTokenPhasedSharesWrapperLib,
  ArbitraryTokenPhasedSharesWrapperState,
  ConvexVotingPositionLib,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  ONE_HUNDRED_PERCENT_IN_BPS,
  ONE_YEAR_IN_SECONDS,
  SHARES_UNIT,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  buyShares,
  convexVotingPositionLock,
  createConvexVotingPosition,
  createFundDeployer,
  createNewFund,
  deployArbitraryTokenPhasedSharesWrapper,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  increaseAccountBalance,
  setAccountBalance,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

// TODO: move to config?
const protocolFeeBps = 25;
let protocolFeeRecipient: AddressLike;

const randomAddress1 = randomAddress();

let fork: ProtocolDeployment;

let sharesWrapperFactory: ArbitraryTokenPhasedSharesWrapperFactory;
let fundOwner: SignerWithAddress,
  manager: SignerWithAddress,
  investor: SignerWithAddress,
  randomUser: SignerWithAddress;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let denominationAsset: ITestStandardToken, denominationAssetUnit: BigNumber;
let depositToken: ITestStandardToken, depositTokenUnit: BigNumber;
let miscAsset1: ITestStandardToken,
  miscAsset1Unit: BigNumber,
  miscAsset2: ITestStandardToken,
  miscAsset2Unit: BigNumber;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  [fundOwner, manager, investor, randomUser] = fork.accounts;
  sharesWrapperFactory = fork.deployment.arbitraryTokenPhasedSharesWrapperFactory;

  protocolFeeRecipient = fork.deployment.protocolFeeReserveProxy;

  // Define assets
  denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);
  denominationAssetUnit = await getAssetUnit(denominationAsset);
  depositToken = new ITestStandardToken(fork.config.unsupportedAssets.usf, provider);
  depositTokenUnit = await getAssetUnit(depositToken);
  miscAsset1 = new ITestStandardToken(fork.config.primitives.dai, provider);
  miscAsset1Unit = await getAssetUnit(miscAsset1);
  miscAsset2 = new ITestStandardToken(fork.config.primitives.mln, provider);
  miscAsset2Unit = await getAssetUnit(miscAsset2);

  // Deploy a new fund
  const newFundRes = await createNewFund({
    denominationAsset,
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

  // Turn off protocol fees for vault
  await fork.deployment.protocolFeeTracker.setLastPaidForVault(vaultProxy, constants.MaxUint256);

  // Seed relevant accounts with deposit token
  const seedAmount = depositTokenUnit.mul(1000);
  await setAccountBalance({ account: investor, amount: seedAmount, provider, token: depositToken });
  await setAccountBalance({ account: randomUser, amount: seedAmount, provider, token: depositToken });
});

describe('library', () => {
  it('has valid ERC20 properties', async () => {
    const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId: 0,
      transfersAllowed: false,
      totalDepositMax: 0,
      feeRecipient: constants.AddressZero,
      feeBps: 0,
      feeExcludesDepositTokenPrincipal: false,
      manager,
    });

    const libInStorage = await provider.getStorageAt(
      sharesWrapper.address,
      '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    );
    const libAddress = utils.hexDataSlice(libInStorage, 12);
    const sharesWrapperLib = new ArbitraryTokenPhasedSharesWrapperLib(libAddress, provider);

    expect(await sharesWrapperLib.name()).toBe('Wrapped Enzyme Shares Lib');
    expect(await sharesWrapperLib.symbol()).toBe('wENZF-lib');
  });
});

describe('factory.deploy() and proxy.init()', () => {
  const allowedDepositorListId = 123;
  const totalDepositMax = 456;
  const feeRecipient = randomAddress1;
  const feeBps = 789;
  const feeExcludesDepositTokenPrincipal = true;
  const transfersAllowed = true;

  it('init() does not allow a non-factory caller', async () => {
    const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId,
      transfersAllowed,
      totalDepositMax,
      feeRecipient,
      feeBps,
      feeExcludesDepositTokenPrincipal,
      manager,
    });

    await expect(
      sharesWrapper
        .connect(fundOwner)
        .init(
          vaultProxy,
          depositToken,
          allowedDepositorListId,
          transfersAllowed,
          totalDepositMax,
          feeRecipient,
          feeBps,
          feeExcludesDepositTokenPrincipal,
          manager,
        ),
    ).rejects.toBeRevertedWith('Unauthorized');
  });

  it('does not allow a non-v4 vault', async () => {
    // Create a new FundDeployer and deploy a vault on that new release
    const nextFundDeployer = await createFundDeployer({
      deployer: fork.deployer,
      dispatcher: fork.deployment.dispatcher,
      externalPositionManager: fork.deployment.externalPositionManager,
      feeManager: fork.deployment.feeManager,
      gasRelayPaymasterFactory: fork.deployment.gasRelayPaymasterFactory,
      integrationManager: fork.deployment.integrationManager,
      policyManager: fork.deployment.policyManager,
      valueInterpreter: fork.deployment.valueInterpreter,
      vaultLib: fork.deployment.vaultLib,
      setOnDispatcher: true,
      setReleaseLive: true,
    });

    const { vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: nextFundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    await expect(
      deployArbitraryTokenPhasedSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy,
        depositToken,
        allowedDepositorListId,
        transfersAllowed,
        totalDepositMax,
        feeRecipient,
        feeBps,
        feeExcludesDepositTokenPrincipal,
        manager,
      }),
    ).rejects.toBeRevertedWith('Bad vault version');
  });

  it('happy path: all optional vars defined', async () => {
    // The deployment event is tested in this helper
    const { receipt, sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId,
      transfersAllowed,
      totalDepositMax,
      feeRecipient,
      feeBps,
      feeExcludesDepositTokenPrincipal,
      manager,
    });

    // Initial wrapper state
    expect(await sharesWrapper.getAllowedDepositorListId()).toEqBigNumber(allowedDepositorListId);
    expect(await sharesWrapper.getDepositToken()).toMatchAddress(depositToken);
    expect(await sharesWrapper.getFeeBps()).toEqBigNumber(feeBps);
    expect(await sharesWrapper.getFeeExcludesDepositTokenPrincipal()).toBe(feeExcludesDepositTokenPrincipal);
    expect(await sharesWrapper.getFeeRecipient()).toMatchAddress(feeRecipient);
    expect(await sharesWrapper.getManager()).toMatchAddress(manager);
    expect(await sharesWrapper.getProtocolFeeStart()).toEqBigNumber(0);
    expect(await sharesWrapper.getState()).toEqBigNumber(ArbitraryTokenPhasedSharesWrapperState.Deposit);
    expect(await sharesWrapper.getTotalDepositMax()).toEqBigNumber(totalDepositMax);
    expect(await sharesWrapper.getTransfersAllowed()).toBe(transfersAllowed);
    expect(await sharesWrapper.getVaultProxy()).toMatchAddress(vaultProxy);

    // ERC20 properties
    const sharesName = await vaultProxy.name();
    expect(await sharesWrapper.name()).toBe(`Wrapped ${sharesName}`);
    const sharesSymbol = await vaultProxy.symbol();
    expect(await sharesWrapper.symbol()).toBe(`w${sharesSymbol}`);
    expect(await sharesWrapper.decimals()).toEqBigNumber(18);

    assertEvent(receipt, sharesWrapper.abi.getEvent('Initialized'), {
      vaultProxy,
      depositToken,
      transfersAllowed,
      feeRecipient,
      feeBps,
      feeExcludesDepositTokenPrincipal,
    });

    expect(receipt).toMatchInlineGasSnapshot(`235872`);
  });

  it('happy path: no optional vars defined', async () => {
    const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId: 0,
      transfersAllowed: false,
      totalDepositMax: 0,
      feeRecipient: constants.AddressZero,
      feeBps: 0,
      feeExcludesDepositTokenPrincipal: false,
      manager: constants.AddressZero,
    });

    // Default values
    expect(await sharesWrapper.getAllowedDepositorListId()).toEqBigNumber(0);
    expect(await sharesWrapper.getFeeBps()).toEqBigNumber(0);
    expect(await sharesWrapper.getFeeExcludesDepositTokenPrincipal()).toBe(false);
    expect(await sharesWrapper.getFeeRecipient()).toMatchAddress(constants.AddressZero);
    expect(await sharesWrapper.getManager()).toMatchAddress(constants.AddressZero);
    expect(await sharesWrapper.getProtocolFeeStart()).toEqBigNumber(0);
    expect(await sharesWrapper.getState()).toEqBigNumber(ArbitraryTokenPhasedSharesWrapperState.Deposit);
    expect(await sharesWrapper.getTotalDepositMax()).toEqBigNumber(0);

    // Set values
    expect(await sharesWrapper.getDepositToken()).toMatchAddress(depositToken);
    expect(await sharesWrapper.getVaultProxy()).toMatchAddress(vaultProxy);
  });
});

describe('investor actions', () => {
  describe('deposit', () => {
    describe('shared setup: allowed depositor list and deposit limit', () => {
      const totalDepositMax = BigNumber.from(123);

      let addressListRegistry: AddressListRegistry;
      let sharesWrapper: ArbitraryTokenPhasedSharesWrapperLib;
      let listOwner: SignerWithAddress;

      beforeEach(async () => {
        addressListRegistry = fork.deployment.addressListRegistry;
        listOwner = fork.deployer;

        // Create an address list to use on the wrapper, with the investor added
        const allowedDepositorListId = await addressListRegistry.getListCount();
        await addressListRegistry.createList(listOwner, AddressListUpdateType.AddAndRemove, [investor]);

        const deploySharesWrapperRes = await deployArbitraryTokenPhasedSharesWrapper({
          signer: randomUser,
          sharesWrapperFactory,
          vaultProxy,
          depositToken,
          allowedDepositorListId,
          transfersAllowed: false,
          totalDepositMax,
          feeRecipient: constants.AddressZero,
          feeBps: 0,
          feeExcludesDepositTokenPrincipal: false,
          manager,
        });
        sharesWrapper = deploySharesWrapperRes.sharesWrapper;

        // Grant deposit token allowance to the shares wrapper
        await depositToken.connect(investor).approve(sharesWrapper, constants.MaxUint256);
      });

      it('does not allow a non-Deposit state', async () => {
        // Seed wrapper with 1 denomination asset unit to buy some vault shares
        await setAccountBalance({
          account: sharesWrapper,
          amount: denominationAssetUnit,
          provider,
          token: denominationAsset,
        });

        // Deposit a small amount
        await sharesWrapper.connect(investor).deposit(1);

        // Enter Locked state
        await sharesWrapper.connect(manager).enterLockedState();

        // Cannot deposit further
        await expect(sharesWrapper.connect(investor).deposit(1)).rejects.toBeRevertedWith('Unallowed State');

        // Enter Redeem state
        await sharesWrapper.connect(manager).enterRedeemState([]);

        // Still cannot deposit further
        await expect(sharesWrapper.connect(investor).deposit(1)).rejects.toBeRevertedWith('Unallowed State');
      });

      it('does not allow a user not on the allowed depositor list', async () => {
        await expect(sharesWrapper.connect(randomUser).deposit(1)).rejects.toBeRevertedWith('Unallowed caller');
      });

      it('respects the max deposit limit', async () => {
        // Depositing just over the max should fail
        await expect(sharesWrapper.connect(investor).deposit(totalDepositMax.add(1))).rejects.toBeRevertedWith(
          'Max exceeded',
        );

        // Depositing the exact max should work
        await sharesWrapper.connect(investor).deposit(totalDepositMax);
      });
    });

    it('happy path: no depositor list nor deposit max', async () => {
      const investor1 = investor;
      const investor2 = randomUser;

      const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy,
        depositToken,
        allowedDepositorListId: 0,
        transfersAllowed: false,
        totalDepositMax: 0,
        feeRecipient: constants.AddressZero,
        feeBps: 0,
        feeExcludesDepositTokenPrincipal: false,
        manager,
      });

      const depositAmount1 = depositTokenUnit;
      const depositAmount2 = depositTokenUnit.mul(3);

      // Grant deposit token allowance to the shares wrapper
      await depositToken.connect(investor1).approve(sharesWrapper, depositAmount1);
      await depositToken.connect(investor2).approve(sharesWrapper, depositAmount2);

      // First deposit: investor1
      const receipt1 = await sharesWrapper.connect(investor1).deposit(depositAmount1);

      // Should have minted wrapped shares 1:1 with deposited amount
      expect(await depositToken.balanceOf(sharesWrapper)).toEqBigNumber(depositAmount1);
      expect(await sharesWrapper.balanceOf(investor1)).toEqBigNumber(depositAmount1);

      // Protocol fee tracking should have started
      const deposit1Timestamp = await transactionTimestamp(receipt1);
      expect(await sharesWrapper.getProtocolFeeStart()).toEqBigNumber(deposit1Timestamp);
      assertEvent(receipt1, 'ProtocolFeeStarted');

      // Assert deposit event
      assertEvent(receipt1, 'Deposited', {
        user: investor1,
        amount: depositAmount1,
      });

      // Wait a few secs to validate protocol fee start timestamp does not get updated
      await provider.send('evm_increaseTime', [3]);
      await provider.send('evm_mine', []);

      // Second deposit: investor2
      await sharesWrapper.connect(investor2).deposit(depositAmount2);

      // Should have minted wrapped shares 1:1 with deposited amount
      expect(await sharesWrapper.balanceOf(investor2)).toEqBigNumber(depositAmount2);

      // Shares wrapper should now have equal deposit token balance and total supply that corresponds to total deposits
      const totalDeposited = depositAmount1.add(depositAmount2);
      expect(await depositToken.balanceOf(sharesWrapper)).toEqBigNumber(totalDeposited);
      expect(await sharesWrapper.totalSupply()).toEqBigNumber(totalDeposited);

      // Protocol fee start time should still be first investment timestamp
      expect(await sharesWrapper.getProtocolFeeStart()).toEqBigNumber(deposit1Timestamp);

      expect(receipt1).toMatchInlineGasSnapshot(`143218`);
    });
  });

  describe('withdraw', () => {
    let sharesWrapper: ArbitraryTokenPhasedSharesWrapperLib;

    beforeEach(async () => {
      const deploySharesWrapperRes = await deployArbitraryTokenPhasedSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy,
        depositToken,
        allowedDepositorListId: 0,
        transfersAllowed: false,
        totalDepositMax: 0,
        feeRecipient: constants.AddressZero,
        feeBps: 0,
        feeExcludesDepositTokenPrincipal: false,
        manager,
      });
      sharesWrapper = deploySharesWrapperRes.sharesWrapper;

      // Deposit and mint some shares
      const depositAmount = depositTokenUnit.mul(3);
      await depositToken.connect(investor).approve(sharesWrapper, depositAmount);
      await sharesWrapper.connect(investor).deposit(depositAmount);

      // Seed wrapper with 1 denomination asset unit to buy some vault shares
      await setAccountBalance({
        account: sharesWrapper,
        amount: denominationAssetUnit,
        provider,
        token: denominationAsset,
      });
    });

    it.todo('does not allow reentrancy');

    it('does not allow duplicate _additionalAssets', async () => {
      // Enter Locked state
      await sharesWrapper.connect(manager).enterLockedState();

      // Enter redeem state
      await sharesWrapper.connect(manager).enterRedeemState([]);

      await expect(
        sharesWrapper.connect(investor).withdraw(1, [randomAddress1, randomAddress1]),
      ).rejects.toBeRevertedWith('Duplicate _additionalAssets');
    });

    it('does not allow a Locked state', async () => {
      // Enter Locked state
      await sharesWrapper.connect(manager).enterLockedState();

      await expect(sharesWrapper.connect(investor).withdraw(1, [])).rejects.toBeRevertedWith('Unallowed State');
    });

    it('only allows withdrawing deposit token during Deposit state', async () => {
      const withdrawalAmount = 3;

      // Should fail with any _additionalAssets
      await expect(
        sharesWrapper.connect(investor).withdraw(withdrawalAmount, [denominationAsset]),
      ).rejects.toBeRevertedWith('Only deposit token withdrawable');

      await expect(sharesWrapper.connect(investor).withdraw(withdrawalAmount, [depositToken])).rejects.toBeRevertedWith(
        'Only deposit token withdrawable',
      );

      const preTxDepositTokenBal = await depositToken.balanceOf(investor);

      // Should succeed to withdraw deposit token with no _additionalAssets specified
      await sharesWrapper.connect(investor).withdraw(withdrawalAmount, []);

      expect(await depositToken.balanceOf(investor)).toEqBigNumber(preTxDepositTokenBal.add(withdrawalAmount));
    });

    it('happy path', async () => {
      // Enter Locked state
      await sharesWrapper.connect(manager).enterLockedState();

      // Send some more deposit token to the vault to simulate a gain
      const depositTokenGain = depositTokenUnit.div(3);
      await increaseAccountBalance({
        account: vaultProxy,
        amount: depositTokenGain,
        provider,
        token: depositToken,
      });

      // Enter redeem state
      await sharesWrapper.connect(manager).enterRedeemState([]);

      const totalWrappedShares = await sharesWrapper.balanceOf(investor);

      // Get total balances of assets to claim
      const assetsToClaim = [denominationAsset, depositToken];
      const preRedeemInvestorAssetsToClaimBalances = await getAssetBalances({
        account: investor,
        assets: assetsToClaim,
      });
      const preRedeemWrapperAssetsToClaimBalances = await getAssetBalances({
        account: sharesWrapper,
        assets: assetsToClaim,
      });

      // Redeem partial shares
      const redeemAmount1 = totalWrappedShares.div(4);
      const receipt1 = await sharesWrapper.connect(investor).withdraw(redeemAmount1, []);

      const postRedeem1InvestorAssetsToClaimBalances = await getAssetBalances({
        account: investor,
        assets: assetsToClaim,
      });

      // Correct amounts should have been paid out
      const expectedRedeem1ClaimedAmounts = preRedeemWrapperAssetsToClaimBalances.map((bal) =>
        bal.mul(redeemAmount1).div(totalWrappedShares),
      );

      for (const i in expectedRedeem1ClaimedAmounts) {
        expect(expectedRedeem1ClaimedAmounts[i]).toBeGtBigNumber(0);
        expect(postRedeem1InvestorAssetsToClaimBalances[i]).toEqBigNumber(
          preRedeemInvestorAssetsToClaimBalances[i].add(expectedRedeem1ClaimedAmounts[i]),
        );
      }

      // Redeemed shares should be burned
      const remainingShares = await sharesWrapper.balanceOf(investor);
      expect(remainingShares).toEqBigNumber(totalWrappedShares.sub(redeemAmount1));

      assertEvent(receipt1, 'Withdrawn', {
        user: investor,
        amount: redeemAmount1,
        claimedAssets: assetsToClaim,
        claimedAssetAmounts: expectedRedeem1ClaimedAmounts,
      });

      // Redeem remainder of shares
      await sharesWrapper.connect(investor).withdraw(remainingShares, []);

      // No assets should remain in the wrapper
      for (const asset of assetsToClaim) {
        expect(await asset.balanceOf(sharesWrapper)).toEqBigNumber(0);
      }

      expect(receipt1).toMatchInlineGasSnapshot(`129281`);
    });

    it('happy path: some _additionalAssets', async () => {
      // Enter Locked state
      await sharesWrapper.connect(manager).enterLockedState();

      // Enter redeem state
      await sharesWrapper.connect(manager).enterRedeemState([]);

      // Transfer a couple misc assets directly to the wrapper
      await setAccountBalance({
        account: sharesWrapper,
        amount: miscAsset1Unit,
        provider,
        token: miscAsset1,
      });
      await setAccountBalance({
        account: sharesWrapper,
        amount: miscAsset2Unit,
        provider,
        token: miscAsset2,
      });
      const additionalAssets = [miscAsset1, miscAsset2];
      const allAssets = [denominationAsset, depositToken, ...additionalAssets];

      const preRedeemInvestorAssetsToClaimBalances = await getAssetBalances({
        account: investor,
        assets: allAssets,
      });

      // Withdraw and include misc assets
      const allShares = await sharesWrapper.balanceOf(investor);
      await sharesWrapper.connect(investor).withdraw(allShares, additionalAssets);

      const postRedeemInvestorAssetsToClaimBalances = await getAssetBalances({
        account: investor,
        assets: allAssets,
      });

      // The investor's balances of all assets should have increased
      for (const i in allAssets) {
        expect(postRedeemInvestorAssetsToClaimBalances[i]).toBeGtBigNumber(preRedeemInvestorAssetsToClaimBalances[i]);
      }
    });
  });
});

describe('manager actions', () => {
  describe('enterLockedState', () => {
    let sharesWrapper: ArbitraryTokenPhasedSharesWrapperLib;

    beforeEach(async () => {
      const deploySharesWrapperRes = await deployArbitraryTokenPhasedSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy,
        depositToken,
        allowedDepositorListId: 0,
        transfersAllowed: false,
        totalDepositMax: 0,
        feeRecipient: constants.AddressZero,
        feeBps: 0,
        feeExcludesDepositTokenPrincipal: false,
        manager,
      });
      sharesWrapper = deploySharesWrapperRes.sharesWrapper;

      // Deposit and mint some shares
      const depositAmount = depositTokenUnit.mul(3);
      await depositToken.connect(investor).approve(sharesWrapper, depositAmount);
      await sharesWrapper.connect(investor).deposit(depositAmount);
    });

    it('can only be called by manager or owner', async () => {
      // Seed wrapper with 1 denomination asset unit to buy some vault shares
      await setAccountBalance({
        account: sharesWrapper,
        amount: denominationAssetUnit,
        provider,
        token: denominationAsset,
      });

      // Calling with random user should fail
      await expect(sharesWrapper.connect(randomUser).enterLockedState()).rejects.toBeRevertedWith('Unauthorized');

      // Calling with owner should succeed
      await sharesWrapper.connect(fundOwner).enterLockedState();

      // Manager as caller tested in happy path
    });

    it('can only be called during Deposit state', async () => {
      // Seed wrapper with 1 denomination asset unit to buy some vault shares
      await setAccountBalance({
        account: sharesWrapper,
        amount: denominationAssetUnit,
        provider,
        token: denominationAsset,
      });

      // Calling with manager should succeed
      await sharesWrapper.connect(manager).enterLockedState();

      // Seed with another denomination asset unit
      await setAccountBalance({
        account: sharesWrapper,
        amount: denominationAssetUnit,
        provider,
        token: denominationAsset,
      });

      // Calling again should fail
      await expect(sharesWrapper.connect(manager).enterLockedState()).rejects.toBeRevertedWith('Invalid state');
    });

    it('does not allow buying a shares amount that is substantially less than the total shares supply', async () => {
      const initialInvestment = BigNumber.from(1);

      // Buy a small amount of shares
      await buyShares({
        provider,
        comptrollerProxy,
        denominationAsset,
        buyer: randomUser,
        investmentAmount: initialInvestment,
        seedBuyer: true,
      });

      // Send the threshold limit (too little) of denomination asset to the wrapper
      await setAccountBalance({
        account: sharesWrapper,
        amount: initialInvestment.mul(ONE_HUNDRED_PERCENT_IN_BPS),
        provider,
        token: denominationAsset,
      });

      // Entering locked state should fail
      await expect(sharesWrapper.connect(manager).enterLockedState()).rejects.toBeRevertedWith('Min shares not met');

      // Send 1 more increment of denomination asset to the wrapper, and it should now succeed
      await increaseAccountBalance({
        account: sharesWrapper,
        amount: 1,
        provider,
        token: denominationAsset,
      });

      await sharesWrapper.connect(manager).enterLockedState();
    });

    it('happy path', async () => {
      // Seed wrapper with 1 denomination asset unit to buy some vault shares
      await setAccountBalance({
        account: sharesWrapper,
        amount: denominationAssetUnit,
        provider,
        token: denominationAsset,
      });

      const preTxWrapperDepositTokenBalance = await depositToken.balanceOf(sharesWrapper);
      expect(preTxWrapperDepositTokenBalance).toBeGtBigNumber(0);

      // Enter Locked state
      const receipt = await sharesWrapper.connect(manager).enterLockedState();

      // Full deposit token balance should now be in the vault
      expect(await depositToken.balanceOf(vaultProxy)).toEqBigNumber(preTxWrapperDepositTokenBalance);

      // The wrapper should now own the amount of 1 shares unit, corresponding to its 1 unit investment
      expect(await vaultProxy.balanceOf(sharesWrapper)).toEqBigNumber(SHARES_UNIT);

      // The state should now be Locked
      expect(await sharesWrapper.getState()).toEqBigNumber(ArbitraryTokenPhasedSharesWrapperState.Locked);

      assertEvent(receipt, 'StateSet', {
        state: ArbitraryTokenPhasedSharesWrapperState.Locked,
      });

      expect(receipt).toMatchInlineGasSnapshot(`268377`);
    });
  });

  describe('enterRedeemState', () => {
    describe('shared setup: no fee', () => {
      let sharesWrapper: ArbitraryTokenPhasedSharesWrapperLib;

      beforeEach(async () => {
        const deploySharesWrapperRes = await deployArbitraryTokenPhasedSharesWrapper({
          signer: randomUser,
          sharesWrapperFactory,
          vaultProxy,
          depositToken,
          allowedDepositorListId: 0,
          transfersAllowed: false,
          totalDepositMax: 0,
          feeRecipient: constants.AddressZero,
          feeBps: 0,
          feeExcludesDepositTokenPrincipal: false,
          manager,
        });
        sharesWrapper = deploySharesWrapperRes.sharesWrapper;

        // Deposit and mint some shares
        const depositAmount = depositTokenUnit.mul(3);
        await depositToken.connect(investor).approve(sharesWrapper, depositAmount);
        await sharesWrapper.connect(investor).deposit(depositAmount);

        // Seed wrapper with 1 denomination asset unit to buy some vault shares
        await setAccountBalance({
          account: sharesWrapper,
          amount: denominationAssetUnit,
          provider,
          token: denominationAsset,
        });
      });

      it('can only be called by manager or owner', async () => {
        // Enter Locked state
        await sharesWrapper.connect(manager).enterLockedState();

        await expect(sharesWrapper.connect(randomUser).enterRedeemState([])).rejects.toBeRevertedWith('Unauthorized');

        await sharesWrapper.connect(fundOwner).enterRedeemState([]);

        // Manager tested in other tests
      });

      it('can only be called during Locked state', async () => {
        // Cannot be called during Deposit state
        await expect(sharesWrapper.connect(manager).enterRedeemState([])).rejects.toBeRevertedWith('Invalid state');

        // Enter Locked state
        await sharesWrapper.connect(manager).enterLockedState();

        // Enter Redeem state
        await sharesWrapper.connect(manager).enterRedeemState([]);

        // Cannot be called during Redeem state
        await expect(sharesWrapper.connect(manager).enterRedeemState([])).rejects.toBeRevertedWith('Invalid state');
      });

      it('happy path: _untrackedAssetsToClaim specified', async () => {
        // Enter Locked state
        await sharesWrapper.connect(manager).enterLockedState();

        // Transfer a couple misc assets directly to the vault
        await setAccountBalance({
          account: vaultProxy,
          amount: miscAsset1Unit,
          provider,
          token: miscAsset1,
        });
        await setAccountBalance({
          account: vaultProxy,
          amount: miscAsset2Unit,
          provider,
          token: miscAsset2,
        });
        const additionalAssets = [miscAsset1, miscAsset2];
        const allAssets = [denominationAsset, depositToken, ...additionalAssets];

        // Redeem and include misc assets
        await sharesWrapper.connect(manager).enterRedeemState(additionalAssets);

        const postRedeemWrapperAssetsToClaimBalances = await getAssetBalances({
          account: sharesWrapper,
          assets: allAssets,
        });

        // The balances of all assets should be > 0
        for (const i in allAssets) {
          expect(postRedeemWrapperAssetsToClaimBalances[i]).toBeGtBigNumber(0);
        }

        // All assets should be reflected in redeemedAssets
        const redeemedAssets = await sharesWrapper.getRedeemedAssets();
        expect(redeemedAssets).toHaveLength(allAssets.length);
        expect(redeemedAssets).toEqual(expect.arrayContaining(allAssets.map((asset) => asset.address)));
      });

      describe('shared setup: active external position', () => {
        let convexVotingPosition: ConvexVotingPositionLib;

        beforeEach(async () => {
          // Enter Locked state
          await sharesWrapper.connect(manager).enterLockedState();

          // Create a Convex position with locked CVX
          const convexVotingPositionProxy = (
            await createConvexVotingPosition({
              comptrollerProxy,
              externalPositionManager: fork.deployment.externalPositionManager,
              signer: fundOwner,
            })
          ).externalPositionProxy;

          convexVotingPosition = new ConvexVotingPositionLib(convexVotingPositionProxy, provider);
        });

        it('does not allow an active external position with value', async () => {
          // Seed vault with CVX
          const cvx = new ITestStandardToken(fork.config.convex.cvxToken, provider);
          const cvxPositionAmount = 1;
          await setAccountBalance({
            account: vaultProxy,
            amount: cvxPositionAmount,
            provider,
            token: cvx,
          });

          await convexVotingPositionLock({
            comptrollerProxy,
            externalPositionManager: fork.deployment.externalPositionManager,
            signer: fundOwner,
            externalPositionProxy: convexVotingPosition,
            amount: cvxPositionAmount,
          });

          // Cannot be called while there is locked-CVX
          await expect(sharesWrapper.connect(manager).enterRedeemState([])).rejects.toBeRevertedWith(
            'Non-zero value external position',
          );
        });

        it('allows an active external position with 0 value', async () => {
          await sharesWrapper.connect(manager).enterRedeemState([]);
        });
      });
    });

    it('happy path: local fee that excludes principal', async () => {
      const feeRecipient = randomAddress1;
      const feeBps = 100;

      const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
        signer: randomUser,
        sharesWrapperFactory,
        vaultProxy,
        depositToken,
        allowedDepositorListId: 0,
        transfersAllowed: false,
        totalDepositMax: 0,
        feeRecipient,
        feeBps,
        feeExcludesDepositTokenPrincipal: true,
        manager,
      });

      // Deposit and mint some shares
      const depositAmount = depositTokenUnit.mul(3);
      await depositToken.connect(investor).approve(sharesWrapper, depositAmount);
      await sharesWrapper.connect(investor).deposit(depositAmount);

      // Seed wrapper with 1 denomination asset unit to buy some vault shares
      const denominationAssetAmount = denominationAssetUnit;
      await setAccountBalance({
        account: sharesWrapper,
        amount: denominationAssetUnit,
        provider,
        token: denominationAsset,
      });

      // Enter Locked state
      await sharesWrapper.connect(manager).enterLockedState();

      // Send some more deposit token to the vault to simulate a gain
      const depositTokenGain = depositTokenUnit.div(3);
      await increaseAccountBalance({
        account: vaultProxy,
        amount: depositTokenGain,
        provider,
        token: depositToken,
      });

      // Wait some time to accrue protocol fees
      await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS * 30]);
      await provider.send('evm_mine', []);

      // Enter redeem state
      const receipt = await sharesWrapper.connect(manager).enterRedeemState([]);

      // All vault shares should be redeemed
      expect(await vaultProxy.totalSupply()).toEqBigNumber(0);

      // Protocol fees should have been charged on full amount of all assets
      const protocolFeeSecs = BigNumber.from(await transactionTimestamp(receipt)).sub(
        await sharesWrapper.getProtocolFeeStart(),
      );
      const expectedProtocolFeeForDepositToken = depositAmount
        .add(depositTokenGain)
        .mul(protocolFeeBps)
        .mul(protocolFeeSecs)
        .div(ONE_HUNDRED_PERCENT_IN_BPS)
        .div(ONE_YEAR_IN_SECONDS);
      expect(expectedProtocolFeeForDepositToken).toBeGtBigNumber(0);
      expect(await depositToken.balanceOf(protocolFeeRecipient)).toEqBigNumber(expectedProtocolFeeForDepositToken);

      const expectedProtocolFeeForDenominationAsset = denominationAssetAmount
        .mul(protocolFeeBps)
        .mul(protocolFeeSecs)
        .div(ONE_HUNDRED_PERCENT_IN_BPS)
        .div(ONE_YEAR_IN_SECONDS);
      expect(await denominationAsset.balanceOf(protocolFeeRecipient)).toEqBigNumber(
        expectedProtocolFeeForDenominationAsset,
      );

      // Local fees should have been charged on all assets, but only on the gains for the principal token
      const postProtocolFeeDepositTokenGain = depositTokenGain.sub(expectedProtocolFeeForDepositToken);
      const expectedLocalFeeForDepositToken = postProtocolFeeDepositTokenGain
        .mul(feeBps)
        .div(ONE_HUNDRED_PERCENT_IN_BPS);
      expect(expectedLocalFeeForDepositToken).toBeGtBigNumber(0);
      expect(await depositToken.balanceOf(feeRecipient)).toEqBigNumber(expectedLocalFeeForDepositToken);

      const postProtocolFeeDenominationAssetAmount = denominationAssetAmount.sub(
        expectedProtocolFeeForDenominationAsset,
      );
      const expectedLocalFeeForDenominationAsset = postProtocolFeeDenominationAssetAmount
        .mul(feeBps)
        .div(ONE_HUNDRED_PERCENT_IN_BPS);
      expect(expectedLocalFeeForDenominationAsset).toBeGtBigNumber(0);
      expect(await denominationAsset.balanceOf(feeRecipient)).toEqBigNumber(expectedLocalFeeForDenominationAsset);

      // The redeemed token balances net fees should remain
      expect(await depositToken.balanceOf(sharesWrapper)).toEqBigNumber(
        depositAmount
          .add(depositTokenGain)
          .sub(expectedProtocolFeeForDepositToken)
          .sub(expectedLocalFeeForDepositToken),
      );
      expect(await denominationAsset.balanceOf(sharesWrapper)).toEqBigNumber(
        denominationAssetAmount.sub(expectedProtocolFeeForDenominationAsset).sub(expectedLocalFeeForDenominationAsset),
      );

      // The state should now be Redeem
      expect(await sharesWrapper.getState()).toEqBigNumber(ArbitraryTokenPhasedSharesWrapperState.Redeem);

      // Assert events
      assertEvent(receipt, 'StateSet', {
        state: ArbitraryTokenPhasedSharesWrapperState.Redeem,
      });

      const protocolFeePaidEvents = extractEvent(receipt, 'ProtocolFeePaid');
      expect(protocolFeePaidEvents).toHaveLength(2);
      expect(protocolFeePaidEvents[0]).toMatchEventArgs({
        token: denominationAsset,
        amount: expectedProtocolFeeForDenominationAsset,
      });
      expect(protocolFeePaidEvents[1]).toMatchEventArgs({
        token: depositToken,
        amount: expectedProtocolFeeForDepositToken,
      });

      const localFeePaidEvents = extractEvent(receipt, 'FeePaid');
      expect(localFeePaidEvents).toHaveLength(2);
      expect(localFeePaidEvents[0]).toMatchEventArgs({
        token: denominationAsset,
        amount: expectedLocalFeeForDenominationAsset,
      });
      expect(localFeePaidEvents[1]).toMatchEventArgs({
        token: depositToken,
        amount: expectedLocalFeeForDepositToken,
      });

      expect(receipt).toMatchInlineGasSnapshot(`405944`);
    });

    it.todo('happy path: local fee that includes principal');
  });
});

describe('owner actions', () => {
  const feeRecipient = randomAddress1;

  let sharesWrapper: ArbitraryTokenPhasedSharesWrapperLib;

  beforeEach(async () => {
    const deploySharesWrapperRes = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId: 0,
      transfersAllowed: false,
      totalDepositMax: 0,
      feeRecipient,
      feeBps: 10,
      feeExcludesDepositTokenPrincipal: false,
      manager,
    });
    sharesWrapper = deploySharesWrapperRes.sharesWrapper;
  });

  describe('setAllowedDepositorListId', () => {
    let nextAllowedDepositListId: BigNumber;

    beforeEach(async () => {
      // Assure the next value is not the same as the prev
      nextAllowedDepositListId = (await sharesWrapper.getAllowedDepositorListId()).add(2);
    });

    it('can only be called by owner', async () => {
      await expect(
        sharesWrapper.connect(manager).setAllowedDepositorListId(nextAllowedDepositListId),
      ).rejects.toBeRevertedWith('Unauthorized');
    });

    it('happy path', async () => {
      const receipt = await sharesWrapper.connect(fundOwner).setAllowedDepositorListId(nextAllowedDepositListId);

      expect(await sharesWrapper.getAllowedDepositorListId()).toEqBigNumber(nextAllowedDepositListId);

      assertEvent(receipt, 'AllowedDepositorListIdSet', {
        listId: nextAllowedDepositListId,
      });
    });
  });

  describe('setManager', () => {
    const nextManager = randomAddress1;

    it('can only be called by owner', async () => {
      await expect(sharesWrapper.connect(manager).setManager(nextManager)).rejects.toBeRevertedWith('Unauthorized');
    });

    it('happy path', async () => {
      const receipt = await sharesWrapper.connect(fundOwner).setManager(nextManager);

      expect(await sharesWrapper.getManager()).toMatchAddress(nextManager);

      assertEvent(receipt, 'ManagerSet', {
        manager: nextManager,
      });
    });
  });

  describe('setTotalDepositMax', () => {
    let nextTotalDepositMax: BigNumber;

    beforeEach(async () => {
      // Assure the next value is not the same as the prev
      nextTotalDepositMax = (await sharesWrapper.getTotalDepositMax()).add(2);
    });

    it('can only be called by owner', async () => {
      await expect(sharesWrapper.connect(manager).setTotalDepositMax(nextTotalDepositMax)).rejects.toBeRevertedWith(
        'Unauthorized',
      );
    });

    it('happy path', async () => {
      const receipt = await sharesWrapper.connect(fundOwner).setTotalDepositMax(nextTotalDepositMax);

      expect(await sharesWrapper.getTotalDepositMax()).toEqBigNumber(nextTotalDepositMax);

      assertEvent(receipt, 'TotalDepositMaxSet', {
        totalDepositMax: nextTotalDepositMax,
      });
    });
  });
});

describe('transfers', () => {
  const transferAmount = BigNumber.from(3);

  it('disallows transfers if transfersAllowed is false', async () => {
    const transferRecipient = randomUser;

    const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId: 0,
      transfersAllowed: false,
      totalDepositMax: 0,
      feeRecipient: constants.AddressZero,
      feeBps: 0,
      feeExcludesDepositTokenPrincipal: false,
      manager,
    });

    // Deposit and mint some shares
    const depositAmount = depositTokenUnit;
    await depositToken.connect(investor).approve(sharesWrapper, depositAmount);
    await sharesWrapper.connect(investor).deposit(depositAmount);

    // Should not allow transfer() calls
    await expect(sharesWrapper.connect(investor).transfer(transferRecipient, transferAmount)).rejects.toBeRevertedWith(
      'Disallowed',
    );

    // Should not allow transferFrom() calls
    await sharesWrapper.connect(investor).approve(transferRecipient, transferAmount);
    await expect(
      sharesWrapper.connect(transferRecipient).transferFrom(investor, transferRecipient, transferAmount),
    ).rejects.toBeRevertedWith('Disallowed');
  });

  it('allows transfers if transfersAllowed is true', async () => {
    const transferRecipient = randomUser;

    const { sharesWrapper } = await deployArbitraryTokenPhasedSharesWrapper({
      signer: randomUser,
      sharesWrapperFactory,
      vaultProxy,
      depositToken,
      allowedDepositorListId: 0,
      transfersAllowed: true,
      totalDepositMax: 0,
      feeRecipient: constants.AddressZero,
      feeBps: 0,
      feeExcludesDepositTokenPrincipal: false,
      manager,
    });

    // Deposit and mint some shares
    const depositAmount = depositTokenUnit;
    await depositToken.connect(investor).approve(sharesWrapper, depositAmount);
    await sharesWrapper.connect(investor).deposit(depositAmount);

    // Should allow transfer() calls
    await sharesWrapper.connect(investor).transfer(transferRecipient, transferAmount);
    expect(await sharesWrapper.balanceOf(transferRecipient)).toEqBigNumber(transferAmount);

    // Should allow transferFrom() calls
    await sharesWrapper.connect(investor).approve(transferRecipient, transferAmount);
    await sharesWrapper.connect(transferRecipient).transferFrom(investor, transferRecipient, transferAmount);
    expect(await sharesWrapper.balanceOf(transferRecipient)).toEqBigNumber(transferAmount.mul(2));
  });
});
