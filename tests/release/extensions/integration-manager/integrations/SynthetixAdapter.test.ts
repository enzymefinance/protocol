import { EthereumTestnetProvider, AddressLike, SignerWithAddress } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  StandardToken,
  assetTransferArgs,
  synthetixResolveAddress,
  synthetixTakeOrderArgs,
  takeOrderSelector,
  SpendAssetsHandleType,
  ISynthetixDelegateApprovals,
  ISynthetixExchanger,
  IntegrationManager,
  SynthetixAdapter,
  VaultLib,
  sighash,
  encodeArgs,
} from '@melonproject/protocol';
import { createNewFund, defaultTestDeployment, getAssetBalances, synthetixTakeOrder } from '@melonproject/testutils';
import { utils, BigNumber, Signer } from 'ethers';

const delegateSelector = sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)'));

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await provider.snapshot(defaultTestDeployment);

  const delegateApprovals = await synthetixResolveAddress({
    addressResolver: config.integratees.synthetix.addressResolver,
    name: 'DelegateApprovals',
    signer: config.deployer,
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.integratees.synthetix.susd, config.deployer),
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

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { integrationManager, synthetixAdapter },
      config: {
        integratees: { synthetix },
      },
    } = await provider.snapshot(snapshot);

    const addressResolverResult = await synthetixAdapter.getAddressResolver();
    expect(addressResolverResult).toMatchAddress(synthetix.addressResolver);

    const originatorResult = await synthetixAdapter.getOriginator();
    expect(originatorResult).toMatchAddress(synthetix.originator);

    const trackingCodeResult = await synthetixAdapter.getTrackingCode();
    expect(trackingCodeResult).toBe(synthetix.trackingCode);

    const integrationManagerResult = await synthetixAdapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { synthetixAdapter },
      config: {
        integratees: {
          synthetix: { susd, sbtc },
        },
      },
    } = await provider.snapshot(snapshot);

    const args = synthetixTakeOrderArgs({
      incomingAsset: sbtc,
      minIncomingAssetAmount: 1,
      outgoingAsset: susd,
      outgoingAssetAmount: 1,
    });

    await expect(synthetixAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(synthetixAdapter.parseAssetsForMethod(takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output', async () => {
    const {
      deployment: { synthetixAdapter },
      config: {
        integratees: {
          synthetix: { susd, sbtc },
        },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = sbtc;
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = susd;
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = synthetixTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const result = await synthetixAdapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(synthetixAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAssetAmount],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { synthetixAdapter },
      fund: { vaultProxy },
      config: {
        integratees: {
          synthetix: { susd, sbtc },
        },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = sbtc;
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = susd;
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = synthetixTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const transferArgs = await assetTransferArgs({
      adapter: synthetixAdapter,
      selector: takeOrderSelector,
      encodedCallArgs: takeOrderArgs,
    });

    await expect(synthetixAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('does not allow empty minimum asset amount', async () => {
    const {
      deployment: { synthetixAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      config: {
        deployer,
        integratees: {
          synthetix: { susd, sbtc },
        },
      },
    } = await provider.snapshot(snapshot);

    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        synthetixAdapter,
        outgoingAsset: new StandardToken(susd, deployer),
        outgoingAssetAmount: utils.parseEther('1'),
        minIncomingAssetAmount: 0,
        incomingAsset: new StandardToken(sbtc, deployer),
        seedFund: true,
      }),
    ).rejects.toBeRevertedWith('minIncomingAssetAmount must be >0');
  });

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
        seedFund: true,
      }),
    ).rejects.toBeRevertedWith('Cannot settle during waiting period');
  });
});
