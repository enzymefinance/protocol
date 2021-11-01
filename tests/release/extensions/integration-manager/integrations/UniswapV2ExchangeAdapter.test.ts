import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  StandardToken,
  takeOrderSelector,
  uniswapV2LendArgs,
  uniswapV2TakeOrderArgs,
  UniswapV2Router,
} from '@enzymefinance/protocol';
import {
  ProtocolDeployment,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const uniswapV2ExchangeAdapter = fork.deployment.uniswapV2ExchangeAdapter;

    const getRouterCall = await uniswapV2ExchangeAdapter.getUniswapV2Router2();
    expect(getRouterCall).toMatchAddress(fork.config.uniswap.router);

    const getIntegrationManagerCall = await uniswapV2ExchangeAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.integrationManager);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const uniswapV2ExchangeAdapter = fork.deployment.uniswapV2ExchangeAdapter;

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
      uniswapV2ExchangeAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const uniswapV2ExchangeAdapter = fork.deployment.uniswapV2ExchangeAdapter;
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
      adapter: uniswapV2ExchangeAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(
      uniswapV2ExchangeAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs),
    ).rejects.toBeRevertedWith('Only the IntegrationManager can call this function');
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
        uniswapV2ExchangeAdapter: fork.deployment.uniswapV2ExchangeAdapter,
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
    const uniswapV2ExchangeAdapter = fork.deployment.uniswapV2ExchangeAdapter;
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

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2ExchangeAdapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
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
    const incomingAsset = new StandardToken(fork.config.primitives.crv, provider);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;
    const uniswapV2ExchangeAdapter = fork.deployment.uniswapV2ExchangeAdapter;
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

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2ExchangeAdapter,
      path,
      outgoingAssetAmount,
      minIncomingAssetAmount: amountsOut[1],
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
