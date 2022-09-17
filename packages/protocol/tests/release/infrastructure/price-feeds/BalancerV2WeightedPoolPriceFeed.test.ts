import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { BalancerV2WeightedPoolPriceFeed } from '@enzymefinance/protocol';
import {
  balancerV2GetPoolFromId,
  balancerV2WeightedPoolsUserDataTokenInForExactBptOut,
  ITestStandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  balancerV2ConstructRequest,
  balancerV2Lend,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import type { EventFragment } from '@ethersproject/abi';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const [fundOwner] = fork.accounts;
    const denominationAsset = new ITestStandardToken(fork.config.weth, provider);
    const investmentAmount = await getAssetUnit(denominationAsset);

    // weighted pool: [BAL, WETH]
    const poolId = fork.config.balancer.pools.bal80Weth20.id;
    // Use partial denomination asset balance to acquire BPT
    const spendAsset = denominationAsset; // WETH
    const spendAssetIndex = 1; // WETH
    const maxSpendAssetAmount = investmentAmount.div(2);
    // Must be small relative to maxSpendAssetAmount value
    const incomingBptAmount = 123;
    const userData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
      bptAmountOut: incomingBptAmount,
      tokenIndex: spendAssetIndex,
    });
    const request = await balancerV2ConstructRequest({
      provider,
      balancerVaultAddress: fork.config.balancer.vault,
      poolId,
      limits: [0, maxSpendAssetAmount], // [BAL, WETH]
      userData,
    });

    const { comptrollerProxy, vaultProxy } = await createNewFund({
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
      investmentAmount,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav()).gasUsed;

    await balancerV2Lend({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      balancerV2LiquidityAdapter: fork.deployment.balancerV2LiquidityAdapter,
      poolId,
      minIncomingBptAmount: 0,
      spendAssets: [spendAsset],
      spendAssetAmounts: [maxSpendAssetAmount],
      request,
    });

    // Get the calcGav() cost including the pool token
    const calcGavWithTokenGas = (await comptrollerProxy.calcGav()).gasUsed;

    // Assert gas
    expect(calcGavWithTokenGas.sub(calcGavBaseGas)).toMatchInlineGasSnapshot(`113697`);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const dai = new ITestStandardToken(fork.config.primitives.dai, provider);
    const balWeth = new ITestStandardToken(
      balancerV2GetPoolFromId(fork.config.balancer.pools.bal80Weth20.id),
      provider,
    );
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(balWeth, await getAssetUnit(balWeth), dai)
      .call();

    // B-80BAL-20WETH on August 8th, 2022 was worth about $16.46
    // Source: <https://app.zerion.io/explore/asset/B-80BAL-20WETH-0x5c6ee304399dbdb9c8ef030ab642b10820db8f56>
    expect(canonicalAssetValue).toEqBigNumber('16287555601410149496');
  });
});

describe('add/remove pool factory', () => {
  let balancerV2WeightedPoolPriceFeed: BalancerV2WeightedPoolPriceFeed;
  let poolFactoryAddedEvent: EventFragment;
  let poolFactoryRemovedEvent: EventFragment;

  beforeEach(async () => {
    balancerV2WeightedPoolPriceFeed = fork.deployment.balancerV2WeightedPoolPriceFeed;
    poolFactoryAddedEvent = balancerV2WeightedPoolPriceFeed.abi.getEvent('PoolFactoryAdded');
    poolFactoryRemovedEvent = balancerV2WeightedPoolPriceFeed.abi.getEvent('PoolFactoryRemoved');
  });

  it('can add/remove a factory', async () => {
    const balWeth = balancerV2GetPoolFromId(fork.config.balancer.pools.bal80Weth20.id);

    expect(await balancerV2WeightedPoolPriceFeed.isSupportedAsset(balWeth)).toBe(true);
    expect((await balancerV2WeightedPoolPriceFeed.getPoolFactories()).length).toBe(
      fork.config.balancer.poolFactories.length,
    );

    // remove the current factories first
    const removeReceipt = await balancerV2WeightedPoolPriceFeed.removePoolFactories(fork.config.balancer.poolFactories);
    const removeEvents = extractEvent(removeReceipt, poolFactoryRemovedEvent);
    expect(removeEvents.length).toBe(fork.config.balancer.poolFactories.length);

    for (const i in removeEvents) {
      expect(removeEvents[i].args).toMatchObject({
        poolFactory: fork.config.balancer.poolFactories[i],
      });
    }

    // should not be supported because factories were removed
    expect(await balancerV2WeightedPoolPriceFeed.isSupportedAsset(balWeth)).toBe(false);
    expect((await balancerV2WeightedPoolPriceFeed.getPoolFactories()).length).toBe(0);

    // add factories back
    const addReceipt = await balancerV2WeightedPoolPriceFeed.addPoolFactories(fork.config.balancer.poolFactories);
    const addEvents = extractEvent(addReceipt, poolFactoryAddedEvent);
    expect(addEvents.length).toBe(fork.config.balancer.poolFactories.length);

    for (const i in addEvents) {
      expect(addEvents[i].args).toMatchObject({
        poolFactory: fork.config.balancer.poolFactories[i],
      });
    }

    // should be supported again
    expect(await balancerV2WeightedPoolPriceFeed.isSupportedAsset(balWeth)).toBe(true);
    expect((await balancerV2WeightedPoolPriceFeed.getPoolFactories()).length).toBe(
      fork.config.balancer.poolFactories.length,
    );
  });

  it('wont add duplicate entries', async () => {
    const receipt = await balancerV2WeightedPoolPriceFeed.addPoolFactories(fork.config.balancer.poolFactories);
    expect(extractEvent(receipt, poolFactoryAddedEvent).length).toBe(0);
    expect((await balancerV2WeightedPoolPriceFeed.getPoolFactories()).length).toBe(
      fork.config.balancer.poolFactories.length,
    );
  });

  it('wont remove entries that are not there', async () => {
    const receipt = await balancerV2WeightedPoolPriceFeed.removePoolFactories([randomAddress()]);
    expect(extractEvent(receipt, poolFactoryRemovedEvent).length).toBe(0);
    expect((await balancerV2WeightedPoolPriceFeed.getPoolFactories()).length).toBe(
      fork.config.balancer.poolFactories.length,
    );
  });
});
