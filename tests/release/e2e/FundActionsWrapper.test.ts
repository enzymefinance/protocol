import { encodeFunctionData, StandardToken, UniswapV2Router } from '@enzymefinance/protocol';
import { createNewFund, ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    const fundActionsWrapper = fork.deployment.fundActionsWrapper;

    expect(await fundActionsWrapper.getFeeManager()).toMatchAddress(fork.deployment.feeManager);
    expect(await fundActionsWrapper.getWethToken()).toMatchAddress(fork.config.weth);
  });
});

describe('exchangeAndBuyShares', () => {
  it('handles a WETH denominationAsset', async () => {
    const fundActionsWrapper = fork.deployment.fundActionsWrapper;
    const denominationAsset = new StandardToken(fork.config.weth, provider);
    const [fundOwner, buyer] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    const investmentEth = utils.parseEther('2');
    await fundActionsWrapper.exchangeAndBuyShares
      .args(
        comptrollerProxy,
        denominationAsset,
        buyer,
        1,
        constants.AddressZero,
        constants.AddressZero,
        constants.HashZero,
        0,
      )
      .value(investmentEth)
      .send();

    expect(await vaultProxy.balanceOf(buyer)).toEqBigNumber(investmentEth);

    // The weth allowance of the comptrollerProxy should now be cached
    expect(await fundActionsWrapper.accountHasMaxWethAllowance(comptrollerProxy)).toBe(true);
  });

  it('handles a mon-WETH, non-18 decimal denominationAsset', async () => {
    const fundActionsWrapper = fork.deployment.fundActionsWrapper;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner, buyer] = fork.accounts;

    const denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
    const denominationAssetUnit = utils.parseUnits('1', await denominationAsset.decimals());

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    // Seed fundActionsWrapper contract with WETH that will not be used in the tx,
    // to test refund
    const unusedWethSeedAmount = utils.parseEther('10');
    await weth.transfer(fundActionsWrapper, unusedWethSeedAmount);

    const investmentEth = utils.parseEther('2');
    const uniswapPath = [fork.config.weth, denominationAsset];

    const expectedDenominationAssetReceived = (await uniswapRouter.getAmountsOut(investmentEth, uniswapPath))[1];

    // Format data for a Uniswap exchange of WETH => denominationAsset
    const uniswapExchangeData = encodeFunctionData(uniswapRouter.swapExactTokensForTokens.fragment, [
      investmentEth,
      1,
      uniswapPath,
      fundActionsWrapper,
      BigNumber.from((await provider.getBlock('latest')).timestamp).add(300),
    ]);

    // Attempting to execute the exchange and buy shares with a too-high minInvestmentAmount should fail
    await expect(
      fundActionsWrapper.exchangeAndBuyShares
        .args(
          comptrollerProxy,
          denominationAsset,
          buyer,
          1,
          fork.config.uniswap.router,
          fork.config.uniswap.router,
          uniswapExchangeData,
          expectedDenominationAssetReceived.add(1),
        )
        .value(investmentEth)
        .send(),
    ).rejects.toBeRevertedWith('_minInvestmentAmount not met');

    // Execute the exchange and buy shares action with the exact expected investmentAmount
    const preTxBuyerEthBalance = await provider.getBalance(buyer.address);
    await fundActionsWrapper.exchangeAndBuyShares
      .args(
        comptrollerProxy,
        denominationAsset,
        buyer,
        1,
        fork.config.uniswap.router,
        fork.config.uniswap.router,
        uniswapExchangeData,
        expectedDenominationAssetReceived,
      )
      .value(investmentEth)
      .send();

    // Shares received should be the amount of denominationAsset received in the exchange, adjusted for 1e18 shares decimals
    const expectedSharesReceived = expectedDenominationAssetReceived
      .mul(utils.parseEther('1'))
      .div(denominationAssetUnit);
    expect(await vaultProxy.balanceOf(buyer)).toEqBigNumber(expectedSharesReceived);

    // The buyer should have received an eth refund
    expect(await provider.getBalance(buyer.address)).toBeGtBigNumber(preTxBuyerEthBalance.sub(investmentEth));

    // The weth allowance of the UniswapV2Router2 should now be cached
    expect(await fundActionsWrapper.accountHasMaxWethAllowance(uniswapRouter)).toBe(true);
  });
});
