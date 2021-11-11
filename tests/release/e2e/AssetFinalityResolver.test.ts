import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    const assetFinalityResolver = fork.deployment.assetFinalityResolver;

    expect(await assetFinalityResolver.getSynthetixAddressResolver()).toMatchAddress(
      fork.config.synthetix.addressResolver,
    );
    expect(await assetFinalityResolver.getSynthetixPriceFeed()).toMatchAddress(fork.deployment.synthetixPriceFeed);

    // FundDeployerOwnerMixin
    expect(await assetFinalityResolver.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

// TODO: can write these tests, though not urgent as it is indirectly tested in other integration tests, e.g., SynthFundWalkthrough
describe('finalizeAssets', () => {
  it.todo('settles synths and skips other assets');
});
