import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, IntegrationManager, ParaSwapV5Adapter, VaultLib } from '@enzymefinance/protocol';
import {
  ITestStandardToken,
  ONE_HUNDRED_PERCENT_IN_BPS,
  paraSwapV5TakeMultipleOrdersArgs,
  paraSwapV5TakeOrderArgs,
  SpendAssetsHandleType,
  takeMultipleOrdersSelector,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  paraSwapV5ConstructUniV2ForkPaths,
  paraSwapV5ConstructUniV2ForkPayload,
  paraSwapV5GenerateDummyPaths,
  paraSwapV5TakeMultipleOrders,
  paraSwapV5TakeOrder,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const sushiDaiWethPoolAddress = '0xc3d03e4f041fd4cd388c549ee2a29a9e5075882f';

let integrationManager: IntegrationManager, paraSwapV5Adapter: ParaSwapV5Adapter;
let fundOwner: SignerWithAddress;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  [fundOwner] = fork.accounts;
  paraSwapV5Adapter = fork.deployment.paraSwapV5Adapter;
  integrationManager = fork.deployment.integrationManager;

  const newFundRes = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const args = paraSwapV5TakeOrderArgs({
      expectedIncomingAssetAmount: 123,
      minIncomingAssetAmount: 1,
      outgoingAsset: randomAddress(),
      outgoingAssetAmount: 1,
      paths: paraSwapV5GenerateDummyPaths({ toTokens: [randomAddress()] }),
      uuid: utils.randomBytes(16),
    });

    await expect(
      paraSwapV5Adapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(
      paraSwapV5Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, args),
    ).resolves.toBeTruthy();
  });

  it('takeOrder: happy path', async () => {
    const incomingAsset = randomAddress();
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = randomAddress();
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = paraSwapV5TakeOrderArgs({
      expectedIncomingAssetAmount: 123,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      paths: paraSwapV5GenerateDummyPaths({ toTokens: [incomingAsset] }),
      uuid: utils.randomBytes(16),
    });

    const result = await paraSwapV5Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(paraSwapV5Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
      spendAssetAmounts_: [outgoingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('takeMultipleOrders: happy path (unique and non-unique assets)', async () => {
    const pool1Address = fork.config.uniswap.pools.daiWeth;
    const outgoingAsset1 = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset1 = new ITestStandardToken(fork.config.primitives.dai, provider);

    const pool2Address = fork.config.uniswap.pools.usdcUsdt;
    const outgoingAsset2 = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const incomingAsset2 = new ITestStandardToken(fork.config.primitives.usdt, provider);

    const outgoingAsset1Amount = await getAssetUnit(outgoingAsset1);
    const outgoingAsset2Amount = await getAssetUnit(outgoingAsset2);

    const uniV2Payload1 = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: pool1Address,
      incomingAsset: incomingAsset1,
    });
    const uniV2Payload2 = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: pool2Address,
      incomingAsset: incomingAsset2,
    });

    const paths1 = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset: incomingAsset1,
      payloads: [uniV2Payload1],
      percents: [ONE_HUNDRED_PERCENT_IN_BPS],
    });
    const paths2 = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset: incomingAsset2,
      payloads: [uniV2Payload2],
      percents: [ONE_HUNDRED_PERCENT_IN_BPS],
    });

    const ordersData = [
      { outgoingAsset: outgoingAsset1, outgoingAssetAmount: outgoingAsset1Amount, paths: paths1 },
      { outgoingAsset: outgoingAsset2, outgoingAssetAmount: outgoingAsset2Amount, paths: paths2 },
    ].map((order) =>
      paraSwapV5TakeOrderArgs({
        expectedIncomingAssetAmount: 1,
        minIncomingAssetAmount: 1,
        outgoingAsset: order.outgoingAsset,
        outgoingAssetAmount: order.outgoingAssetAmount,
        paths: order.paths,
        uuid: utils.randomBytes(16),
      }),
    );

    const takeMultipleOrderArgs = paraSwapV5TakeMultipleOrdersArgs({ ordersData, allowOrdersToFail: false });

    const result = await paraSwapV5Adapter.parseAssetsForAction(
      randomAddress(),
      takeMultipleOrdersSelector,
      takeMultipleOrderArgs,
    );

    expect(result).toMatchFunctionOutput(paraSwapV5Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset1, incomingAsset2],
      minIncomingAssetAmounts_: [0, 0], // We rely on validation in takeMultipleOrders() for this action
      spendAssetAmounts_: [outgoingAsset1Amount, outgoingAsset2Amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset1, outgoingAsset2],
    });
  });
});

describe('takeOrder', () => {
  it('happy path', async () => {
    const outgoingAsset = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset = new ITestStandardToken(fork.config.primitives.dai, provider);

    const outgoingAssetAmount = utils.parseEther('1');
    const minIncomingAssetAmount = '1';

    const uniV2Payload = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: fork.config.uniswap.pools.daiWeth,
      incomingAsset,
    });
    const sushiPayload = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: sushiDaiWethPoolAddress,
      incomingAsset,
    });

    const fiftyPercent = BigNumber.from(ONE_HUNDRED_PERCENT_IN_BPS).div(2);
    const paths = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset,
      payloads: [uniV2Payload, sushiPayload],
      percents: [fiftyPercent, fiftyPercent],
    });

    // Seed fund with more than what will be spent
    const initialOutgoingAssetBalance = outgoingAssetAmount.mul(2);
    await setAccountBalance({
      account: vaultProxy,
      amount: initialOutgoingAssetBalance,
      provider,
      token: outgoingAsset,
    });

    // TODO: can call multiSwap() first to get the expected amount

    // Trade on ParaSwap
    await paraSwapV5TakeOrder({
      comptrollerProxy,
      signer: fundOwner,
      integrationManager,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
      paraSwapV5Adapter,
      paths,
    });

    // Calculate the fund balances after the tx and assert the correct final token balances
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    expect(postTxOutgoingAssetBalance).toEqBigNumber(initialOutgoingAssetBalance.sub(outgoingAssetAmount));
    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
  });
});

describe('takeMultipleOrders', () => {
  // Uses the first payload twice to test non-unique assets
  it('happy path: unique and non-unique outgoing and incoming assets', async () => {
    const outgoingAsset1 = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset1 = new ITestStandardToken(fork.config.primitives.dai, provider);
    const outgoingAsset2 = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const incomingAsset2 = new ITestStandardToken(fork.config.primitives.usdt, provider);

    const outgoingAsset1Amount = await getAssetUnit(outgoingAsset1);
    const outgoingAsset2Amount = await getAssetUnit(outgoingAsset2);

    const uniV2Payload1 = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: fork.config.uniswap.pools.daiWeth,
      incomingAsset: incomingAsset1,
    });
    const uniV2Payload2 = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: fork.config.uniswap.pools.usdcUsdt,
      incomingAsset: incomingAsset2,
    });

    // Define the ParaSwap Paths
    const paths1 = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset: incomingAsset1,
      payloads: [uniV2Payload1],
      percents: [ONE_HUNDRED_PERCENT_IN_BPS],
    });
    const paths2 = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset: incomingAsset2,
      payloads: [uniV2Payload2],
      percents: [ONE_HUNDRED_PERCENT_IN_BPS],
    });

    // Seed fund with more than what will be spent
    const initialOutgoingAsset1Balance = outgoingAsset1Amount.mul(4);
    await setAccountBalance({
      account: vaultProxy,
      amount: initialOutgoingAsset1Balance,
      provider,
      token: outgoingAsset1,
    });
    const initialOutgoingAsset2Balance = outgoingAsset2Amount.mul(4);
    await setAccountBalance({
      account: vaultProxy,
      amount: initialOutgoingAsset2Balance,
      provider,
      token: outgoingAsset2,
    });

    // Trade on ParaSwap
    // Uses default values for all unnecessary order params
    await paraSwapV5TakeMultipleOrders({
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
      paraSwapV5Adapter,
      orders: [
        { outgoingAsset: outgoingAsset1, outgoingAssetAmount: outgoingAsset1Amount, paths: paths1 },
        { outgoingAsset: outgoingAsset2, outgoingAssetAmount: outgoingAsset2Amount, paths: paths2 },
        // Uses the first payload twice to test non-unique assets
        { outgoingAsset: outgoingAsset1, outgoingAssetAmount: outgoingAsset1Amount, paths: paths1 },
      ],
      allowOrdersToFail: false,
    });

    // Calculate the fund balances after the tx and assert the correct final token balances
    const [
      postTxIncomingAsset1Balance,
      postTxOutgoingAsset1Balance,
      postTxIncomingAsset2Balance,
      postTxOutgoingAsset2Balance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset1, outgoingAsset1, incomingAsset2, outgoingAsset2],
    });

    expect(postTxOutgoingAsset1Balance).toEqBigNumber(initialOutgoingAsset1Balance.sub(outgoingAsset1Amount.mul(2)));
    expect(postTxOutgoingAsset2Balance).toEqBigNumber(initialOutgoingAsset2Balance.sub(outgoingAsset2Amount));
    // TODO: better assertion here
    expect(postTxIncomingAsset1Balance).toBeGtBigNumber(0);
    expect(postTxIncomingAsset2Balance).toBeGtBigNumber(0);
  });

  it('happy path: one order passes, one order fails', async () => {
    const outgoingAsset1 = new ITestStandardToken(fork.config.weth, provider);
    const incomingAsset1 = new ITestStandardToken(fork.config.primitives.dai, provider);
    const outgoingAsset2 = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const incomingAsset2 = new ITestStandardToken(fork.config.primitives.usdt, provider);

    const outgoingAsset1Amount = await getAssetUnit(outgoingAsset1);
    const outgoingAsset2Amount = await getAssetUnit(outgoingAsset2);

    const uniV2Payload1 = await paraSwapV5ConstructUniV2ForkPayload({
      provider,
      pool: fork.config.uniswap.pools.daiWeth,
      incomingAsset: incomingAsset1,
    });
    const uniV2Payload2 = '0x';

    // Define the ParaSwap Paths
    const paths1 = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset: incomingAsset1,
      payloads: [uniV2Payload1],
      percents: [ONE_HUNDRED_PERCENT_IN_BPS],
    });
    const paths2 = paraSwapV5ConstructUniV2ForkPaths({
      incomingAsset: incomingAsset2,
      payloads: [uniV2Payload2],
      percents: [ONE_HUNDRED_PERCENT_IN_BPS],
    });

    // Seed fund with more than what will be spent
    const initialOutgoingAsset1Balance = outgoingAsset1Amount.mul(4);
    await setAccountBalance({
      account: vaultProxy,
      amount: initialOutgoingAsset1Balance,
      provider,
      token: outgoingAsset1,
    });
    const initialOutgoingAsset2Balance = outgoingAsset2Amount.mul(4);
    await setAccountBalance({
      account: vaultProxy,
      amount: initialOutgoingAsset2Balance,
      provider,
      token: outgoingAsset2,
    });

    const paraSwapV5TakeMultipleOrdersArgs = {
      comptrollerProxy,
      integrationManager,
      signer: fundOwner,
      paraSwapV5Adapter,
      orders: [
        { outgoingAsset: outgoingAsset1, outgoingAssetAmount: outgoingAsset1Amount, paths: paths1 },
        { outgoingAsset: outgoingAsset2, outgoingAssetAmount: outgoingAsset2Amount, paths: paths2 },
      ],
    };

    // Trade on ParaSwap
    // Should fail if allowOrdersToFail is false
    await expect(
      paraSwapV5TakeMultipleOrders({ ...paraSwapV5TakeMultipleOrdersArgs, allowOrdersToFail: false }),
    ).rejects.toBeRevertedWith('Call to adapter failed');

    // Should succeed if allowOrdersToFail is true
    const receipt = await paraSwapV5TakeMultipleOrders({
      ...paraSwapV5TakeMultipleOrdersArgs,
      allowOrdersToFail: true,
    });

    assertEvent(receipt, paraSwapV5Adapter.abi.getEvent('MultipleOrdersItemFailed'), {
      index: 1,
      reason: 'Call to adapter failed',
    });

    // Calculate the fund balances after the tx and assert the correct final token balances
    const [
      postTxIncomingAsset1Balance,
      postTxOutgoingAsset1Balance,
      postTxIncomingAsset2Balance,
      postTxOutgoingAsset2Balance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset1, outgoingAsset1, incomingAsset2, outgoingAsset2],
    });

    expect(postTxOutgoingAsset1Balance).toEqBigNumber(initialOutgoingAsset1Balance.sub(outgoingAsset1Amount));

    // Assets from tx 2 should not have changed since tx failed
    expect(postTxOutgoingAsset2Balance).toEqBigNumber(initialOutgoingAsset2Balance);
    expect(postTxIncomingAsset2Balance).toEqBigNumber(0);

    // TODO: better assertion here
    expect(postTxIncomingAsset1Balance).toBeGtBigNumber(0);
  });
});
