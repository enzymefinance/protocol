import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  MockToken,
  MockUniswapV2Pair,
  StandardToken,
} from '@melonproject/protocol';
import { defaultTestDeployment } from '@melonproject/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  return {
    deployment,
    config,
  };
}

describe('getRatesToUnderlyings', () => {
  it('returns rate for 18 decimals underlying assets', async () => {
    const {
      config: {
        derivatives: {
          uniswapV2: { mlnWeth: derivativeAsset },
        },
      },
      deployment: {
        uniswapV2PoolPriceFeed,
        tokens: { mln, weth },
      },
    } = await provider.snapshot(snapshot);

    const derivativeAssetContract = new StandardToken(
      await resolveAddress(derivativeAsset),
      provider,
    );
    const totalSupply = await derivativeAssetContract.totalSupply();
    const mlnAmount = utils.parseEther('1');
    const wethAmount = utils.parseEther('1');

    await mln.transfer(derivativeAsset, mlnAmount);
    await weth.transfer(derivativeAsset, wethAmount);

    const getRatesToUnderlyingsTx = await uniswapV2PoolPriceFeed.getRatesToUnderlyings
      .args(derivativeAsset)
      .call();

    const ratePricision = BigNumber.from(10).pow(18);
    expect(getRatesToUnderlyingsTx).toMatchObject({
      rates_: [
        mlnAmount.mul(ratePricision).div(totalSupply),
        wethAmount.mul(ratePricision).div(totalSupply),
      ],
      underlyings_: [mln.address, weth.address],
    });
  });

  it('returns rate for non-18 decimals underlying assets', async () => {
    const {
      config: { deployer },
      deployment: {
        uniswapV2PoolPriceFeed,
        tokens: { weth },
      },
    } = await provider.snapshot(snapshot);

    const mln = await MockToken.deploy(deployer, 'mln', 'MLN', 17);
    const derivativeAsset = await MockUniswapV2Pair.deploy(deployer, mln, weth);
    const derivativeAssetContract = new StandardToken(
      await resolveAddress(derivativeAsset),
      provider,
    );
    const totalSupply = await derivativeAssetContract.totalSupply();
    const mlnAmount = utils.parseEther('1');
    const wethAmount = utils.parseEther('1');

    await mln.transfer(derivativeAsset, mlnAmount);
    await weth.transfer(derivativeAsset, wethAmount);

    const getRatesToUnderlyingsTx = await uniswapV2PoolPriceFeed.getRatesToUnderlyings
      .args(derivativeAsset)
      .call();

    const pow17 = BigNumber.from(10).pow(17);
    const pow18 = BigNumber.from(10).pow(18);

    expect(getRatesToUnderlyingsTx).toMatchObject({
      rates_: [
        mlnAmount.mul(pow18).div(pow17).mul(pow18).div(totalSupply),
        wethAmount.mul(pow18).div(totalSupply),
      ],
      underlyings_: [mln.address, weth.address],
    });
  });
});
