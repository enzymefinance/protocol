import { EthereumTestnetProvider } from '@crestproject/crestproject';
// import {
//   calcGtr,
//   calcGtrConstant,
// } from '@melonproject/protocol/src/utils/price-feeds/wdgld';
import { defaultTestDeployment } from '@melonproject/testutils';
// import { utils } from 'ethers';

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

// describe('getRatesToUnderlyings', () => {
//   it('returns rate for underlying XAU', async () => {
//     const {
//       deployment: {
//         wdgldPriceFeed,
//         tokens: { weth },
//       },
//       config: {
//         derivatives: { wdgld },
//       },
//     } = await provider.snapshot(snapshot);

//     const xauToUsdRate = utils.parseEther('1');
//     const ethToUsdRate = utils.parseEther('1');

//     const currentTimestamp = (await provider.getBlock('latest')).timestamp;
//     const initialTimestamp = 1568700000;

//     const wdgldToXauRate = await calcGtr({ currentTimestamp, initialTimestamp });
//     const xauToWethRate = xauToUsdRate.mul(utils.parseUnits('1', 18)).div(ethToUsdRate);
//     const rateToUnderlyings = await wdgldPriceFeed.getRatesToUnderlyings.args(wdgld).call();

//     const expectedRates = wdgldToXauRate.mul(xauToWethRate).div(utils.parseUnits('1', 27));

//     expect(rateToUnderlyings).toMatchFunctionOutput(wdgldPriceFeed.getRatesToUnderlyings, {
//       rates_: [expectedRates],
//       underlyings_: [weth],
//     });
//   });
// });
