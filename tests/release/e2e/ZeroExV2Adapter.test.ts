import { BigNumber, constants, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import {
  createNewFund,
  getAssetBalances,
  zeroExV2TakeOrder,
  defaultForkDeployment,
} from '@melonproject/testutils';
import {
  createUnsignedZeroExV2Order,
  signZeroExV2Order,
} from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await provider.snapshot(
    defaultForkDeployment,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: config.tokens.weth,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('takeOrder', () => {
  it('works as expected without takerFee', async () => {
    const {
      config: {
        deployer,
        integratees: {
          zeroExV2: { exchange, erc20Proxy },
        },
        tokens: { weth: incomingAsset, dai: outgoingAsset },
      },
      deployment: { zeroExV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const maker = deployer;
    const feeRecipientAddress = constants.AddressZero;
    const makerAssetAmount = utils.parseEther('1');
    const takerAssetAmount = utils.parseEther('1');
    const takerFee = BigNumber.from(0);
    const takerAssetFillAmount = takerAssetAmount;

    await outgoingAsset.transfer(vaultProxy, takerAssetAmount);
    await incomingAsset.approve(erc20Proxy, makerAssetAmount);
    await zeroExV2Adapter.updateAllowedMakers([maker], [true]);

    const [
      preTxIncomingAssetBalance,
      preTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const unsignedOrder = await createUnsignedZeroExV2Order({
      provider,
      exchange,
      maker,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    await zeroExV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      zeroExV2Adapter,
      signedOrder,
      takerAssetFillAmount,
    });

    const [
      postTxIncomingAssetBalance,
      postTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(
      preTxIncomingAssetBalance,
    );

    expect(incomingAssetAmount).toEqBigNumber(makerAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(
      preTxOutgoingAssetBalance.sub(takerAssetAmount),
    );
  });

  it('works as expected with takerFee', async () => {
    const {
      config: {
        deployer,
        integratees: {
          zeroExV2: { exchange, erc20Proxy },
        },
        tokens: { knc: incomingAsset, zrx: outgoingAsset },
      },
      deployment: { zeroExV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const maker = deployer;
    const feeRecipientAddress = randomAddress();
    const makerAssetAmount = utils.parseEther('1');
    const takerAssetAmount = utils.parseEther('1');
    const takerFee = utils.parseEther('0.0001');
    const takerAssetFillAmount = utils.parseEther('1');

    // seedFund for takerFee
    await outgoingAsset.transfer(vaultProxy, takerFee);
    await outgoingAsset.transfer(vaultProxy, takerAssetAmount);
    await incomingAsset.approve(erc20Proxy, makerAssetAmount);
    await zeroExV2Adapter.updateAllowedMakers([maker], [true]);

    const [
      preTxIncomingAssetBalance,
      preTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const unsignedOrder = await createUnsignedZeroExV2Order({
      provider,
      exchange,
      maker,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    await zeroExV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      zeroExV2Adapter,
      signedOrder,
      takerAssetFillAmount,
    });

    const [
      postTxIncomingAssetBalance,
      postTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(
      preTxIncomingAssetBalance,
    );

    expect(incomingAssetAmount).toEqBigNumber(makerAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(
      preTxOutgoingAssetBalance.sub(takerAssetAmount.add(takerFee)),
    );
  });

  it('partially fill an order', async () => {
    const {
      config: {
        deployer,
        integratees: {
          zeroExV2: { exchange, erc20Proxy },
        },
        tokens: { knc: incomingAsset, weth: outgoingAsset },
      },
      deployment: { zeroExV2Adapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const maker = deployer;
    const feeRecipientAddress = randomAddress();
    const makerAssetAmount = utils.parseEther('1');
    const takerAssetAmount = utils.parseEther('0.1');
    const takerFee = BigNumber.from(0);
    const takerAssetFillAmount = utils.parseEther('0.03');
    const expectedIncomingAssetAmount = makerAssetAmount
      .mul(takerAssetFillAmount)
      .div(takerAssetAmount);

    await outgoingAsset.transfer(vaultProxy, takerAssetAmount);
    await incomingAsset.approve(erc20Proxy, makerAssetAmount);
    await zeroExV2Adapter.updateAllowedMakers([maker], [true]);

    const [
      preTxIncomingAssetBalance,
      preTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const unsignedOrder = await createUnsignedZeroExV2Order({
      provider,
      exchange,
      maker,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: incomingAsset,
      takerAsset: outgoingAsset,
    });

    const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    await zeroExV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      zeroExV2Adapter,
      signedOrder,
      takerAssetFillAmount,
    });

    const [
      postTxIncomingAssetBalance,
      postTxOutgoingAssetBalance,
    ] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(
      preTxIncomingAssetBalance,
    );

    expect(incomingAssetAmount).toEqBigNumber(expectedIncomingAssetAmount);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(
      preTxOutgoingAssetBalance.sub(takerAssetFillAmount),
    );
  });
});
