import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import { defaultTestDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  return {
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const {
      deployment: {
        wdgldPriceFeed,
        tokens: { weth },
      },
      config: {
        chainlink: { xauUsdAggregator, ethUsdAggregator },
        derivatives: { wdgld },
      },
    } = await provider.snapshot(snapshot);

    const storedXauAggregator = await wdgldPriceFeed.getXauAggregator();
    const storedEthAggregator = await wdgldPriceFeed.getEthAggregator();
    const storedWdgld = await wdgldPriceFeed.getWdgld();
    const storedWeth = await wdgldPriceFeed.getWeth();

    expect(storedXauAggregator).toMatchAddress(xauUsdAggregator);
    expect(storedEthAggregator).toMatchAddress(ethUsdAggregator);
    expect(storedWdgld).toMatchAddress(wdgld);
    expect(storedWeth).toMatchAddress(weth);
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying WETH', async () => {
    const {
      deployment: {
        wdgldPriceFeed,
        tokens: { weth },
      },
      config: {
        derivatives: { wdgld: wdgldAddress },
      },
    } = await provider.snapshot(snapshot);
    const wdgldDecimals = 8;

    const xauToUsdRate = utils.parseEther('1');
    const ethToUsdRate = utils.parseEther('1');

    const wdgldToXauRate = await wdgldPriceFeed.calcWdgldToXauRate();

    const xauToWethRate = xauToUsdRate.mul(utils.parseUnits('1', 18)).div(ethToUsdRate);
    const rateToUnderlyings = await wdgldPriceFeed.calcUnderlyingValues
      .args(wdgldAddress, utils.parseUnits('1', wdgldDecimals))
      .call();

    const expectedAmount = wdgldToXauRate.mul(xauToWethRate).div(utils.parseUnits('1', 27));

    expect(rateToUnderlyings).toMatchFunctionOutput(wdgldPriceFeed.calcUnderlyingValues, {
      underlyings_: [weth],
      underlyingAmounts_: [expectedAmount],
    });
  });

  it('returns correct rate for ETH after ten years', async () => {
    const {
      deployment: { wdgldPriceFeed },
    } = await provider.snapshot(snapshot);
    const initialTimestamp = 1568700000;

    const tenYears = 315360000;

    await provider.send('evm_setNextBlockTimestamp', [initialTimestamp + tenYears]);
    await provider.send('evm_mine', []);

    const finalRate = await wdgldPriceFeed.calcWdgldToXauRate.call();

    // Should be around 0.0904382075 (0.99)^10 with 27 decimals
    expect(finalRate).toEqBigNumber(BigNumber.from('90438207500880449001000121'));
  });
});
