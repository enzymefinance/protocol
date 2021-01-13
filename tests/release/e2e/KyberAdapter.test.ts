import { SignerWithAddress } from '@crestproject/crestproject';
import { BigNumber, BigNumberish, utils } from 'ethers';
import { StandardToken, ComptrollerLib, IntegrationManager, KyberAdapter, VaultLib } from '@enzymefinance/protocol';
import {
  createNewFund,
  ForkDeployment,
  getAssetBalances,
  loadForkDeployment,
  KyberNetworkProxy,
  kyberTakeOrder,
  mainnetWhales,
  unlockWhales,
} from '@enzymefinance/testutils';
import hre from 'hardhat';

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

let fork: ForkDeployment;
const whales: Record<string, SignerWithAddress> = {};

beforeAll(async () => {
  whales.dai = ((await hre.ethers.getSigner(mainnetWhales.dai)) as any) as SignerWithAddress;
  whales.usdc = ((await hre.ethers.getSigner(mainnetWhales.usdc)) as any) as SignerWithAddress;
  whales.weth = ((await hre.ethers.getSigner(mainnetWhales.weth)) as any) as SignerWithAddress;

  await unlockWhales({
    provider: hre.ethers.provider,
    whales: Object.values(whales),
  });
});

beforeEach(async () => {
  fork = await loadForkDeployment();
});

// HAPPY PATHS

it('works as expected when called by a fund (ERC20 to ERC20)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);
  const incomingAsset = new StandardToken(fork.config.primitives.knc, hre.ethers.provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, hre.ethers.provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.FundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.IntegrationManager,
    fundOwner,
    kyberAdapter: fork.deployment.KyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

it('works as expected when called by a fund (ETH to ERC20)', async () => {
  const outgoingAsset = new StandardToken(fork.config.weth, whales.weth);
  const incomingAsset = new StandardToken(fork.config.primitives.dai, hre.ethers.provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, hre.ethers.provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.FundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.IntegrationManager,
    fundOwner,
    kyberAdapter: fork.deployment.KyberAdapter,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount,
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: expectedRate,
    expectedRate,
  });
});

it('works as expected when called by a fund (ERC20 to ETH)', async () => {
  const outgoingAsset = new StandardToken(fork.config.primitives.dai, whales.dai);
  const incomingAsset = new StandardToken(fork.config.weth, hre.ethers.provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, hre.ethers.provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.FundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  await assertKyberTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager: fork.deployment.IntegrationManager,
    fundOwner,
    kyberAdapter: fork.deployment.KyberAdapter,
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
  const incomingAsset = new StandardToken(fork.config.primitives.knc, hre.ethers.provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, hre.ethers.provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.FundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  const outgoingAssetAmount = utils.parseEther('1');

  const { expectedRate } = await kyberNetworkProxy.getExpectedRate(outgoingAsset, incomingAsset, outgoingAssetAmount);

  // Make an order with more than the minIncominAssetAmount
  await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
  await expect(
    kyberTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      kyberAdapter: fork.deployment.KyberAdapter,
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
  const incomingAsset = new StandardToken(fork.config.primitives.knc, hre.ethers.provider);
  const kyberNetworkProxy = new KyberNetworkProxy(fork.config.kyber.networkProxy, hre.ethers.provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.FundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
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
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      kyberAdapter: fork.deployment.KyberAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: expectedRate.add(1),
      seedFund: false,
    }),
  ).rejects.toBeReverted();
});
