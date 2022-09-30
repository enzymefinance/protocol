import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  ITestStandardToken,
  ITestUniswapV2Pair,
  ITestUniswapV2Router,
  lendSelector,
  min,
  redeemSelector,
  SpendAssetsHandleType,
  uniswapV2LendArgs,
  uniswapV2RedeemArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  setAccountBalance,
  uniswapV2Lend,
  uniswapV2Redeem,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;

    const getRouterCall = await uniswapV2LiquidityAdapter.getUniswapV2Router2();

    expect(getRouterCall).toMatchAddress(fork.config.uniswap.router);

    const getFactoryCall = await uniswapV2LiquidityAdapter.getFactory();

    expect(getFactoryCall).toMatchAddress(fork.config.uniswap.factory);

    const getIntegrationManagerCall = await uniswapV2LiquidityAdapter.getIntegrationManager();

    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.integrationManager);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;

    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minPoolTokenAmount = utils.parseEther('1');

    const args = uniswapV2LendArgs({
      amountADesired,
      amountAMin,
      amountBDesired,
      amountBMin,
      minPoolTokenAmount,
      tokenA: fork.config.primitives.mln,
      tokenB: fork.config.weth,
    });

    await expect(
      uniswapV2LiquidityAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  it('generates expected output for lending', async () => {
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const tokenA = fork.config.primitives.mln;
    const tokenB = fork.config.weth;
    const poolToken = fork.config.uniswap.pools.mlnWeth;
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    const amountAMin = amountADesired;
    const amountBMin = amountBDesired;
    const minPoolTokenAmount = utils.parseEther('1');

    const lendArgs = uniswapV2LendArgs({
      amountADesired,
      amountAMin,
      amountBDesired,
      amountBMin,
      minPoolTokenAmount,
      tokenA,
      tokenB,
    });

    const selector = lendSelector;
    const result = await uniswapV2LiquidityAdapter.parseAssetsForAction(randomAddress(), selector, lendArgs);

    expect(result).toMatchFunctionOutput(uniswapV2LiquidityAdapter.parseAssetsForAction, {
      incomingAssets_: [poolToken],
      minIncomingAssetAmounts_: [minPoolTokenAmount],
      spendAssetAmounts_: [amountADesired, amountBDesired],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [tokenA, tokenB],
    });
  });

  it('generates expected output for redeeming', async () => {
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const tokenA = fork.config.primitives.mln;
    const tokenB = fork.config.weth;
    const poolToken = fork.config.uniswap.pools.mlnWeth;
    const poolTokenAmount = utils.parseEther('0.5');
    const amountAMin = utils.parseEther('1');
    const amountBMin = utils.parseEther('1');

    const redeemArgs = uniswapV2RedeemArgs({
      amountAMin,
      amountBMin,
      poolTokenAmount,
      tokenA,
      tokenB,
    });

    const selector = redeemSelector;
    const result = await uniswapV2LiquidityAdapter.parseAssetsForAction(randomAddress(), selector, redeemArgs);

    expect(result).toMatchFunctionOutput(uniswapV2LiquidityAdapter.parseAssetsForAction, {
      incomingAssets_: [tokenA, tokenB],
      minIncomingAssetAmounts_: [amountAMin, amountBMin],
      spendAssetAmounts_: [poolTokenAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [poolToken],
    });
  });
});

describe('lend', () => {
  it('can only be called via the IntegrationManager', async () => {
    const [fundOwner] = fork.accounts;
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const tokenA = fork.config.primitives.mln;
    const tokenB = fork.config.weth;

    const { vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, fork.deployer),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const lendArgs = uniswapV2LendArgs({
      amountADesired: utils.parseEther('1'),
      amountAMin: utils.parseEther('1'),
      amountBDesired: utils.parseEther('1'),
      amountBMin: utils.parseEther('1'),
      minPoolTokenAmount: utils.parseEther('1'),
      tokenA,
      tokenB,
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2LiquidityAdapter,
      encodedCallArgs: lendArgs,
      selector: lendSelector,
    });

    await expect(uniswapV2LiquidityAdapter.lend(vaultProxy, lendArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected with exact amountADesired and amountBDesired amounts', async () => {
    const weth = new ITestStandardToken(fork.config.weth, provider);
    const tokenA = new ITestStandardToken(fork.config.primitives.mln, provider);
    const tokenB = weth;
    const poolToken = new ITestStandardToken(fork.config.uniswap.pools.mlnWeth, provider);
    const uniswapPair = new ITestUniswapV2Pair(poolToken.address, provider);
    const uniswapRouter = new ITestUniswapV2Router(fork.config.uniswap.router, provider);
    const integrationManager = fork.deployment.integrationManager;
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Define lend tx values
    const amountADesired = utils.parseEther('1');
    const amountAMin = BigNumber.from(1);
    const amountBMin = BigNumber.from(1);
    const minPoolTokenAmount = BigNumber.from(1);

    // Calc amountBDesired relative to amountADesired
    const getReservesRes = await uniswapPair.getReserves();
    const [tokenAReserve, tokenBReserve] =
      (await uniswapPair.token0()) === tokenA.address
        ? [getReservesRes.reserve0_, getReservesRes.reserve1_]
        : [getReservesRes.reserve1_, getReservesRes.reserve0_];
    const amountBDesired = await uniswapRouter.quote(amountADesired, tokenAReserve, tokenBReserve);

    // Calc expected pool tokens to receive
    const poolTokensSupply = await poolToken.totalSupply();
    const expectedPoolTokens = min(
      amountADesired.mul(poolTokensSupply).div(tokenAReserve),
      amountBDesired.mul(poolTokensSupply).div(tokenBReserve),
    );

    expect(expectedPoolTokens).toEqBigNumber('55738540049454415');

    await setAccountBalance({ account: vaultProxy, amount: amountADesired, provider, token: tokenA });
    await setAccountBalance({ account: vaultProxy, amount: amountBDesired, provider, token: tokenB });

    await uniswapV2Lend({
      amountADesired,
      amountAMin,
      amountBDesired,
      amountBMin,
      comptrollerProxy,
      fundOwner,
      integrationManager,
      minPoolTokenAmount,
      provider,
      tokenA,
      tokenB,
      uniswapV2LiquidityAdapter,
      vaultProxy,
    });

    // Get pre-tx balances of all tokens
    const [postTxTokenABalance, postTxTokenBBalance, postTxPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    // Assert the exact amounts of tokens expected
    expect(postTxPoolTokenBalance).toEqBigNumber(expectedPoolTokens);
    expect(postTxTokenABalance).toEqBigNumber(0);
    expect(postTxTokenBBalance).toEqBigNumber(0);
  });
});

describe('redeem', () => {
  it('can only be called via the IntegrationManager', async () => {
    const [fundOwner] = fork.accounts;
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;

    const { vaultProxy } = await createNewFund({
      denominationAsset: new ITestStandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const redeemArgs = uniswapV2RedeemArgs({
      amountAMin: utils.parseEther('1'),
      amountBMin: utils.parseEther('1'),
      poolTokenAmount: utils.parseEther('0.5'),
      tokenA: fork.config.primitives.mln,
      tokenB: fork.config.weth,
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2LiquidityAdapter,
      encodedCallArgs: redeemArgs,
      selector: redeemSelector,
    });

    await expect(uniswapV2LiquidityAdapter.redeem(vaultProxy, redeemArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const weth = new ITestStandardToken(fork.config.weth, provider);
    const tokenA = new ITestStandardToken(fork.config.primitives.mln, provider);
    const tokenB = weth;
    const poolToken = new ITestStandardToken(fork.config.uniswap.pools.mlnWeth, provider);
    const [fundOwner] = fork.accounts;
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund and lend arbitrary amounts of tokens for an arbitrary amount of pool tokens
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');

    await setAccountBalance({ account: vaultProxy, amount: amountADesired, provider, token: tokenA });
    await setAccountBalance({ account: vaultProxy, amount: amountBDesired, provider, token: tokenB });

    await uniswapV2Lend({
      amountADesired,
      amountAMin: BigNumber.from(1),
      amountBDesired,
      amountBMin: BigNumber.from(1),
      comptrollerProxy,
      fundOwner,
      integrationManager,
      minPoolTokenAmount: BigNumber.from(1),
      provider,
      tokenA,
      tokenB,
      uniswapV2LiquidityAdapter,
      vaultProxy,
    });

    // Get pre-redeem balances of all tokens
    const [preRedeemTokenABalance, preRedeemTokenBBalance, preRedeemPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    // Define redeem params to redeem 1/2 of pool tokens
    const redeemPoolTokenAmount = preRedeemPoolTokenBalance.div(2);

    expect(redeemPoolTokenAmount).not.toEqBigNumber(BigNumber.from(0));

    // Calc expected amounts of tokens to receive
    const poolTokensSupply = await poolToken.totalSupply();
    const [poolTokenABalance, poolTokenBBalance] = await getAssetBalances({
      account: poolToken,
      assets: [tokenA, tokenB],
    });
    const expectedTokenAAmount = redeemPoolTokenAmount.mul(poolTokenABalance).div(poolTokensSupply);
    const expectedTokenBAmount = redeemPoolTokenAmount.mul(poolTokenBBalance).div(poolTokensSupply);

    await uniswapV2Redeem({
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
      comptrollerProxy,
      fundOwner,
      integrationManager,
      poolTokenAmount: redeemPoolTokenAmount,
      tokenA,
      tokenB,
      uniswapV2LiquidityAdapter,
    });

    // Get post-redeem balances of all tokens
    const [postRedeemTokenABalance, postRedeemTokenBBalance, postRedeemPoolTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [tokenA, tokenB, poolToken],
    });

    // Assert the exact amounts of tokens expected
    expect(postRedeemPoolTokenBalance).toEqBigNumber(preRedeemPoolTokenBalance.sub(redeemPoolTokenAmount));
    expect(postRedeemTokenABalance).toEqBigNumber(preRedeemTokenABalance.add(expectedTokenAAmount));
    expect(postRedeemTokenBBalance).toEqBigNumber(preRedeemTokenBBalance.add(expectedTokenBAmount));
  });
});
