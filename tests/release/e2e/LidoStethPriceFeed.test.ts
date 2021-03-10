import { ForkDeployment, loadForkDeployment } from '@enzymefinance/testutils';

let fork: ForkDeployment;
beforeEach(async () => {
  fork = await loadForkDeployment();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const lidoStethPriceFeed = fork.deployment.LidoStethPriceFeed;

    expect(await lidoStethPriceFeed.getDerivative()).toMatchAddress(fork.config.lido.steth);
    expect(await lidoStethPriceFeed.getUnderlying()).toMatchAddress(fork.config.weth);
  });
});

// Since this contract implements SinglePeggedDerivativePriceFeedBase, no further tests are necessary
