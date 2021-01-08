import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { randomizedTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await randomizedTestDeployment(provider);
  return { accounts, deployment, config };
}

describe('mint', () => {
  it('correctly lends tokens and receives cTokens in exchange', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { dai: token },
        compoundTokens: { cdai: cToken },
      },
    } = await provider.snapshot(snapshot);

    const preTokenBalance = await token.balanceOf(deployer);
    const preCTokenBalance = await cToken.balanceOf(deployer);
    const amount = utils.parseEther('2');

    await token.approve(cToken, amount);
    await cToken.mint(amount);

    const postTokenBalance = await token.balanceOf(deployer);
    const postCTokenBalance = await cToken.balanceOf(deployer);

    // Calculate expected tokens given: difference of 10 decimals, and an initial rate of 2(cToken/Token)
    const expectedCTokens = amount.div(2).mul(utils.parseUnits('1', 8)).div(utils.parseUnits('1', 18));

    expect(postTokenBalance).toEqBigNumber(preTokenBalance.sub(amount));
    expect(postCTokenBalance).toEqBigNumber(preCTokenBalance.add(expectedCTokens));
  });

  it('correctly lends tokens and receives cTokens in exchange (non 18 tokens)', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { usdc: token },
        compoundTokens: { cusdc: cToken },
      },
    } = await provider.snapshot(snapshot);

    const preTokenBalance = await token.balanceOf(deployer);
    const preCTokenBalance = await cToken.balanceOf(deployer);

    const amount = utils.parseUnits('2', 6);

    await token.approve(cToken, amount);
    await cToken.mint(amount);

    const postTokenBalance = await token.balanceOf(deployer);
    const postCTokenBalance = await cToken.balanceOf(deployer);

    const expectedCTokens = amount.div(2).mul(utils.parseUnits('1', 8)).div(utils.parseUnits('1', 6));
    expect(postTokenBalance).toEqBigNumber(preTokenBalance.sub(amount));
    expect(postCTokenBalance).toEqBigNumber(preCTokenBalance.add(expectedCTokens));
  });

  it('correctly lends eth and receives cEth in exchange', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { weth: token },
        compoundTokens: { ceth: cToken },
      },
    } = await provider.snapshot(snapshot);

    const preEthBalance = await provider.getBalance(deployer.address);
    const preCTokenBalance = await cToken.balanceOf(deployer);

    const amount = utils.parseUnits('200', 18);
    await token.approve(cToken, amount);
    await cToken.mint.value(amount).send();

    const postEthBalance = await provider.getBalance(deployer.address);
    const postCTokenBalance = await cToken.balanceOf(deployer);

    const expectedCTokens = amount.div(2).mul(utils.parseUnits('1', 8)).div(utils.parseUnits('1', 18));

    // Divides by 1e17 to ignore gas costs
    expect(postEthBalance.div(utils.parseUnits('1', 17))).toEqBigNumber(
      preEthBalance.sub(amount).div(utils.parseUnits('1', 17)),
    );
    expect(postCTokenBalance).toEqBigNumber(preCTokenBalance.add(expectedCTokens));
  });
});

describe('redeem', () => {
  it('correctly redeems cTokens and receives tokens in exchange', async () => {
    const {
      config: { deployer },
      deployment: {
        tokens: { dai: token },
        compoundTokens: { cdai: cToken },
      },
    } = await provider.snapshot(snapshot);

    // Start by minting some tokens
    const mintAmount = utils.parseEther('2');
    await token.approve(cToken, utils.parseEther('2'));
    await cToken.mint(mintAmount);

    // Get Balances and redeem received cTokens
    const preTokenBalance = await token.balanceOf(deployer);
    const preCTokenBalance = await cToken.balanceOf(deployer);

    const redeemAmount = preCTokenBalance;
    await cToken.redeem(redeemAmount);

    const postTokenBalance = await token.balanceOf(deployer);
    const postCTokenBalance = await cToken.balanceOf(deployer);

    const expectedTokens = redeemAmount.mul(2).mul(utils.parseUnits('1', 18)).div(utils.parseUnits('1', 8));
    expect(postTokenBalance).toEqBigNumber(preTokenBalance.add(expectedTokens));
    expect(postCTokenBalance).toEqBigNumber(preCTokenBalance.sub(redeemAmount));
  });

  it('correctly redeems cEth and receives weth in exchange', async () => {
    const {
      config: { deployer },
      deployment: {
        compoundTokens: { ceth: cToken },
      },
    } = await provider.snapshot(snapshot);

    // Start by minting some tokens
    const mintAmount = utils.parseEther('2');
    await cToken.mint.value(mintAmount).send();

    // Get Balances and redeem received cTokens
    const preEthBalance = await provider.getBalance(deployer.address);
    const preCTokenBalance = await cToken.balanceOf(deployer);

    const redeemAmount = preCTokenBalance;
    await cToken.redeem(redeemAmount);

    const postEthBalance = await provider.getBalance(deployer.address);
    const postCTokenBalance = await cToken.balanceOf(deployer);

    // Initial rate of 2(cToken/Token)
    const expectedEth = redeemAmount.mul(2).mul(utils.parseUnits('1', 18)).div(utils.parseUnits('1', 8));

    // Divides by 1e17 to ignore gas costs
    expect(postEthBalance.div(utils.parseUnits('1', 17))).toEqBigNumber(
      preEthBalance.add(expectedEth).div(utils.parseUnits('1', 17)),
    );
    expect(postCTokenBalance).toEqBigNumber(preCTokenBalance.sub(redeemAmount));
  });
});
