import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import { BigNumber, BigNumberish, Signer, utils } from 'ethers';
import { IERC20 } from '../../codegen/IERC20';
import {
  ComptrollerLib,
  IntegrationManager,
  KyberAdapter,
  VaultLib,
} from '../../utils/contracts';
import { defaultForkDeployment } from '../../utils/testing';
import {
  createNewFund,
  getAssetBalances,
  IKyberNetworkProxy,
  kyberTakeOrder,
} from '../utils';

async function assertKyberTakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  kyberAdapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
  expectedRate,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  kyberAdapter: KyberAdapter;
  outgoingAsset: IERC20;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: IERC20;
  minIncomingAssetAmount?: BigNumberish;
  expectedRate: BigNumberish;
}) {
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  const [
    preTxIncomingAssetBalance,
    preTxOutgoingAssetBalance,
  ] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  const takeOrderTx = kyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount,
    seedFund: false,
  });
  await expect(takeOrderTx).resolves.toBeReceipt();

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

  expect(incomingAssetAmount).toEqBigNumber(expectedRate);
  expect(incomingAssetAmount).toBeGteBigNumber(minIncomingAssetAmount);
  expect(postTxOutgoingAssetBalance).toEqBigNumber(
    preTxOutgoingAssetBalance.sub(outgoingAssetAmount),
  );
}

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

  const kyberNetworkProxy = new IKyberNetworkProxy(
    await resolveAddress(config.integratees.kyber),
    provider,
  );

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    kyberNetworkProxy,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

// HAPPY PATHS

it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
  const {
    config: {
      tokens: { dai: outgoingAsset, knc: incomingAsset },
    },
    kyberNetworkProxy,
    deployment: { kyberAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
    outgoingAsset,
    incomingAsset,
    outgoingAssetAmount,
  );

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

it('works as expected when called by a fund (ETH to ERC20)', async () => {
  const {
    config: {
      tokens: { weth: outgoingAsset, dai: incomingAsset },
    },
    kyberNetworkProxy,
    deployment: { kyberAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
    outgoingAsset,
    incomingAsset,
    outgoingAssetAmount,
  );

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

it('works as expected when called by a fund (ERC20 to ETH)', async () => {
  const {
    config: {
      tokens: { dai: outgoingAsset, weth: incomingAsset },
    },
    kyberNetworkProxy,
    deployment: { kyberAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
    outgoingAsset,
    incomingAsset,
    outgoingAssetAmount,
  );

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

// UNHAPPY PATHS

it('respects minConversionRate as set via minIncomingAssetAmount', async () => {
  const {
    config: {
      tokens: { dai: outgoingAsset, knc: incomingAsset },
    },
    kyberNetworkProxy,
    deployment: { kyberAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
    outgoingAsset,
    incomingAsset,
    outgoingAssetAmount,
  );

  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  // Make an order with more than the minIncominAssetAmount
  const takeOrderTx = kyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate.add(1),
    seedFund: false,
  });

  await expect(takeOrderTx).rejects.toBeReverted();
});

it('respects minConversionRate as set via minIncomingAssetAmount (non-18 decimal token)', async () => {
  const {
    config: {
      tokens: { usdc: outgoingAsset, knc: incomingAsset },
    },
    kyberNetworkProxy,
    deployment: { kyberAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  // 1 USDC (6 decimals)
  const outgoingAssetAmount = BigNumber.from('1000000');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(
    outgoingAsset,
    incomingAsset,
    outgoingAssetAmount,
  );

  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  // Transaction works using the expected rate
  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });

  // Transaction reverts having a minIncomingAmount > expectedRate
  const failTx = kyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    kyberAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount: expectedRate.add(1),
    seedFund: false,
  });

  await expect(failTx).rejects.toBeReverted();
});
