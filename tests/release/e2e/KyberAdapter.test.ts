import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, IntegrationManager, KyberAdapter, StandardToken, VaultLib } from '@enzymefinance/protocol';
import {
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  KyberNetworkProxy,
  kyberTakeOrder,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, utils } from 'ethers';

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

  const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
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

  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });

  const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

  expect(incomingAssetAmount).toEqBigNumber(expectedRate);
  expect(incomingAssetAmount).toBeGteBigNumber(minIncomingAssetAmount);
  expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));
}

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

// HAPPY PATHS

it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);
  const incomingAsset = new StandardToken(fork.config.primitives.bat, provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    kyberAdapter: fork.deployment.kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

it('works as expected when called by a fund (ETH to ERC20)', async () => {
  const outgoingAsset = new StandardToken(fork.config.weth, whales.weth);
  const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    kyberAdapter: fork.deployment.kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

it('works as expected when called by a fund (ERC20 to ETH)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);
  const incomingAsset = new StandardToken(fork.config.weth, provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    kyberAdapter: fork.deployment.kyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

// UNHAPPY PATHS

it('respects minConversionRate as set via minIncomingAssetAmount', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);
  const incomingAsset = new StandardToken(fork.config.primitives.knc, provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  // Make an order with more than the minIncominAssetAmount
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
  await expect(
    kyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      kyberAdapter: fork.deployment.kyberAdapter,
      outgoingAsset: outgoingAsset,
      outgoingAssetAmount,
      incomingAsset: incomingAsset,
      minIncomingAssetAmount: expectedRate.add(1),
      seedFund: false,
    }),
  ).rejects.toBeReverted();
});

it('respects minConversionRate as set via minIncomingAssetAmount (non-18 decimal token)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
  const incomingAsset = new StandardToken(fork.config.primitives.knc, provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  // 1 USDC (6 decimals)
  const outgoingAssetAmount = BigNumber.from('1000000');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  // Transaction reverts having a minIncomingAmount > expectedRate
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
  await expect(
    kyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      kyberAdapter: fork.deployment.kyberAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: expectedRate.add(1),
      seedFund: false,
    }),
  ).rejects.toBeReverted();
});
