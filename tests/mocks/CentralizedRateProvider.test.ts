import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { randomizedTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await randomizedTestDeployment(provider);
  return { accounts, deployment, config };
}

describe('calcLiveAssetValueRandomized', () => {
  it('correctly calculates a randomized asset value on sender', async () => {
    const {
      accounts: [accountZero, accountOne],
      deployment: {
        centralizedRateProvider,
        tokens: { dai, mln },
      },
    } = await provider.snapshot(snapshot);
    const liveAssetValueAccountZero = await centralizedRateProvider
      .connect(accountZero)
      .calcLiveAssetValueRandomized.args(mln, utils.parseEther('1'), dai, 0)
      .call();

    const liveAssetValueAccountOne = await centralizedRateProvider
      .connect(accountOne)
      .calcLiveAssetValueRandomized.args(mln, utils.parseEther('1'), dai, 0)
      .call();

    // Min max values given a sender slippage of 5%
    const minimumExpectedValue = utils.parseEther('0.95');
    const maximumExpectedValue = utils.parseEther('1.05');

    // Randomized function has low entropy, there could be a collision here
    expect(liveAssetValueAccountZero).not.toEqBigNumber(liveAssetValueAccountOne);

    // Check both accounts return a value inside bonds
    expect(liveAssetValueAccountZero).toBeGteBigNumber(minimumExpectedValue);
    expect(liveAssetValueAccountZero).toBeLteBigNumber(maximumExpectedValue);
    expect(liveAssetValueAccountOne).toBeGteBigNumber(minimumExpectedValue);
    expect(liveAssetValueAccountOne).toBeLteBigNumber(maximumExpectedValue);
  });

  it('correctly calculates a randomized asset value on time', async () => {
    const {
      accounts: [account],
      deployment: {
        centralizedRateProvider,
        tokens: { dai, mln },
      },
    } = await provider.snapshot(snapshot);

    const liveAssetValueBlockOne = await centralizedRateProvider
      .connect(account)
      .calcLiveAssetValueRandomized.args(mln, utils.parseEther('1'), dai, 5)
      .call();

    await provider.send('evm_mine', []);

    const liveAssetValueBlockTwo = await centralizedRateProvider
      .connect(account)
      .calcLiveAssetValueRandomized.args(mln, utils.parseEther('1'), dai, 5)
      .call();

    // Min max values given a sender slippage of 10% (5% + 5% combined)
    const minimumExpectedValue = utils.parseEther('0.90');
    const maximumExpectedValue = utils.parseEther('1.10');

    // Randomized function has low entropy, there could be a collision here
    expect(liveAssetValueBlockOne).not.toEqBigNumber(liveAssetValueBlockTwo);

    // Check both accounts return a value inside bonds
    expect(liveAssetValueBlockOne).toBeGteBigNumber(minimumExpectedValue);
    expect(liveAssetValueBlockOne).toBeLteBigNumber(maximumExpectedValue);
    expect(liveAssetValueBlockTwo).toBeGteBigNumber(minimumExpectedValue);
    expect(liveAssetValueBlockTwo).toBeLteBigNumber(maximumExpectedValue);
  });
});
