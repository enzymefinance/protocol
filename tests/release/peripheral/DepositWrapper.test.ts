import { randomAddress } from '@enzymefinance/ethers';
import { encodeFunctionData, StandardToken, UniswapV2Router } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const randomAddress1 = randomAddress();

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    const depositWrapper = fork.deployment.depositWrapper;

    expect(await depositWrapper.getWethToken()).toMatchAddress(fork.config.weth);
  });
});

describe('exchangeEthAndBuyShares', () => {
  it('does not allow arbitrary call to buySharesOnBehalf', async () => {
    const depositWrapper = fork.deployment.depositWrapper;
    const denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
    const [fundOwner, buyer] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const buySharesOnBehalfData = encodeFunctionData(comptrollerProxy.buySharesOnBehalf.fragment, [
      randomAddress1,
      1,
      1,
    ]);

    await expect(
      depositWrapper
        .connect(buyer)
        .exchangeEthAndBuyShares.args(
          comptrollerProxy,
          1,
          comptrollerProxy.address, // buySharesOnBehalf contract
          constants.AddressZero,
          buySharesOnBehalfData,
          0,
        )
        .value(utils.parseEther('1'))
        .gas(1000000)
        .send(),
    ).rejects.toBeRevertedWith('Disallowed selector');
  });

  it('handles a WETH denominationAsset', async () => {
    const depositWrapper = fork.deployment.depositWrapper;
    const denominationAsset = new StandardToken(fork.config.weth, provider);
    const [fundOwner, buyer] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      // Use a shares action timelock to assure DepositWrapper has correct permissions
      sharesActionTimelock: 1000,
      signer: fundOwner,
    });

    const investmentEth = utils.parseEther('2');

    await depositWrapper
      .connect(buyer)
      .exchangeEthAndBuyShares.args(
        comptrollerProxy,
        1,
        constants.AddressZero,
        constants.AddressZero,
        constants.HashZero,
        0,
      )
      .value(investmentEth)
      .send();

    expect(await vaultProxy.balanceOf(buyer)).toEqBigNumber(investmentEth);
  });

  it('handles a mon-WETH, non-18 decimal denominationAsset', async () => {
    const depositWrapper = fork.deployment.depositWrapper;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner, buyer] = fork.accounts;

    const denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
    const denominationAssetUnit = utils.parseUnits('1', await denominationAsset.decimals());

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      // Use a shares action timelock to assure DepositWrapper has correct permissions
      sharesActionTimelock: 1000,
      signer: fundOwner,
    });

    // Seed depositWrapper contract with WETH that will not be used in the tx,
    // to test refund
    const unusedWethSeedAmount = utils.parseEther('10');

    await weth.transfer(depositWrapper, unusedWethSeedAmount);

    const investmentEth = utils.parseEther('2');
    const uniswapPath = [fork.config.weth, denominationAsset];

    const expectedDenominationAssetReceived = (await uniswapRouter.getAmountsOut(investmentEth, uniswapPath))[1];

    // Format data for a Uniswap exchange of WETH => denominationAsset
    const uniswapExchangeData = encodeFunctionData(uniswapRouter.swapExactTokensForTokens.fragment, [
      investmentEth,
      1,
      uniswapPath,
      depositWrapper,
      BigNumber.from((await provider.getBlock('latest')).timestamp).add(300),
    ]);

    // Attempting to execute the exchange and buy shares with a too-high minInvestmentAmount should fail
    await expect(
      depositWrapper
        .connect(buyer)
        .exchangeEthAndBuyShares.args(
          comptrollerProxy,
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

    await depositWrapper
      .connect(buyer)
      .exchangeEthAndBuyShares.args(
        comptrollerProxy,
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
  });
});
