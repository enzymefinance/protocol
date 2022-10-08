import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent, randomAddress, resolveAddress } from '@enzymefinance/ethers';
import type { BalancerV2StablePoolPriceFeed } from '@enzymefinance/protocol';
import { balancerV2GetPoolFromId, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  assertNoEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import { ethers } from 'ethers';

const randomAddress1 = randomAddress();
let fork: ProtocolDeployment;
let balancerV2StablePoolPriceFeed: BalancerV2StablePoolPriceFeed;
let staBAL3: ITestStandardToken, steth: ITestStandardToken;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  balancerV2StablePoolPriceFeed = fork.deployment.balancerV2StablePoolPriceFeed;

  staBAL3 = new ITestStandardToken(
    balancerV2GetPoolFromId(fork.config.balancer.poolsStable.pools.staBAL3.id),
    provider,
  );
  steth = new ITestStandardToken(balancerV2GetPoolFromId(fork.config.balancer.poolsStable.pools.steth.id), provider);
});

describe('calcUnderlyingValues', () => {
  // This is already tested in the weighted pool price feed, but we could reproduce a simple version here
  it.todo('does not allow a Balancer pool to be reentered');
});

describe('derivative gas costs', () => {
  // Pools containing the native asset will be slightly more expensive (< 10k gas units) due to reentrancy protection
  it('non-native asset pool: adds to calcGav for weth-denominated fund', async () => {
    // Balancer usdc stable pool
    const bpt = balancerV2GetPoolFromId(fork.config.balancer.poolsStable.pools.staBAL3.id);

    const [fundOwner] = fork.accounts;
    const denominationAsset = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const { comptrollerProxy } = await createNewFund({
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Buy shares to add denomination asset
    await buyShares({
      provider,
      buyer: fundOwner,
      comptrollerProxy,
      denominationAsset,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Add the derivative asset
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      assets: [bpt],
      provider,
    });

    // Get the calcGav() cost including the pool token
    const calcGavWithTokenGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Assert gas
    expect(calcGavWithTokenGas.sub(calcGavBaseGas)).toMatchInlineGasSnapshot(`69238`);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const dai = new ITestStandardToken(fork.config.primitives.dai, provider);

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(staBAL3, await getAssetUnit(staBAL3), dai)
      .call();

    // Balancer staBAL3 Stable Pool price on Sept 29th, 2022 was worth about $1.01
    // Source: <https://app.zerion.io/explore/asset/staBAL3-0x06df3b2bbb68adc8b0e302443692037ed9f91b42>
    expect(canonicalAssetValue).toEqBigNumber('1005585823512264396');
  });
});

// A token is supported only if it is stored in the poolToPoolInfo mapping
describe('isSupportedAsset', () => {
  it('unhappy path', async () => {
    expect(await balancerV2StablePoolPriceFeed.isSupportedAsset(randomAddress1)).toBe(false);
  });

  it('happy path', async () => {
    expect(await balancerV2StablePoolPriceFeed.isSupportedAsset(staBAL3)).toBe(true);
  });
});

describe('pool factory registry', () => {
  let factories: AddressLike[];

  beforeEach(() => {
    factories = fork.config.balancer.poolsStable.poolFactories;
  });

  describe('addPoolFactories', () => {
    it('does not add duplicate entries', async () => {
      const receipt = await balancerV2StablePoolPriceFeed.addPoolFactories(
        fork.config.balancer.poolsStable.poolFactories,
      );

      assertNoEvent(receipt, 'PoolFactoryAdded');

      expect((await balancerV2StablePoolPriceFeed.getPoolFactories()).length).toBe(
        fork.config.balancer.poolsStable.poolFactories.length,
      );
    });

    it('happy path', async () => {
      await balancerV2StablePoolPriceFeed.removePoolFactories(factories);

      // Assert storage is now empty
      expect((await balancerV2StablePoolPriceFeed.getPoolFactories()).length).toBe(0);

      // Add factories back
      const receipt = await balancerV2StablePoolPriceFeed.addPoolFactories(factories);

      // Assert storage is populated
      const finalFactoriesList = await balancerV2StablePoolPriceFeed.getPoolFactories();
      expect(finalFactoriesList.length).toBe(factories.length);

      for (const factory of factories) {
        expect(finalFactoriesList).toContain(resolveAddress(factory));
      }

      // Assert events
      const addEvents = extractEvent(receipt, 'PoolFactoryAdded');
      expect(addEvents.length).toBe(factories.length);

      for (const i in addEvents) {
        expect(addEvents[i].args).toMatchObject({
          poolFactory: factories[i],
        });
      }
    });
  });

  describe('removePoolFactories', () => {
    it('remove: does not emit an event for a non-existent item', async () => {
      const receipt = await balancerV2StablePoolPriceFeed.removePoolFactories([randomAddress1]);

      assertNoEvent(receipt, 'PoolFactoryRemoved');
    });

    it('can add/remove factories', async () => {
      expect((await balancerV2StablePoolPriceFeed.getPoolFactories()).length).toBe(factories.length);

      const removeReceipt = await balancerV2StablePoolPriceFeed.removePoolFactories(factories);

      // Assert storage is now empty
      expect((await balancerV2StablePoolPriceFeed.getPoolFactories()).length).toBe(0);

      // Assert events
      const removeEvents = extractEvent(removeReceipt, 'PoolFactoryRemoved');
      expect(removeEvents.length).toBe(factories.length);

      for (const i in removeEvents) {
        expect(removeEvents[i].args).toMatchObject({
          poolFactory: factories[i],
        });
      }
    });
  });
});

describe('pool registry', () => {
  describe('addPools', () => {
    it('does not allow unequal arrays', async () => {
      await expect(balancerV2StablePoolPriceFeed.addPools([randomAddress1], [])).rejects.toBeRevertedWith(
        'Unequal arrays',
      );
    });

    it('does not allow an already-registered pools', async () => {
      await expect(
        balancerV2StablePoolPriceFeed.addPools(
          [steth],
          [fork.config.balancer.poolsStable.pools.steth.invariantProxyAsset],
        ),
      ).rejects.toBeRevertedWith('Already registered');
    });

    it('does not allow a pool that is not from a supported factory', async () => {
      await expect(balancerV2StablePoolPriceFeed.addPools([randomAddress1], [randomAddress1])).rejects.toBeRevertedWith(
        'Invalid factory',
      );
    });

    it('happy path: pool without native asset', async () => {
      const bpt = staBAL3;
      const invariantProxyAsset = new ITestStandardToken(
        fork.config.balancer.poolsStable.pools.staBAL3.invariantProxyAsset,
        provider,
      );

      // Remove the pool first
      await balancerV2StablePoolPriceFeed.removePools([bpt]);

      // Re-add the pool
      const receipt = await balancerV2StablePoolPriceFeed.addPools([bpt], [invariantProxyAsset]);

      // Assert storage
      expect(await balancerV2StablePoolPriceFeed.getPoolInfo(bpt)).toMatchObject({
        invariantProxyAsset: invariantProxyAsset.address,
        invariantProxyAssetDecimals: await invariantProxyAsset.decimals(),
        containsNativeAsset: false,
      });

      // Assert events
      const addEvents = extractEvent(receipt, 'PoolAdded');

      expect(addEvents.length).toBe(1);

      expect(addEvents[0].args).toMatchObject({
        pool: bpt.address,
        invariantProxyAsset: invariantProxyAsset.address,
      });
    });

    it('happy path: pool with native asset', async () => {
      // Just verify that the registered `steth` pool has `containsNativeAsset = true`
      expect((await balancerV2StablePoolPriceFeed.getPoolInfo(steth)).containsNativeAsset).toBe(true);
    });
  });

  describe('removePools', () => {
    it('happy path', async () => {
      const bpt = staBAL3;

      expect(await balancerV2StablePoolPriceFeed.isSupportedAsset(bpt)).toBe(true);

      const receipt = await balancerV2StablePoolPriceFeed.removePools([bpt]);

      // Storage should be removed
      expect(await balancerV2StablePoolPriceFeed.getPoolInfo(bpt)).toMatchObject({
        invariantProxyAsset: ethers.constants.AddressZero,
        invariantProxyAssetDecimals: 0,
        containsNativeAsset: false,
      });

      // Asset events
      const removeEvents = extractEvent(receipt, 'PoolRemoved');
      expect(removeEvents.length).toBe(1);

      expect(removeEvents[0].args).toMatchObject({
        pool: bpt.address,
      });
    });
  });
});
