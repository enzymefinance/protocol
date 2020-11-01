import {
  EthereumTestnetProvider,
  SignerWithAddress,
} from '@crestproject/crestproject';
import { BigNumber, BigNumberish, utils } from 'ethers';
import {
  StandardToken,
  ComptrollerLib,
  IntegrationManager,
  KyberAdapter,
  VaultLib,
} from '@melonproject/protocol';
import {
  defaultForkDeployment,
  createNewFund,
  getAssetBalances,
  KyberNetworkProxy,
  kyberTakeOrder,
} from '@melonproject/testutils';

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
  fundOwner: SignerWithAddress;
  kyberAdapter: KyberAdapter;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
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

  await kyberTakeOrder({
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

  const kyberNetworkProxy = new KyberNetworkProxy(
    config.integratees.kyber,
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

xit('works as expected when called by a fund (ERC20 to ERC20)', async () => {
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

xit('works as expected when called by a fund (ETH to ERC20)', async () => {
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

xit('works as expected when called by a fund (ERC20 to ETH)', async () => {
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

xit('respects minConversionRate as set via minIncomingAssetAmount', async () => {
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
  await expect(
    kyberTakeOrder({
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
    }),
  ).rejects.toBeReverted();
});

xit('respects minConversionRate as set via minIncomingAssetAmount (non-18 decimal token)', async () => {
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
  await expect(
    kyberTakeOrder({
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
    }),
  ).rejects.toBeReverted();
});
