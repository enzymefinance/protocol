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
    const expectedCTokens = amount.div(1e10).div(2);

    expect(postTokenBalance).toEqBigNumber(preTokenBalance.sub(amount));
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
    //await cToken.approve(cToken, utils.parseEther('2'));
    await cToken.redeem(redeemAmount);

    const postTokenBalance = await token.balanceOf(deployer);
    const postCTokenBalance = await cToken.balanceOf(deployer);

    // Initial rate of 2(cToken/Token)
    const expectedTokens = redeemAmount.mul(1e10).mul(2);

    expect(postTokenBalance).toEqBigNumber(preTokenBalance.add(expectedTokens));
    expect(postCTokenBalance).toEqBigNumber(preCTokenBalance.sub(redeemAmount));
  });
});
