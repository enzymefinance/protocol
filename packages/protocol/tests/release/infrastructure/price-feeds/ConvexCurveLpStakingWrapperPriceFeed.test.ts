import type { AddressLike } from '@enzymefinance/ethers';
import type { ConvexCurveLpStakingWrapperFactory, ConvexCurveLpStakingWrapperPriceFeed } from '@enzymefinance/protocol';
import { ConvexCurveLpStakingWrapperLib } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture } from '@enzymefinance/testutils';

const pid = 25; // steth

let fork: ProtocolDeployment;
let convexCurveLpStakingWrapperPriceFeed: ConvexCurveLpStakingWrapperPriceFeed;
let factory: ConvexCurveLpStakingWrapperFactory;
let curveLpTokenAddress: AddressLike, validWrapper: ConvexCurveLpStakingWrapperLib;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  convexCurveLpStakingWrapperPriceFeed = fork.deployment.convexCurveLpStakingWrapperPriceFeed;

  factory = fork.deployment.convexCurveLpStakingWrapperFactory;
  await factory.deploy(pid);

  validWrapper = new ConvexCurveLpStakingWrapperLib(await factory.getWrapperForConvexPool(pid), provider); // steth wrapper
  curveLpTokenAddress = fork.config.curve.pools.steth.lpToken;
});

describe('calcUnderlyingValues', () => {
  it('returns the correct rate for underlying token', async () => {
    const amount = 123;
    const feedRate = await convexCurveLpStakingWrapperPriceFeed.calcUnderlyingValues.args(validWrapper, amount).call();

    // Should be same amount of the lpToken
    expect(feedRate.underlyings_[0]).toMatchAddress(curveLpTokenAddress);
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(amount);
  });
});

describe('isSupportedAsset', () => {
  it('reverts for a non-factory-deployed wrapper', async () => {
    // Ignore that this is not a proxy, it's fine for this purpose
    const [randomUser] = fork.accounts;
    const invalidWrapper = await ConvexCurveLpStakingWrapperLib.deploy(
      randomUser,
      randomUser,
      fork.config.convex.booster,
      fork.config.convex.crvToken,
      fork.config.convex.cvxToken,
    );

    await invalidWrapper.init(pid);

    // The invalid wrapper should have the same lp token as the valid one
    expect(await invalidWrapper.getCurveLpToken()).toMatchAddress(await validWrapper.getCurveLpToken());

    expect(await convexCurveLpStakingWrapperPriceFeed.isSupportedAsset(invalidWrapper)).toBe(false);
  });

  it('happy path', async () => {
    expect(await convexCurveLpStakingWrapperPriceFeed.isSupportedAsset(validWrapper)).toBe(true);
  });
});

describe('derivative gas costs', () => {
  it.todo('adds to calcGav for weth-denominated fund');
});
