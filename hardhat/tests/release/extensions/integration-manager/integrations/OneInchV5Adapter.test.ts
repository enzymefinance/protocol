import { randomAddress } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  IntegrationManager,
  OneInchV5Adapter,
  OneInchV5TakeOrderArgs,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  decodeOneInchSwapArgs,
  ITestStandardToken,
  oneInchV5TakeMultipleOrdersArgs,
  oneInchV5TakeOrderArgs,
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
  oneInchV5TakeMultipleOrders,
  oneInchV5TakeOrder,
  setAccountBalance,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';

let fundOwner: SignerWithAddress;
let fork: ProtocolDeployment;
let outgoingAssetAmount: BigNumber, outgoingAsset2Amount: BigNumber, incomingAssetAmount: BigNumber;
let outgoingAsset: ITestStandardToken, outgoingAsset2: ITestStandardToken, incomingAsset: ITestStandardToken;

let integrationManager: IntegrationManager;
let oneInchV5Adapter: OneInchV5Adapter;

let comptrollerProxy: ComptrollerLib;
let vaultProxy: VaultLib;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;
  incomingAsset = new ITestStandardToken(fork.config.primitives.usdt, provider);
  outgoingAsset = new ITestStandardToken(fork.config.primitives.dai, provider);
  outgoingAsset2 = new ITestStandardToken(fork.config.primitives.usdc, provider);
  // Since we are swapping stablecoins, we should expect the incoming amount to roughly equal outgoing amount
  outgoingAssetAmount = (await getAssetUnit(outgoingAsset)).mul(5);
  outgoingAsset2Amount = (await getAssetUnit(outgoingAsset2)).mul(5);
  incomingAssetAmount = (await getAssetUnit(incomingAsset)).mul(5);

  integrationManager = fork.deployment.integrationManager;

  oneInchV5Adapter = fork.deployment.oneInchV5Adapter;

  const fund = await createNewFund({
    denominationAsset: outgoingAsset,
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = fund.comptrollerProxy;
  vaultProxy = fund.vaultProxy;

  // Seed vault
  await setAccountBalance({
    provider,
    account: vaultProxy,
    amount: outgoingAssetAmount.mul(3),
    token: outgoingAsset,
  });
  await setAccountBalance({
    provider,
    account: vaultProxy,
    amount: outgoingAsset2Amount.mul(3),
    token: outgoingAsset2,
  });
});

describe('parseAssetsForAction', () => {
  it('rejects non vaultProxy dstReceiver', async () => {
    const takeOrderArgs = oneInchV5TakeOrderArgs({
      data: '0x',
      executor: randomAddress(),
      orderDescription: {
        amount: outgoingAssetAmount,
        minReturnAmount: incomingAssetAmount,
        dstReceiver: randomAddress(),
        dstToken: incomingAsset,
        flags: 0,
        srcReceiver: randomAddress(),
        srcToken: outgoingAsset,
      },
    });

    expect(
      oneInchV5Adapter.parseAssetsForAction(vaultProxy, takeOrderSelector, takeOrderArgs),
    ).rejects.toBeRevertedWith('parseAssetsForAction: invalid dstReceiver');
  });

  it('generates expected output - takeOrder', async () => {
    const takeOrderArgs = oneInchV5TakeOrderArgs({
      data: '0x',
      executor: randomAddress(),
      orderDescription: {
        amount: outgoingAssetAmount,
        minReturnAmount: incomingAssetAmount,
        dstReceiver: vaultProxy,
        dstToken: incomingAsset,
        flags: 0,
        srcReceiver: randomAddress(),
        srcToken: outgoingAsset,
      },
    });

    const result = await oneInchV5Adapter.parseAssetsForAction(vaultProxy, takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(oneInchV5Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [incomingAssetAmount],
      spendAssetAmounts_: [outgoingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output - takeMultipleOrders', async () => {
    const takeMultipleOrderArgs = oneInchV5TakeMultipleOrdersArgs({
      allowOrdersToFail: true,
      ordersData: [
        { asset: outgoingAsset, amount: outgoingAssetAmount },
        { asset: outgoingAsset2, amount: outgoingAsset2Amount },
      ].map(({ asset, amount }) =>
        oneInchV5TakeOrderArgs({
          data: '0x',
          executor: randomAddress(),
          orderDescription: {
            amount,
            minReturnAmount: incomingAssetAmount,
            dstReceiver: vaultProxy,
            dstToken: incomingAsset,
            flags: 0,
            srcReceiver: randomAddress(),
            srcToken: asset,
          },
        }),
      ),
    });

    const result = await oneInchV5Adapter.parseAssetsForAction(
      vaultProxy,
      takeMultipleOrdersSelector,
      takeMultipleOrderArgs,
    );

    expect(result).toMatchFunctionOutput(oneInchV5Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [0],
      spendAssetAmounts_: [outgoingAssetAmount, outgoingAsset2Amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset, outgoingAsset2],
    });
  });
});

describe('takeOrder', () => {
  it('works as expected', async () => {
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Encoded SwapData from 1inch's API (https://api.1inch.io/v5.0/1/swap), replacing the srcReceiver with the adapter address
    const encodedSwapData = `0x12aa3caf0000000000000000000000001136b25047e142fa3018184793aec68fbb173ce40000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000b20bd5d04be54f870d5c0d3ca85d82b34b836405000000000000000000000000${oneInchV5Adapter.address.slice(
      2,
    )}0000000000000000000000000000000000000000000000004563918244f40000000000000000000000000000000000000000000000000000000000000025fc2c0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf786b175474e89094c44da98b954eedeac495271d0f00206ae40711b8002dc6c0b20bd5d04be54f870d5c0d3ca85d82b34b8364051111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000000000016b175474e89094c44da98b954eedeac495271d0f00cfee7c08`;

    const {
      data,
      executor,
      orderDescription: { flags, minReturnAmount, srcReceiver },
    } = decodeOneInchSwapArgs(encodedSwapData);

    // Generate mock data
    await oneInchV5TakeOrder({
      comptrollerProxy,
      data,
      executor,
      flags,
      incomingAsset,
      integrationManager,
      minIncomingAssetAmount: minReturnAmount,
      outgoingAsset,
      srcReceiver,
      outgoingAssetAmount,
      oneInchV5Adapter,
      signer: fundOwner,
      vaultProxy,
    });
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetBalanceDelta = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    const outgoingAssetBalanceDelta = preTxOutgoingAssetBalance.sub(postTxOutgoingAssetBalance);

    // Since we are swapping stablecoins, we should expect the incoming amount to roughly equal outgoing amount
    expect(incomingAssetBalanceDelta).toBeAroundBigNumber(incomingAssetAmount, 0.01);
    expect(outgoingAssetBalanceDelta).toEqBigNumber(outgoingAssetAmount);
  });
});

describe('takeMultipleOrder', () => {
  it('works as expected - allowOrdersToFail: false', async () => {
    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance, preTxOutgoingAsset2Balance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset, outgoingAsset2],
    });

    // Encoded SwapData from 1inch's API (https://api.1inch.io/v5.0/1/swap), replacing the srcReceiver with the adapter address
    const encodedSwapData1 = `0x12aa3caf0000000000000000000000001136b25047e142fa3018184793aec68fbb173ce40000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000b20bd5d04be54f870d5c0d3ca85d82b34b836405000000000000000000000000${oneInchV5Adapter.address.slice(
      2,
    )}0000000000000000000000000000000000000000000000004563918244f40000000000000000000000000000000000000000000000000000000000000025fc2c0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf786b175474e89094c44da98b954eedeac495271d0f00206ae40711b8002dc6c0b20bd5d04be54f870d5c0d3ca85d82b34b8364051111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000000000016b175474e89094c44da98b954eedeac495271d0f00cfee7c08`;

    const encodedSwapData2 = `0x12aa3caf0000000000000000000000001136b25047e142fa3018184793aec68fbb173ce4000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000003041cbd36888becc7bbcbc0045e3b1f144466f5f000000000000000000000000${oneInchV5Adapter.address.slice(
      2,
    )}00000000000000000000000000000000000000000000000000000000004c4b4000000000000000000000000000000000000000000000000000000000002617710000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800206ae40711b8002dc6c03041cbd36888becc7bbcbc0045e3b1f144466f5f1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800cfee7c08`;

    const {
      data: data1,
      executor: executor1,
      orderDescription: orderDescription1,
    } = decodeOneInchSwapArgs(encodedSwapData1);

    const {
      data: data2,
      executor: executor2,
      orderDescription: orderDescription2,
    } = decodeOneInchSwapArgs(encodedSwapData2);

    const order1: OneInchV5TakeOrderArgs = {
      data: data1,
      executor: executor1,
      orderDescription: {
        amount: outgoingAssetAmount,
        dstReceiver: vaultProxy,
        dstToken: incomingAsset,
        flags: orderDescription1.flags,
        srcReceiver: orderDescription1.srcReceiver,
        srcToken: outgoingAsset,
        minReturnAmount: orderDescription1.minReturnAmount,
      },
    };
    const order2: OneInchV5TakeOrderArgs = {
      data: data2,
      executor: executor2,
      orderDescription: {
        amount: outgoingAsset2Amount,
        dstReceiver: vaultProxy,
        dstToken: incomingAsset,
        flags: orderDescription2.flags,
        srcReceiver: orderDescription2.srcReceiver,
        srcToken: outgoingAsset2,
        minReturnAmount: orderDescription2.minReturnAmount,
      },
    };

    await oneInchV5TakeMultipleOrders({
      allowOrdersToFail: false,
      comptrollerProxy,
      integrationManager,
      oneInchV5Adapter,
      orders: [order1, order2],
      signer: fundOwner,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance, postTxOutgoingAsset2Balance] =
      await getAssetBalances({
        account: vaultProxy,
        assets: [incomingAsset, outgoingAsset, outgoingAsset2],
      });

    const incomingAssetBalanceDelta = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    const outgoingAssetBalanceDelta = preTxOutgoingAssetBalance.sub(postTxOutgoingAssetBalance);
    const outgoingAsset2BalanceDelta = preTxOutgoingAsset2Balance.sub(postTxOutgoingAsset2Balance);

    // Since we are swapping stablecoins, we should expect the incoming amount to roughly equal outgoing amount
    expect(incomingAssetBalanceDelta).toBeAroundBigNumber(incomingAssetAmount.mul(2), 0.01);
    expect(outgoingAssetBalanceDelta).toEqBigNumber(outgoingAssetAmount);
    expect(outgoingAsset2BalanceDelta).toEqBigNumber(outgoingAsset2Amount);
  });

  it('works as expected - allowOrdersToFail: true', async () => {
    // Encoded SwapData from 1inch's API (https://api.1inch.io/v5.0/1/swap), replacing the srcReceiver with the adapter address
    const encodedSwapData1 = `0x12aa3caf0000000000000000000000001136b25047e142fa3018184793aec68fbb173ce40000000000000000000000006b175474e89094c44da98b954eedeac495271d0f000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000b20bd5d04be54f870d5c0d3ca85d82b34b836405000000000000000000000000${oneInchV5Adapter.address.slice(
      2,
    )}0000000000000000000000000000000000000000000000004563918244f40000000000000000000000000000000000000000000000000000000000000025fc2c0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf786b175474e89094c44da98b954eedeac495271d0f00206ae40711b8002dc6c0b20bd5d04be54f870d5c0d3ca85d82b34b8364051111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000000000016b175474e89094c44da98b954eedeac495271d0f00cfee7c08`;

    const encodedSwapData2 = `0x12aa3caf0000000000000000000000001136b25047e142fa3018184793aec68fbb173ce4000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000003041cbd36888becc7bbcbc0045e3b1f144466f5f000000000000000000000000${oneInchV5Adapter.address.slice(
      2,
    )}00000000000000000000000000000000000000000000000000000000004c4b4000000000000000000000000000000000000000000000000000000000002617710000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf78a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800206ae40711b8002dc6c03041cbd36888becc7bbcbc0045e3b1f144466f5f1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000000001a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800cfee7c08`;

    const {
      data: data1,
      executor: executor1,
      orderDescription: orderDescription1,
    } = decodeOneInchSwapArgs(encodedSwapData1);

    const { executor: executor2, orderDescription: orderDescription2 } = decodeOneInchSwapArgs(encodedSwapData2);

    const order1: OneInchV5TakeOrderArgs = {
      data: data1,
      executor: executor1,
      orderDescription: {
        amount: outgoingAssetAmount,
        dstReceiver: vaultProxy,
        dstToken: incomingAsset,
        flags: orderDescription1.flags,
        srcReceiver: orderDescription1.srcReceiver,
        srcToken: outgoingAsset,
        minReturnAmount: orderDescription1.minReturnAmount,
      },
    };

    // Provide bad data to cause a failure
    const order2: OneInchV5TakeOrderArgs = {
      data: '0x',
      executor: executor2,
      orderDescription: {
        amount: outgoingAsset2Amount,
        dstReceiver: vaultProxy,
        dstToken: incomingAsset,
        flags: orderDescription2.flags,
        srcReceiver: orderDescription2.srcReceiver,
        srcToken: outgoingAsset2,
        minReturnAmount: orderDescription2.minReturnAmount,
      },
    };

    // Should fail if allowOrdersToFail is false
    expect(
      oneInchV5TakeMultipleOrders({
        allowOrdersToFail: false,
        comptrollerProxy,
        integrationManager,
        oneInchV5Adapter,
        orders: [order1, order2],
        signer: fundOwner,
      }),
    ).rejects.toBeReverted();

    // Should succeed if allowOrdersToFail is true
    const receipt = await oneInchV5TakeMultipleOrders({
      allowOrdersToFail: true,
      comptrollerProxy,
      integrationManager,
      oneInchV5Adapter,
      orders: [order1, order2],
      signer: fundOwner,
    });

    assertEvent(receipt, oneInchV5Adapter.abi.getEvent('MultipleOrdersItemFailed'), {
      index: 1,
      reason: '0xc7009900',
    });
  });
});
