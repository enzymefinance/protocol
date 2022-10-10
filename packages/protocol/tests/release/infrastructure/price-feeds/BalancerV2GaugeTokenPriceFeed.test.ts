import type { AddressLike } from '@enzymefinance/ethers';
import type { BalancerV2GaugeTokenPriceFeed } from '@enzymefinance/protocol';
import { balancerV2GetPoolFromId } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture } from '@enzymefinance/testutils';

let fork: ProtocolDeployment;
let balancerV2GaugeTokenPriceFeed: BalancerV2GaugeTokenPriceFeed;
let bpt: AddressLike, gaugeToken: AddressLike;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  balancerV2GaugeTokenPriceFeed = fork.deployment.balancerV2GaugeTokenPriceFeed;

  bpt = balancerV2GetPoolFromId(fork.config.balancer.poolsStable.pools.steth.id);
  gaugeToken = fork.config.balancer.poolsStable.pools.steth.gauge;
});

describe('calcUnderlyingValues', () => {
  it('returns the correct rate', async () => {
    const amount = 123;

    expect(
      await balancerV2GaugeTokenPriceFeed.calcUnderlyingValues.args(gaugeToken, amount).call(),
    ).toMatchFunctionOutput(balancerV2GaugeTokenPriceFeed.calcUnderlyingValues, {
      underlyings_: [bpt],
      underlyingAmounts_: [amount],
    });
  });
});

describe('derivative gas costs', () => {
  it.todo('adds to calcGav for weth-denominated fund');
});
