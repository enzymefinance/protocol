import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { BalancerV2LiquidityAdapter, ComptrollerLib, IntegrationManager, VaultLib } from '@enzymefinance/protocol';
import {
  balancerV2GetPoolFromId,
  balancerV2LendArgs,
  balancerV2RedeemArgs,
  balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut,
  balancerV2WeightedPoolsUserDataExactBptInForTokensOut,
  balancerV2WeightedPoolsUserDataExactTokensInForBptOut,
  balancerV2WeightedPoolsUserDataTokenInForExactBptOut,
  ITestBalancerV2Helpers,
  ITestStandardToken,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  balancerV2ConstructRequest,
  balancerV2Lend,
  balancerV2Redeem,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  setAccountBalance,
} from '@enzymefinance/testutils';
import type { BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
let balancerV2LiquidityAdapter: BalancerV2LiquidityAdapter;
let balancerVaultAddress: AddressLike;
let poolId: BytesLike, bpt: AddressLike;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  balancerV2LiquidityAdapter = fork.deployment.balancerV2LiquidityAdapter;
  balancerVaultAddress = fork.config.balancer.vault;

  // weighted pool: [BAL, WETH]
  poolId = fork.config.balancer.pools.bal80Weth20.id;
  bpt = balancerV2GetPoolFromId(poolId);
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    await expect(
      balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), '0x'),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('lend', () => {
    // Use "one token in" option to validate that not all tokens in pool are used
    const maxSpendAssetAmounts = [123, 0]; // [BAL, WETH]
    const incomingBptAmount = 456;
    const userData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
      bptAmountOut: incomingBptAmount,
      tokenIndex: 0, // BAL
    });
    let spendAssets: AddressLike[];

    beforeEach(() => {
      spendAssets = [fork.config.primitives.bal];
    });

    it('does not allow useInternalBalances = true', async () => {
      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: maxSpendAssetAmounts,
        userData,
        useInternalBalance: true,
      });

      const lendArgs = balancerV2LendArgs({
        poolId,
        minIncomingBptAmount: incomingBptAmount,
        spendAssets,
        spendAssetAmounts: maxSpendAssetAmounts,
        request,
      });

      await expect(
        balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), lendSelector, lendArgs),
      ).rejects.toBeRevertedWith('Internal balances not supported');
    });

    it('happy path', async () => {
      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: maxSpendAssetAmounts,
        userData,
      });

      const lendArgs = balancerV2LendArgs({
        poolId,
        minIncomingBptAmount: incomingBptAmount,
        spendAssets,
        spendAssetAmounts: maxSpendAssetAmounts,
        request,
      });

      const result = await balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), lendSelector, lendArgs);

      expect(result).toMatchFunctionOutput(balancerV2LiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: [bpt],
        minIncomingAssetAmounts_: [incomingBptAmount],
        spendAssets_: spendAssets,
        spendAssetAmounts_: maxSpendAssetAmounts,
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      });
    });
  });

  describe('redeem', () => {
    // Use "one token out" option to validate that not all tokens in pool are used
    const minIncomingAssetAmounts = [123, 0]; // [BAL, WETH]
    const maxSpendBptAmount = 456;
    const userData = balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut({
      bptAmountIn: maxSpendBptAmount,
      tokenIndex: 0, // BAL
    });
    let incomingAssets: AddressLike[];

    beforeEach(() => {
      incomingAssets = [fork.config.primitives.bal];
    });

    it('does not allow useInternalBalances = true', async () => {
      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: minIncomingAssetAmounts,
        userData,
        useInternalBalance: true,
      });

      const redeemArgs = balancerV2RedeemArgs({
        poolId,
        bptAmount: maxSpendBptAmount,
        incomingAssets,
        minIncomingAssetAmounts,
        request,
      });

      await expect(
        balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), redeemSelector, redeemArgs),
      ).rejects.toBeRevertedWith('Internal balances not supported');
    });

    it('happy path', async () => {
      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: minIncomingAssetAmounts,
        userData,
      });

      const redeemArgs = balancerV2RedeemArgs({
        poolId,
        bptAmount: maxSpendBptAmount,
        incomingAssets,
        minIncomingAssetAmounts,
        request,
      });

      const result = await balancerV2LiquidityAdapter.parseAssetsForAction(randomAddress(), redeemSelector, redeemArgs);

      expect(result).toMatchFunctionOutput(balancerV2LiquidityAdapter.parseAssetsForAction, {
        incomingAssets_: incomingAssets,
        minIncomingAssetAmounts_: minIncomingAssetAmounts,
        spendAssets_: [bpt],
        spendAssetAmounts_: [maxSpendBptAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      });
    });
  });
});

describe('actions', () => {
  let integrationManager: IntegrationManager;
  let balancerHelpers: ITestBalancerV2Helpers;
  let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
  let fundOwner: SignerWithAddress;

  beforeEach(async () => {
    [fundOwner] = fork.accounts;

    integrationManager = fork.deployment.integrationManager;

    balancerHelpers = new ITestBalancerV2Helpers(fork.config.balancer.helpers, provider);

    const newFundRes = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, fork.deployer),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });
    comptrollerProxy = newFundRes.comptrollerProxy;
    vaultProxy = newFundRes.vaultProxy;
  });

  describe('lend', () => {
    it('happy path: Weighted Pool: EXACT_TOKENS_IN_FOR_BPT_OUT', async () => {
      const spendAssets = [fork.config.primitives.bal, fork.config.weth];
      const spendAssetAmounts = await Promise.all(
        spendAssets.map(async (asset) => (await getAssetUnit(new ITestStandardToken(asset, provider))).mul(3)),
      );
      const minIncomingBptAmount = 0;

      const userData = balancerV2WeightedPoolsUserDataExactTokensInForBptOut({
        amountsIn: spendAssetAmounts,
        bptOut: minIncomingBptAmount,
      });

      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: spendAssetAmounts,
        userData,
      });

      const { bptOut_ } = await balancerHelpers.queryJoin
        .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
        .call();
      expect(bptOut_).toBeGtBigNumber(0);

      const lendReceipt = await balancerV2Lend({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        balancerV2LiquidityAdapter,
        poolId,
        minIncomingBptAmount: 0,
        spendAssets,
        spendAssetAmounts,
        request,
        provider,
        seedFund: true,
      });

      const [postTxToken1Balance, postTxToken2Balance, postTxPoolTokenBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [spendAssets[0], spendAssets[1], bpt],
      });

      // Assert the exact amounts of tokens expected
      expect(postTxPoolTokenBalance).toEqBigNumber(bptOut_);
      expect(postTxToken1Balance).toEqBigNumber(0);
      expect(postTxToken2Balance).toEqBigNumber(0);

      expect(lendReceipt).toMatchInlineGasSnapshot(`489880`);
    });

    it('happy path: Weighted Pool: TOKEN_IN_FOR_EXACT_BPT_OUT', async () => {
      const spendAsset = new ITestStandardToken(fork.config.weth, provider);
      const spendAssetIndex = 1; // WETH
      const maxSpendAssetAmount = await getAssetUnit(spendAsset);

      // Must be small relative to maxSpendAssetAmount value
      const incomingBptAmount = 123;

      const userData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
        bptAmountOut: incomingBptAmount,
        tokenIndex: spendAssetIndex,
      });

      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: [0, maxSpendAssetAmount], // [BAL, WETH]
        userData,
      });

      const { amountsIn_ } = await balancerHelpers.queryJoin
        .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
        .call();
      expect(amountsIn_[0]).toEqBigNumber(0);
      expect(amountsIn_[1]).toBeBetweenBigNumber(1, maxSpendAssetAmount);

      // Seed fund with spendAsset
      const preTxSpendAssetBalance = maxSpendAssetAmount;
      await setAccountBalance({
        account: vaultProxy,
        amount: preTxSpendAssetBalance,
        provider,
        token: spendAsset,
      });

      const lendReceipt = await balancerV2Lend({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        balancerV2LiquidityAdapter,
        poolId,
        minIncomingBptAmount: 0,
        spendAssets: [spendAsset],
        spendAssetAmounts: [maxSpendAssetAmount],
        request,
      });

      const [postTxSpendAssetBalance, postTxPoolTokenBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [spendAsset, bpt],
      });

      // Assert the amounts of tokens expected
      expect(postTxPoolTokenBalance).toEqBigNumber(incomingBptAmount);
      expect(postTxSpendAssetBalance).toEqBigNumber(preTxSpendAssetBalance.sub(amountsIn_[spendAssetIndex]));

      expect(lendReceipt).toMatchInlineGasSnapshot(`420540`);
    });
  });

  describe('redeem', () => {
    beforeEach(async () => {
      // Acquire some BPT to later redeem

      const spendAsset = new ITestStandardToken(fork.config.weth, provider);
      const maxSpendAssetAmount = (await getAssetUnit(spendAsset)).mul(1000);

      // Must be small relative to maxSpendAssetAmount value
      const incomingBptAmount = (await getAssetUnit(spendAsset)).mul(3);

      const userData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
        bptAmountOut: incomingBptAmount,
        tokenIndex: 1, // WETH
      });

      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: [0, maxSpendAssetAmount], // [BAL, WETH]
        userData,
      });

      await balancerV2Lend({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        balancerV2LiquidityAdapter,
        poolId,
        minIncomingBptAmount: 0,
        spendAssets: [spendAsset],
        spendAssetAmounts: [maxSpendAssetAmount],
        request,
        provider,
        seedFund: true,
      });
    });

    it('does not allow receiving unexpected incoming assets', async () => {
      // Use an option to redeem for all tokens, but exclude a token from `incomingAssets`

      const redeemBptAmount = await new ITestStandardToken(bpt, provider).balanceOf(vaultProxy);

      const userData = balancerV2WeightedPoolsUserDataExactBptInForTokensOut({
        bptAmountIn: redeemBptAmount,
      });

      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: [1, 1], // Use >0 limits to we receive at least 1 of each token
        userData,
      });

      await expect(
        balancerV2Redeem({
          comptrollerProxy,
          integrationManager,
          fundOwner,
          balancerV2LiquidityAdapter,
          poolId,
          bptAmount: redeemBptAmount,
          incomingAssets: [fork.config.weth],
          minIncomingAssetAmounts: [0],
          request,
        }),
      ).rejects.toBeRevertedWith('Unexpected asset received');
    });

    it('happy path: Weighted Pool: EXACT_BPT_IN_FOR_TOKENS_OUT', async () => {
      const incomingAssets = [fork.config.primitives.bal, fork.config.weth];

      // Get pre-redeem balances of all tokens
      const [preRedeemToken1Balance, preRedeemToken2Balance, preRedeemBptBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [incomingAssets[0], incomingAssets[1], bpt],
      });

      // Only partially redeem BPT
      const redeemBptAmount = preRedeemBptBalance.div(3);
      expect(redeemBptAmount).not.toEqBigNumber(BigNumber.from(0));

      const userData = balancerV2WeightedPoolsUserDataExactBptInForTokensOut({
        bptAmountIn: redeemBptAmount,
      });

      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: [0, 0],
        userData,
      });

      // Calc expected amounts of tokens to receive
      const { amountsOut_ } = await balancerHelpers.queryExit
        .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
        .call();

      const redeemReceipt = await balancerV2Redeem({
        comptrollerProxy,
        integrationManager,
        fundOwner,
        balancerV2LiquidityAdapter,
        poolId,
        bptAmount: redeemBptAmount,
        incomingAssets,
        minIncomingAssetAmounts: [0, 0],
        request,
      });

      // Get post-redeem balances of all tokens
      const [postRedeemToken1Balance, postRedeemToken2Balance, postRedeemBptBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [incomingAssets[0], incomingAssets[1], bpt],
      });

      // Assert the exact amounts of tokens expected
      expect(postRedeemBptBalance).toEqBigNumber(preRedeemBptBalance.sub(redeemBptAmount));
      expect(postRedeemToken1Balance).toEqBigNumber(preRedeemToken1Balance.add(amountsOut_[0]));
      expect(postRedeemToken2Balance).toEqBigNumber(preRedeemToken2Balance.add(amountsOut_[1]));

      expect(redeemReceipt).toMatchInlineGasSnapshot(`453574`);
    });

    it('happy path: Weighted Pool: EXACT_BPT_IN_FOR_ONE_TOKEN_OUT', async () => {
      const incomingAsset = fork.config.weth;

      // Get pre-redeem balances of all tokens
      const [preRedeemIncomingAssetBalance, preRedeemBptBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [incomingAsset, bpt],
      });

      // Only partially redeem BPT
      const redeemBptAmount = preRedeemBptBalance.div(3);
      expect(redeemBptAmount).not.toEqBigNumber(BigNumber.from(0));

      const userData = balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut({
        bptAmountIn: redeemBptAmount,
        tokenIndex: 1, // WETH
      });

      const request = await balancerV2ConstructRequest({
        provider,
        balancerVaultAddress,
        poolId,
        limits: [0, 0],
        userData,
      });

      // Calc expected amounts of tokens to receive
      const { amountsOut_ } = await balancerHelpers.queryExit
        .args(poolId, balancerV2LiquidityAdapter, vaultProxy, request)
        .call();
      expect(amountsOut_[0]).toEqBigNumber(0);
      expect(amountsOut_[1]).toBeGtBigNumber(0);

      const redeemReceipt = await balancerV2Redeem({
        comptrollerProxy,
        integrationManager,
        fundOwner,
        balancerV2LiquidityAdapter,
        poolId,
        bptAmount: redeemBptAmount,
        incomingAssets: [incomingAsset],
        minIncomingAssetAmounts: [0],
        request,
      });

      // Get post-redeem balances of all tokens
      const [postRedeemIncomingAssetBalance, postRedeemBptBalance] = await getAssetBalances({
        account: vaultProxy,
        assets: [incomingAsset, bpt],
      });

      // Assert the exact amounts of tokens expected
      expect(postRedeemBptBalance).toEqBigNumber(preRedeemBptBalance.sub(redeemBptAmount));
      expect(postRedeemIncomingAssetBalance).toEqBigNumber(preRedeemIncomingAssetBalance.add(amountsOut_[1]));

      expect(redeemReceipt).toMatchInlineGasSnapshot(`364096`);
    });
  });
});