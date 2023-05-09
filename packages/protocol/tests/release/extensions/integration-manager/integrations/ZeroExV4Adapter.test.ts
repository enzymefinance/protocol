import { randomAddress } from '@enzymefinance/ethers';
import type { AddressListRegistry, ComptrollerLib, IntegrationManager, VaultLib } from '@enzymefinance/protocol';
import {
  AddressListUpdateType,
  createUnsignedZeroExV4LimitOrder,
  createUnsignedZeroExV4RfqOrder,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
  signZeroExV4LimitOrder,
  signZeroExV4RfqOrder,
  SpendAssetsHandleType,
  takeOrderSelector,
  ZeroExV4Adapter,
  ZeroExV4OrderType,
  zeroExV4TakeOrderArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  setAccountBalance,
  zeroExV4TakeLimitOrder,
  zeroExV4TakeRfqOrder,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';

let deployer: SignerWithAddress, fundOwner: SignerWithAddress, maker: SignerWithAddress;
let fork: ProtocolDeployment;
let makerAmount: BigNumber;
let takerAmount: BigNumber;
let takerFee: BigNumber;
let takerAssetFillAmount: BigNumber;
let incomingAsset: ITestStandardToken;
let outgoingAsset: ITestStandardToken;

let addressListRegistry: AddressListRegistry;
let integrationManager: IntegrationManager;
let zeroExV4Adapter: ZeroExV4Adapter;
let zeroExV4Exchange: string;

let comptrollerProxy: ComptrollerLib;
let vaultProxy: VaultLib;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner, maker] = fork.accounts;
  incomingAsset = new ITestStandardToken(fork.config.primitives.mln, provider);
  outgoingAsset = new ITestStandardToken(fork.config.weth, provider);
  makerAmount = (await getAssetUnit(incomingAsset)).mul(3);
  takerAmount = (await getAssetUnit(outgoingAsset)).mul(5);
  takerFee = (await getAssetUnit(outgoingAsset)).mul(7);
  takerAssetFillAmount = (await getAssetUnit(outgoingAsset)).mul(2);

  addressListRegistry = fork.deployment.addressListRegistry;
  integrationManager = fork.deployment.integrationManager;
  zeroExV4Exchange = fork.config.zeroexV4.exchange;
  zeroExV4Adapter = fork.deployment.zeroExV4Adapter;

  const fund = await createNewFund({
    denominationAsset: outgoingAsset,
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = fund.comptrollerProxy;
  deployer = fork.deployer;
  vaultProxy = fund.vaultProxy;

  // Seed vault and maker accounts
  await setAccountBalance({
    provider,
    account: maker,
    amount: (await getAssetUnit(incomingAsset)).mul(100),
    token: incomingAsset,
  });
  await setAccountBalance({
    provider,
    account: vaultProxy,
    amount: (await getAssetUnit(outgoingAsset)).mul(100),
    token: outgoingAsset,
  });

  incomingAsset.connect(maker).approve(zeroExV4Exchange, constants.MaxUint256);
});

describe('parseAssetsForAction', () => {
  it('does not allow a maker which is not whitelisted', async () => {
    // Create a list with one allowed maker
    const listId = await addressListRegistry.getListCount();
    await addressListRegistry.createList(fundOwner, AddressListUpdateType.None, [maker]);

    // Deploy a new instance of the ZeroExV4Adapter with that list
    const zeroExV4AdapterWithWhitelist = await ZeroExV4Adapter.deploy(
      deployer,
      integrationManager,
      zeroExV4Exchange,
      addressListRegistry,
      listId,
    );

    const order = createUnsignedZeroExV4LimitOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker: deployer,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerAmount,
    });
    const signature = await signZeroExV4LimitOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: deployer,
    });
    const takeOrderArgs = zeroExV4TakeOrderArgs({
      order,
      signature,
      orderType: ZeroExV4OrderType.Limit,
      takerAssetFillAmount,
    });

    await expect(
      zeroExV4AdapterWithWhitelist.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs),
    ).rejects.toBeRevertedWith('Order maker is not allowed');
  });

  it('allows a whitelisted maker', async () => {
    // Create a list with one allowed maker
    const listId = await addressListRegistry.getListCount();
    await addressListRegistry.createList(fundOwner, AddressListUpdateType.None, [maker]);

    // Deploy a new instance of the ZeroExV4Adapter with that list
    const zeroExV4AdapterWithWhitelist = await ZeroExV4Adapter.deploy(
      deployer,
      integrationManager,
      zeroExV4Exchange,
      addressListRegistry,
      listId,
    );

    const order = createUnsignedZeroExV4LimitOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerAmount,
    });
    const signature = await signZeroExV4LimitOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: maker,
    });
    const takeOrderArgs = zeroExV4TakeOrderArgs({
      order,
      signature,
      orderType: ZeroExV4OrderType.Limit,
      takerAssetFillAmount,
    });

    const result = await zeroExV4AdapterWithWhitelist.parseAssetsForAction(
      randomAddress(),
      takeOrderSelector,
      takeOrderArgs,
    );

    expect(result).toMatchFunctionOutput(zeroExV4AdapterWithWhitelist.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [makerAmount.mul(takerAssetFillAmount).div(takerAmount)],
      spendAssetAmounts_: [takerAssetFillAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output without takerFee', async () => {
    const order = createUnsignedZeroExV4LimitOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerAmount,
    });

    const signature = await signZeroExV4LimitOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: maker,
    });

    const takeOrderArgs = zeroExV4TakeOrderArgs({
      order,
      signature,
      orderType: ZeroExV4OrderType.Limit,
      takerAssetFillAmount,
    });

    const result = await zeroExV4Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV4Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [makerAmount.mul(takerAssetFillAmount).div(takerAmount)],
      spendAssetAmounts_: [takerAssetFillAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output with takerFee', async () => {
    const expectedTakerFee = takerAssetFillAmount.mul(takerFee).div(takerAmount);

    const order = createUnsignedZeroExV4LimitOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerAmount,
      takerTokenFeeAmount: takerFee,
    });

    const signature = await signZeroExV4LimitOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: maker,
    });
    const takeOrderArgs = zeroExV4TakeOrderArgs({
      order,
      signature,
      orderType: ZeroExV4OrderType.Limit,
      takerAssetFillAmount,
    });

    const result = await zeroExV4Adapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(zeroExV4Adapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [makerAmount.mul(takerAssetFillAmount).div(takerAmount)],
      spendAssetAmounts_: [takerAssetFillAmount.add(expectedTakerFee)],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [outgoingAsset],
    });
  });
});

describe('takeOrder (limit order)', () => {
  it('works as expected without takerFee', async () => {
    const order = createUnsignedZeroExV4LimitOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerAmount,
    });
    const signature = await signZeroExV4LimitOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: maker,
    });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    await zeroExV4TakeLimitOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      order,
      signature,
      takerAssetFillAmount,
      vaultProxy,
      zeroExV4Adapter,
    });
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toEqBigNumber(makerAmount.mul(takerAssetFillAmount).div(takerAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount));
  });

  it('works as expected with takerFee', async () => {
    const order = createUnsignedZeroExV4LimitOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerTokenFeeAmount: takerFee,
      takerAmount,
    });
    const signature = await signZeroExV4LimitOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: maker,
    });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    await zeroExV4TakeLimitOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      order,
      signature,
      takerAssetFillAmount,
      vaultProxy,
      zeroExV4Adapter,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetBalanceDelta = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
    const expectedIncomingAssetDelta = makerAmount.mul(takerAssetFillAmount).div(takerAmount);

    const outgoingAssetBalanceDelta = preTxOutgoingAssetBalance.sub(postTxOutgoingAssetBalance);
    const feeAmount = takerFee.mul(takerAssetFillAmount).div(takerAmount);
    const expectedOutgoingAssetDelta = takerAssetFillAmount.add(feeAmount);

    expect(incomingAssetBalanceDelta).toEqBigNumber(expectedIncomingAssetDelta);
    expect(outgoingAssetBalanceDelta).toEqBigNumber(expectedOutgoingAssetDelta);
  });
});

describe('takeOrder (rfq order)', () => {
  it('works as expected', async () => {
    const order = createUnsignedZeroExV4RfqOrder({
      expiry: (await provider.getBlock('latest')).timestamp + ONE_DAY_IN_SECONDS,
      maker,
      makerToken: incomingAsset,
      makerAmount,
      takerToken: outgoingAsset,
      takerAmount,
      txOrigin: fundOwner,
    });
    const signature = await signZeroExV4RfqOrder({
      order,
      chainId: 1,
      exchangeAddress: zeroExV4Exchange,
      signer: maker,
    });

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    await zeroExV4TakeRfqOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      order,
      signature,
      takerAssetFillAmount,
      vaultProxy,
      zeroExV4Adapter,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toEqBigNumber(makerAmount.mul(takerAssetFillAmount).div(takerAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount));
  });
});
