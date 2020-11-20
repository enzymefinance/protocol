import { utils, BigNumber, Signer } from 'ethers';
import { EthereumTestnetProvider, AddressLike, SignerWithAddress } from '@crestproject/crestproject';
import {
  sighash,
  synthetixResolveAddress,
  ComptrollerLib,
  encodeArgs,
  StandardToken,
  ISynthetixExchanger,
  ISynthetixDelegateApprovals,
  IntegrationManager,
  VaultLib,
  SynthetixAdapter,
} from '@melonproject/protocol';
import { defaultForkDeployment, getAssetBalances, createNewFund, synthetixTakeOrder } from '@melonproject/testutils';

const delegateSelector = sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)'));

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await provider.snapshot(defaultForkDeployment);

  const delegateApprovals = await synthetixResolveAddress({
    addressResolver: config.integratees.synthetix.addressResolver,
    name: 'DelegateApprovals',
    signer: config.deployer,
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: config.tokens.susd,
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
    delegateApprovals,
  };
}

async function delegateExchange({
  comptrollerProxy,
  delegateApprovals,
  fundOwner,
  authoriser,
  delegate,
}: {
  comptrollerProxy: ComptrollerLib;
  delegateApprovals: AddressLike;
  fundOwner: SignerWithAddress;
  authoriser: AddressLike;
  delegate: AddressLike;
}) {
  const callData = encodeArgs(['address'], [delegate]);
  await expect(
    comptrollerProxy.connect(fundOwner).vaultCallOnContract(delegateApprovals, delegateSelector, callData),
  ).resolves.toBeReceipt();

  const iDelegateApprovals = new ISynthetixDelegateApprovals(delegateApprovals, fundOwner);
  const canExchangeFor = await iDelegateApprovals.canExchangeFor(authoriser, delegate);
  expect(canExchangeFor).toBe(true);
}

async function prepareSynthetixTrade({
  enableDelegation = true,
}: {
  enableDelegation?: boolean;
} = {}) {
  const {
    //accounts,
    config: {
      deployer,
      integratees: {
        synthetix: { addressResolver, sbtc, susd },
      },
    },
    deployment: { synthetixAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
    delegateApprovals,
  } = await provider.snapshot(snapshot);

  // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
  if (enableDelegation) {
    await delegateExchange({
      comptrollerProxy,
      delegateApprovals,
      fundOwner,
      authoriser: vaultProxy.address,
      delegate: synthetixAdapter.address,
    });
  }

  const outgoingAssetAmount = utils.parseEther('100');
  const incomingAsset = new StandardToken(sbtc, deployer);
  const outgoingAsset = new StandardToken(susd, deployer);
  const exchanger = await synthetixResolveAddress({
    addressResolver,
    name: 'Exchanger',
    signer: deployer,
  });

  const iExchanger = new ISynthetixExchanger(exchanger, fundOwner);
  const { 0: minIncomingAssetAmount } = await iExchanger.getAmountsForExchange(
    outgoingAssetAmount,
    utils.formatBytes32String('sUSD'),
    utils.formatBytes32String('sBTC'),
  );

  return {
    addressResolver,
    comptrollerProxy,
    deployer,
    fundOwner,
    incomingAsset,
    integrationManager,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    vaultProxy,
    synthetixAdapter,
    sbtc,
    susd,
  };
}

async function synthetixTrade({
  comptrollerProxy,
  deployer,
  fundOwner,
  incomingAsset,
  integrationManager,
  minIncomingAssetAmount,
  minIncomingAssetAmountMultiplier = BigNumber.from('1'),
  outgoingAssetAmount,
  vaultProxy,
  synthetixAdapter,
  susd,
}: {
  comptrollerProxy: ComptrollerLib;
  deployer: Signer;
  fundOwner: Signer;
  incomingAsset: StandardToken;
  integrationManager: IntegrationManager;
  minIncomingAssetAmount: BigNumber;
  minIncomingAssetAmountMultiplier?: BigNumber;
  outgoingAssetAmount: BigNumber;
  vaultProxy: VaultLib;
  synthetixAdapter: SynthetixAdapter;
  susd: AddressLike;
}) {
  return synthetixTakeOrder({
    comptrollerProxy,
    vaultProxy,
    integrationManager,
    fundOwner,
    synthetixAdapter,
    outgoingAsset: new StandardToken(susd, deployer),
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount: minIncomingAssetAmountMultiplier.mul(minIncomingAssetAmount),
    seedFund: true,
  });
}

// HAPPY PATHS

it('works as expected when called by a fund (synth to synth)', async () => {
  const preparation = await prepareSynthetixTrade();

  const [preTxIncomingAssetBalance] = await getAssetBalances({
    account: preparation.vaultProxy,
    assets: [new StandardToken(preparation.sbtc, preparation.deployer)],
  });

  await expect(synthetixTrade(preparation)).resolves.toBeReceipt();

  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: preparation.vaultProxy,
    assets: [preparation.incomingAsset, preparation.outgoingAsset],
  });

  const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
  expect(incomingAssetAmount).toEqBigNumber(preparation.minIncomingAssetAmount);
  expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
});

// UNHAPPY PATHS

it('respects delegation', async () => {
  const preparation = await prepareSynthetixTrade({
    enableDelegation: false,
  });

  await expect(synthetixTrade(preparation)).rejects.toBeRevertedWith('Not approved to act on behalf');
});

it('respects minConversionRate as set via minIncomingAssetAmount', async () => {
  const preparation = await prepareSynthetixTrade();

  await expect(
    synthetixTrade({
      ...preparation,
      minIncomingAssetAmountMultiplier: BigNumber.from('2'),
    }),
  ).rejects.toBeRevertedWith('__reconcileCoIAssets: Received incoming asset less than expected');
});

it('respect waiting period between trades', async () => {
  const preparation = await prepareSynthetixTrade();

  await expect(synthetixTrade(preparation)).resolves.toBeReceipt();

  const outgoingAsset = new StandardToken(preparation.sbtc, preparation.deployer);
  const outgoingAssetAmount = await outgoingAsset.balanceOf(preparation.vaultProxy.address);
  const incomingAsset = new StandardToken(preparation.susd, preparation.deployer);
  const exchanger = await synthetixResolveAddress({
    addressResolver: preparation.addressResolver,
    name: 'Exchanger',
    signer: preparation.deployer,
  });

  const iExchanger = new ISynthetixExchanger(exchanger, preparation.fundOwner);
  const { 0: minIncomingAssetAmount } = await iExchanger.getAmountsForExchange(
    outgoingAssetAmount,
    utils.formatBytes32String('sBTC'),
    utils.formatBytes32String('sUSD'),
  );

  await expect(
    synthetixTakeOrder({
      comptrollerProxy: preparation.comptrollerProxy,
      vaultProxy: preparation.vaultProxy,
      integrationManager: preparation.integrationManager,
      fundOwner: preparation.fundOwner,
      synthetixAdapter: preparation.synthetixAdapter,
      outgoingAsset: new StandardToken(preparation.sbtc, preparation.deployer),
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: BigNumber.from('1').mul(minIncomingAssetAmount),
      seedFund: false,
    }),
  ).rejects.toBeRevertedWith('Cannot settle during waiting period');
});
