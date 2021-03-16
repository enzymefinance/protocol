import { randomAddress } from '@enzymefinance/ethers';
import { IMakerDaoPot } from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const {
    deployment: { chaiPriceFeed },
    config: {
      chai: { chai, dai, pot },
    },
  } = await deployProtocolFixture();

  return {
    chai,
    dai,
    pot,
    chaiPriceFeed,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const { chai, dai, pot, chaiPriceFeed } = await provider.snapshot(snapshot);

    await expect(chaiPriceFeed.getChai()).resolves.toMatchAddress(chai);
    await expect(chaiPriceFeed.getDai()).resolves.toMatchAddress(dai);
    await expect(chaiPriceFeed.getDsrPot()).resolves.toMatchAddress(pot);
  });
});

describe('calcUnderlyingValues', () => {
  it('only supports chai', async () => {
    const { chai, chaiPriceFeed } = await provider.snapshot(snapshot);
    const derivative = randomAddress();

    await expect(chaiPriceFeed.calcUnderlyingValues(derivative, 1)).rejects.toBeRevertedWith('Only Chai is supported');
    await expect(chaiPriceFeed.calcUnderlyingValues(chai, 1)).resolves.toBeReceipt();
  });

  it('returns rate for underlying dai', async () => {
    const { dai, chai, pot, chaiPriceFeed } = await provider.snapshot(snapshot);

    await expect(chaiPriceFeed.calcUnderlyingValues(chai, 1)).resolves.toBeReceipt();

    const chaiPriceSource = new IMakerDaoPot(pot, provider);
    const chi = await chaiPriceSource.chi();
    await expect(
      chaiPriceFeed.calcUnderlyingValues.args(chai, utils.parseEther('1')).call(),
    ).resolves.toMatchFunctionOutput(chaiPriceFeed.calcUnderlyingValues, {
      underlyings_: [dai],
      underlyingAmounts_: [chi.div(10 ** 9)],
    });
  });
});
