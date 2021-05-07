import {
  alphaHomoraV1LendArgs,
  alphaHomoraV1RedeemArgs,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  AlphaHomoraV1Bank,
  alphaHomoraV1Lend,
  alphaHomoraV1Redeem,
  calcAlphaBankLiveTotalEth,
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

// HAPPY PATHS
describe('lend', () => {
  it('works as expected when called by fund', async () => {
    const alphaHomoraBank = new AlphaHomoraV1Bank(fork.config.alphaHomoraV1.ibeth, provider);
    const ibeth = new StandardToken(fork.config.alphaHomoraV1.ibeth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.weth, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Seed fund with some WETH to spend
    await weth.transfer(vaultProxy, utils.parseEther('1'));

    // Get balances prior to lending
    const [preTxWethBalance, preTxIbethBalance] = await getAssetBalances({
      assets: [weth, ibeth],
      account: vaultProxy,
    });

    // Calculate approx ibETH to receive for lend amount (cannot be exact because of interest accrued at every block)
    const wethToLend = preTxWethBalance.div(2);
    const approxIncomingIbethAmount = wethToLend.mul(await ibeth.totalSupply()).div(
      await calcAlphaBankLiveTotalEth({
        provider: provider,
        alphaHomoraBank,
      }),
    );

    // Lend WETH for ibETH
    const lendReceipt = await alphaHomoraV1Lend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      alphaHomoraV1Adapter: fork.deployment.alphaHomoraV1Adapter,
      wethAmount: wethToLend,
    });

    // Get balances after lending
    const [postTxWethBalance, postTxIbethBalance] = await getAssetBalances({
      assets: [weth, ibeth],
      account: vaultProxy,
    });

    // Assert the incoming and outgoing asset amounts
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(wethToLend));

    // This a proof that the actual received amount of ibETH is only off by less than 1/10^8 from the expected value
    const receivedIbethAmount = postTxIbethBalance.sub(preTxIbethBalance);
    expect(receivedIbethAmount).toBeLteBigNumber(approxIncomingIbethAmount);
    expect(approxIncomingIbethAmount.sub(receivedIbethAmount)).toBeLteBigNumber(
      approxIncomingIbethAmount.div(100000000),
    );

    // Assert gas cost of lend tx
    expect(lendReceipt).toCostLessThan(317000);
  });
});

describe('redeem', () => {
  it('works as expected when called by fund', async () => {
    const alphaHomoraBank = new AlphaHomoraV1Bank(fork.config.alphaHomoraV1.ibeth, provider);
    const ibeth = new StandardToken(fork.config.alphaHomoraV1.ibeth, provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, provider),
    });

    // Seed fund with some WETH to spend and lend WETH for ibETH
    const initialWethAmount = utils.parseEther('1');
    await weth.transfer(vaultProxy, initialWethAmount);
    await alphaHomoraV1Lend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      alphaHomoraV1Adapter: fork.deployment.alphaHomoraV1Adapter,
      wethAmount: initialWethAmount.div(2),
    });

    // Get balances prior to redeeming
    const [preTxWethBalance, preTxIbethBalance] = await getAssetBalances({
      assets: [weth, ibeth],
      account: vaultProxy,
    });

    // Calculate approx WETH to receive for redeemed ibETH amount (cannot be exact because of interest accrued at every block)
    const ibethToRedeem = (await ibeth.balanceOf(vaultProxy)).div(2);
    const approxIncomingWethAmount = ibethToRedeem
      .mul(
        await calcAlphaBankLiveTotalEth({
          alphaHomoraBank,
          provider: provider as any,
        }),
      )
      .div(await ibeth.totalSupply());

    // Redeem arbitrary amount of ibETH for WETH
    const redeemReceipt = await alphaHomoraV1Redeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      alphaHomoraV1Adapter: fork.deployment.alphaHomoraV1Adapter,
      ibethAmount: ibethToRedeem,
    });

    // Get balances after redeeming
    const [postTxWethBalance, postTxIbethBalance] = await getAssetBalances({
      assets: [weth, ibeth],
      account: vaultProxy,
    });

    expect(postTxIbethBalance).toEqBigNumber(preTxIbethBalance.sub(ibethToRedeem));

    // This a proof that the actual received amount of WETH is only off by less than 1/10^8 from the expected value
    const receivedWethAmount = postTxWethBalance.sub(preTxWethBalance);
    expect(receivedWethAmount).toBeGteBigNumber(approxIncomingWethAmount);
    expect(receivedWethAmount.sub(approxIncomingWethAmount)).toBeLteBigNumber(approxIncomingWethAmount.div(100000000));

    // Assert gas cost of redeem tx
    // Rounding up from 243318
    expect(redeemReceipt).toCostLessThan(244000);
  });
});

// TODO: move all below to unit tests when unit tests are using new deployment scripts

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const alphaHomoraAdapter = fork.deployment.alphaHomoraV1Adapter;

    const lendArgs = alphaHomoraV1LendArgs({
      outgoingWethAmount: 1,
      minIncomingIbethAmount: 1,
    });

    await expect(alphaHomoraAdapter.parseAssetsForMethod(utils.randomBytes(4), lendArgs)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(alphaHomoraAdapter.parseAssetsForMethod(lendSelector, lendArgs)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const alphaHomoraAdapter = fork.deployment.alphaHomoraV1Adapter;

    const outgoingWethAmount = utils.parseEther('1');
    const minIncomingIbethAmount = utils.parseEther('2');

    const lendArgs = alphaHomoraV1LendArgs({
      outgoingWethAmount,
      minIncomingIbethAmount,
    });

    const result = await alphaHomoraAdapter.parseAssetsForMethod(lendSelector, lendArgs);
    expect(result).toMatchFunctionOutput(alphaHomoraAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [fork.config.alphaHomoraV1.ibeth],
      spendAssets_: [fork.config.weth],
      spendAssetAmounts_: [outgoingWethAmount],
      minIncomingAssetAmounts_: [minIncomingIbethAmount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const alphaHomoraAdapter = fork.deployment.alphaHomoraV1Adapter;

    const outgoingIbethAmount = utils.parseEther('1');
    const minIncomingWethAmount = utils.parseEther('2');

    const redeemArgs = alphaHomoraV1RedeemArgs({
      outgoingIbethAmount,
      minIncomingWethAmount,
    });

    const result = await alphaHomoraAdapter.parseAssetsForMethod(redeemSelector, redeemArgs);
    expect(result).toMatchFunctionOutput(alphaHomoraAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [fork.config.weth],
      spendAssets_: [fork.config.alphaHomoraV1.ibeth],
      spendAssetAmounts_: [outgoingIbethAmount],
      minIncomingAssetAmounts_: [minIncomingWethAmount],
    });
  });
});
