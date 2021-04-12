import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';

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

    // DispatcherOwnerMixin
    expect(await assetFinalityResolver.getDispatcher()).toMatchAddress(fork.deployment.dispatcher);
  });
});

// TODO: can write these tests, though not urgent as it is indirectly tested in other integration tests, e.g., SynthFundWalkthrough
describe('finalizeAssets', () => {
  it.todo('settles synths and skips other assets');
});
