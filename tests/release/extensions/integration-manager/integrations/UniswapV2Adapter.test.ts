import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
  takeOrderSelector,
  uniswapV2LendArgs,
  uniswapV2RedeemArgs,
  uniswapV2TakeOrderArgs,
  min,
  IUniswapV2Pair,
  UniswapV2Router,
} from '@enzymefinance/protocol';
import {
  ProtocolDeployment,
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  uniswapV2Lend,
  uniswapV2Redeem,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;

    const getRouterCall = await uniswapV2Adapter.getUniswapV2Router2();
    expect(getRouterCall).toMatchAddress(fork.config.uniswap.router);

    const getFactoryCall = await uniswapV2Adapter.getFactory();
    expect(getFactoryCall).toMatchAddress(fork.config.uniswap.factory);

    const getIntegrationManagerCall = await uniswapV2Adapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.integrationManager);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;

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
      uniswapV2Adapter.parseAssetsForMethod(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(uniswapV2Adapter.parseAssetsForMethod(randomAddress(), lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
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
    const result = await uniswapV2Adapter.parseAssetsForMethod(randomAddress(), selector, lendArgs);

    expect(result).toMatchFunctionOutput(uniswapV2Adapter.parseAssetsForMethod, {
      incomingAssets_: [poolToken],
      spendAssets_: [tokenA, tokenB],
      spendAssetAmounts_: [amountADesired, amountBDesired],
      minIncomingAssetAmounts_: [minPoolTokenAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    });
  });

  it('generates expected output for redeeming', async () => {
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
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
    const result = await uniswapV2Adapter.parseAssetsForMethod(randomAddress(), selector, redeemArgs);

    expect(result).toMatchFunctionOutput(uniswapV2Adapter.parseAssetsForMethod, {
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
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
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
      adapter: uniswapV2Adapter,
      selector: lendSelector,
      encodedCallArgs: lendArgs,
    });

    await expect(uniswapV2Adapter.lend(vaultProxy, lendArgs, transferArgs)).rejects.toBeRevertedWith(
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
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
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

    const expectedIncomingAmount = BigNumber.from('140881238184881644');

    // Seed fund with tokens and lend
    await tokenA.transfer(vaultProxy, amountADesired);
    await tokenB.transfer(vaultProxy, amountBDesired);
    const receipt = await uniswapV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      minPoolTokenAmount,
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy: vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: lendSelector,
      incomingAssets: [poolToken],
      incomingAssetAmounts: [expectedIncomingAmount],
      outgoingAssets: [tokenA, tokenB],
      outgoingAssetAmounts: [amountADesired, amountBDesired],
      integrationData: expect.anything(),
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
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;

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
      adapter: uniswapV2Adapter,
      selector: redeemSelector,
      encodedCallArgs: redeemArgs,
    });

    await expect(uniswapV2Adapter.redeem(vaultProxy, redeemArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const tokenA = new StandardToken(fork.config.primitives.mln, whales.mln);
    const tokenB = weth;
    const poolToken = new StandardToken(fork.config.uniswap.pools.mlnWeth, provider);
    const [fundOwner] = fork.accounts;
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
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
      uniswapV2Adapter,
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

    const receipt = await uniswapV2Redeem({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      poolTokenAmount: redeemPoolTokenAmount,
      tokenA,
      tokenB,
      amountAMin: BigNumber.from(1),
      amountBMin: BigNumber.from(1),
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy: vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: redeemSelector,
      incomingAssets: [tokenA, tokenB],
      incomingAssetAmounts: [expectedTokenAAmount, expectedTokenBAmount],
      outgoingAssets: [poolToken],
      outgoingAssetAmounts: [redeemPoolTokenAmount],
      integrationData: expect.anything(),
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

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
    const [fundOwner] = fork.accounts;

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const incomingAsset = new StandardToken(fork.config.weth, provider);

    const takeOrderArgs = uniswapV2TakeOrderArgs({
      path: [outgoingAsset, incomingAsset],
      outgoingAssetAmount: utils.parseEther('1'),
      minIncomingAssetAmount: utils.parseEther('1'),
    });
    const transferArgs = await assetTransferArgs({
      adapter: uniswapV2Adapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(uniswapV2Adapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('does not allow a path with less than 2 assets', async () => {
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);

    await expect(
      uniswapV2TakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        uniswapV2Adapter: fork.deployment.uniswapV2Adapter,
        path: [outgoingAsset],
        outgoingAssetAmount: utils.parseEther('1'),
        minIncomingAssetAmount: utils.parseEther('1'),
      }),
    ).rejects.toBeRevertedWith('_path must be >= 2');
  });

  it('works as expected when called by a fund and swap assets directly', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const incomingAsset = weth;
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const path = [outgoingAsset, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);
    const expectedIncomingAssetAmount = amountsOut[1];

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    const receipt = await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [outgoingAssetAmount],
      integrationData: expect.anything(),
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    expect(incomingAssetAmount).toEqBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });

  it('works as expected when called by a fund and swap assets via an intermediary', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const incomingAsset = new StandardToken(fork.config.primitives.knc, provider);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;
    const uniswapV2Adapter = fork.deployment.uniswapV2Adapter;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const path = [outgoingAsset, weth, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);
    const expectedIncomingAssetAmount = amountsOut[2];

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    const receipt = await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');
    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      adapter: uniswapV2Adapter,
      selector: takeOrderSelector,
      incomingAssets: [incomingAsset],
      incomingAssetAmounts: [expectedIncomingAssetAmount],
      outgoingAssets: [outgoingAsset],
      outgoingAssetAmounts: [outgoingAssetAmount],
      integrationData: expect.anything(),
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    expect(incomingAssetAmount).toEqBigNumber(amountsOut[2]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});
