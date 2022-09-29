import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { BalancerV2WeightedPoolPriceFeed } from '@enzymefinance/protocol';
import {
  balancerV2GetPoolFromId,
  balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut,
  balancerV2WeightedPoolsUserDataTokenInForExactBptOut,
  encodeFunctionData,
  ITestBalancerV2Vault,
  ITestStandardToken,
  Reenterer,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  balancerV2ConstructRequest,
  balancerV2Lend,
  buyShares,
  createNewFund,
  decodeRevertReason,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import type { EventFragment } from '@ethersproject/abi';
import { constants, utils } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('calcUnderlyingValues', () => {
  it('does not allow a Balancer pool to be reentered', async () => {
    const [buyer] = fork.accounts;
    const balancerV2WeightedPoolPriceFeed = fork.deployment.balancerV2WeightedPoolPriceFeed;

    const balancerVault = new ITestBalancerV2Vault(fork.config.balancer.vault, provider);
    const poolId = fork.config.balancer.pools.bal80Weth20.id;
    const bpt = new ITestStandardToken(balancerV2GetPoolFromId(poolId), provider);
    const balAddress = fork.config.primitives.bal;
    const ethAddress = constants.AddressZero;

    const reenterer = await Reenterer.deploy(fork.deployer);

    // Set payload for reenterer to call this price feed when ETH is received
    await reenterer.setReceiveReentrantPayload(
      balancerV2WeightedPoolPriceFeed,
      encodeFunctionData(balancerV2WeightedPoolPriceFeed.calcUnderlyingValues.fragment, [bpt, 1]),
      0,
    );

    // Join pool from an arbitrary account
    const maxEthToBuy = utils.parseEther('10');
    const joinUserData = balancerV2WeightedPoolsUserDataTokenInForExactBptOut({
      bptAmountOut: utils.parseEther('1'),
      tokenIndex: 1, // ETH
    });
    const joinRequest = {
      assets: [balAddress, ethAddress], // ETH instead of WETH
      limits: [0, maxEthToBuy],
      userData: joinUserData,
      useInternalBalance: false,
    };
    await balancerVault.connect(buyer).joinPool.args(poolId, buyer, buyer, joinRequest).value(maxEthToBuy).send();

    // Exit the pool, with ETH sent to the reentrant contract
    const bptToRedeem = await bpt.balanceOf(buyer);
    const exitUserData = balancerV2WeightedPoolsUserDataExactBptInForOneTokenOut({
      bptAmountIn: bptToRedeem,
      tokenIndex: 1, // ETH
    });
    const exitRequest = {
      assets: [balAddress, ethAddress], // ETH instead of WETH
      limits: [0, 1], // Require at least 1 wei received
      userData: exitUserData,
      useInternalBalance: false,
    };
    await balancerVault.connect(buyer).exitPool(poolId, buyer, reenterer, exitRequest);

    // The reentrant callback should have failed due to reentrancy
    // https://github.com/balancer-labs/balancer-v2-monorepo/blob/736d1d98a8dbf5400202ff5f09626619c9118910/pkg/interfaces/contracts/solidity-utils/helpers/BalancerErrors.sol#L199
    expect(decodeRevertReason(await reenterer.receiveReentrantReturnData())).toBe('BAL#400');
  });
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
    expect(calcGavWithTokenGas.sub(calcGavBaseGas)).toMatchInlineGasSnapshot(`122081`);
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
