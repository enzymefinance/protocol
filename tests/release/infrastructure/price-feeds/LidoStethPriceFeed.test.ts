import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const lidoStethPriceFeed = fork.deployment.lidoStethPriceFeed;

    expect(await lidoStethPriceFeed.getDerivative()).toMatchAddress(fork.config.lido.steth);
    expect(await lidoStethPriceFeed.getUnderlying()).toMatchAddress(fork.config.weth);
  });
});

// Since this contract implements SinglePeggedDerivativePriceFeedBase, no further tests are necessary
