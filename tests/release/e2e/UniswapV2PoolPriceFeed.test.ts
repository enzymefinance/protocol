import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IUniswapV2Pair } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('getRatesToUnderlyings', () => {
  it('returns the correct rate for two 18-decimal primitive tokens', async () => {
    const {
      config: {
        deployer,
        derivatives: {
          uniswapV2: { mlnWeth },
        },
      },
      deployment: { uniswapV2PoolPriceFeed, valueInterpreter },
    } = await provider.snapshot(snapshot);

    const pair = new IUniswapV2Pair(mlnWeth, deployer);
    const token0Address = await pair.token0();
    const token0RatioAmount = utils.parseEther('1');
    const token1Address = await pair.token1();

    const getRatesToUnderlyingsRes = await uniswapV2PoolPriceFeed.getRatesToUnderlyings.args(mlnWeth).call();
    expect(getRatesToUnderlyingsRes).toMatchFunctionOutput(uniswapV2PoolPriceFeed.getRatesToUnderlyings, {
      rates_: [expect.any(String), expect.any(String)],
      underlyings_: [token0Address, token1Address],
    });

    // Confirms arb has moved the price in the correct direction

    // Get the rate ratio of the Uniswap pool
    const getReservesRes = await pair.getReserves();
    const poolRateRatio = getReservesRes[0].mul(utils.parseEther('1')).div(getReservesRes[1]);

    // Get the trusted rate ratio based on trusted prices
    const calcCanonicalAssetValueRes = await valueInterpreter.calcCanonicalAssetValue
      .args(token0Address, token0RatioAmount, token1Address)
      .call();
    const trustedUnderlyingsRateRatio = token0RatioAmount
      .mul(utils.parseEther('1'))
      .div(calcCanonicalAssetValueRes.value_);

    // Get the final calculated canonical rate
    const canonicalUnderlyingsRateRatio = getRatesToUnderlyingsRes.rates_[0]
      .mul(utils.parseEther('1'))
      .div(getRatesToUnderlyingsRes.rates_[1]);

    // Final canonical rate should be pushed towards the trusted rate ratio
    if (poolRateRatio > trustedUnderlyingsRateRatio) {
      expect(canonicalUnderlyingsRateRatio).toBeLtBigNumber(poolRateRatio);
      expect(canonicalUnderlyingsRateRatio).toBeGtBigNumber(trustedUnderlyingsRateRatio);
    } else if (poolRateRatio < trustedUnderlyingsRateRatio) {
      expect(canonicalUnderlyingsRateRatio).toBeGtBigNumber(poolRateRatio);
      expect(canonicalUnderlyingsRateRatio).toBeLtBigNumber(trustedUnderlyingsRateRatio);
    } else {
      expect(canonicalUnderlyingsRateRatio).toEqBigNumber(poolRateRatio);
    }
  });

  it('returns the expected value from the valueInterpreter', async () => {
    const {
      config: {
        tokens: { usdc },
        derivatives: {
          uniswapV2: { usdcWeth },
        },
      },
      deployment: { valueInterpreter },
    } = await provider.snapshot(snapshot);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(usdcWeth, utils.parseUnits('1', 18), usdc)
      .call();

    // According to Zerion <https://app.zerion.io/> the cost per UNI-V2 USDC/WETH at 11-12-2020 was $53.8M
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: 53584578776468,
      isValid_: true,
    });
  });

  it.todo('returns the correct rate for a non-18 decimal primitive and a derivative');
  it.todo('[adjust the above tests to assert exact rate calcs]');
});
