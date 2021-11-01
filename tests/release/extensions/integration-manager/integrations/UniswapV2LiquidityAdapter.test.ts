import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
  uniswapV2LendArgs,
  uniswapV2RedeemArgs,
  min,
  IUniswapV2Pair,
  UniswapV2Router,
} from '@enzymefinance/protocol';
import {
  ProtocolDeployment,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
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
      tokenA: fork.config.primitives.mln,
      tokenB: fork.config.weth,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
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
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
    });

    const selector = lendSelector;
    const result = await uniswapV2LiquidityAdapter.parseAssetsForAction(randomAddress(), selector, lendArgs);

    expect(result).toMatchFunctionOutput(uniswapV2LiquidityAdapter.parseAssetsForAction, {
      incomingAssets_: [poolToken],
      spendAssets_: [tokenA, tokenB],
      spendAssetAmounts_: [amountADesired, amountBDesired],
      minIncomingAssetAmounts_: [minPoolTokenAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
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
      poolTokenAmount,
      tokenA,
      tokenB,
      amountAMin,
      amountBMin,
    });

    const selector = redeemSelector;
    const result = await uniswapV2LiquidityAdapter.parseAssetsForAction(randomAddress(), selector, redeemArgs);

    expect(result).toMatchFunctionOutput(uniswapV2LiquidityAdapter.parseAssetsForAction, {
      incomingAssets_: [tokenA, tokenB],
      spendAssets_: [poolToken],
      spendAssetAmounts_: [poolTokenAmount],
      minIncomingAssetAmounts_: [amountAMin, amountBMin],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
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
      signer: fork.deployer,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, fork.deployer),
    });

    const lendArgs = uniswapV2LendArgs({
      tokenA,
      tokenB,
      amountADesired: utils.parseEther('1'),
      amountBDesired: utils.parseEther('1'),
      amountAMin: utils.parseEther('1'),
      amountBMin: utils.parseEther('1'),
      minPoolTokenAmount: utils.parseEther('1'),
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2LiquidityAdapter,
      selector: lendSelector,
      encodedCallArgs: lendArgs,
    });

    await expect(uniswapV2LiquidityAdapter.lend(vaultProxy, lendArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected with exact amountADesired and amountBDesired amounts', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const tokenA = new StandardToken(fork.config.primitives.mln, whales.mln);
    const tokenB = weth;
    const poolToken = new StandardToken(fork.config.uniswap.pools.mlnWeth, provider);
    const uniswapPair = new IUniswapV2Pair(poolToken.address, provider);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const integrationManager = fork.deployment.integrationManager;
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Define lend tx values
    const amountADesired = utils.parseEther('1');
    const amountAMin = BigNumber.from(1);
    const amountBMin = BigNumber.from(1);
    const minPoolTokenAmount = BigNumber.from(1);

    // Calc amountBDesired relative to amountADesired
    const getReservesRes = await uniswapPair.getReserves();
    const [tokenAReserve, tokenBReserve] =
      (await uniswapPair.token0()) == tokenA.address
        ? [getReservesRes[0], getReservesRes[1]]
        : [getReservesRes[1], getReservesRes[0]];
    const amountBDesired = await uniswapRouter.quote(amountADesired, tokenAReserve, tokenBReserve);

    // Calc expected pool tokens to receive
    const poolTokensSupply = await poolToken.totalSupply();
    const expectedPoolTokens = min(
      amountADesired.mul(poolTokensSupply).div(tokenAReserve),
      amountBDesired.mul(poolTokensSupply).div(tokenBReserve),
    );
    expect(expectedPoolTokens).toEqBigNumber('94300266874434476');

    // Seed fund with tokens and lend
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2LiquidityAdapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    const redeemArgs = uniswapV2RedeemArgs({
      poolTokenAmount: utils.parseEther('0.5'),
      tokenA: fork.config.primitives.mln,
      tokenB: fork.config.weth,
      amountAMin: utils.parseEther('1'),
      amountBMin: utils.parseEther('1'),
    });

    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2LiquidityAdapter,
      selector: redeemSelector,
      encodedCallArgs: redeemArgs,
    });

    await expect(uniswapV2LiquidityAdapter.redeem(vaultProxy, redeemArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const tokenA = new StandardToken(fork.config.primitives.mln, whales.mln);
    const tokenB = weth;
    const poolToken = new StandardToken(fork.config.uniswap.pools.mlnWeth, provider);
    const [fundOwner] = fork.accounts;
    const uniswapV2LiquidityAdapter = fork.deployment.uniswapV2LiquidityAdapter;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    // Seed fund and lend arbitrary amounts of tokens for an arbitrary amount of pool tokens
    const amountADesired = utils.parseEther('1');
    const amountBDesired = utils.parseEther('1');
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
    await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2LiquidityAdapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
      minPoolTokenAmount: BigNumber.from(1),
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
      comptrollerProxy,
      integrationManager,
      fundOwner,
      uniswapV2LiquidityAdapter,
      poolTokenAmount: redeemPoolTokenAmount,
      tokenA,
      tokenB,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
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
