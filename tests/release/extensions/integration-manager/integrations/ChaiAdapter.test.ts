import { utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import {
  defaultTestDeployment,
  assertEvent,
  chaiLend,
  chaiRedeem,
  createNewFund,
  getAssetBalances,
} from '@melonproject/testutils';
import {
  chaiLendArgs,
  lendSelector,
  chaiRedeemArgs,
  redeemSelector,
  assetTransferArgs,
  SpendAssetsHandleType,
} from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
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

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { chaiAdapter, integrationManager },
      config: {
        derivatives: { chai },
        integratees: {
          makerDao: { dai },
        },
      },
    } = await provider.snapshot(snapshot);

    const chaiResult = await chaiAdapter.getChai();
    expect(chaiResult).toMatchAddress(chai);

    const daiResult = await chaiAdapter.getDai();
    expect(daiResult).toMatchAddress(dai);

    const integrationManagerResult = await chaiAdapter.getIntegrationManager();
    expect(integrationManagerResult).toMatchAddress(integrationManager);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const {
      deployment: { chaiAdapter },
    } = await provider.snapshot(snapshot);

    const args = chaiLendArgs({
      outgoingDaiAmount: 1,
      expectedIncomingChaiAmount: 1,
    });

    await expect(chaiAdapter.parseAssetsForMethod(utils.randomBytes(4), args)).rejects.toBeRevertedWith(
      '_selector invalid',
    );

    await expect(chaiAdapter.parseAssetsForMethod(lendSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for lending', async () => {
    const {
      deployment: { chaiAdapter },
      config: {
        derivatives: { chai },
        integratees: {
          makerDao: { dai },
        },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = chai;
    const incomingAmount = utils.parseEther('1');
    const outgoingAsset = dai;
    const outgoingAmount = utils.parseEther('1');

    const args = chaiLendArgs({
      outgoingDaiAmount: incomingAmount,
      expectedIncomingChaiAmount: outgoingAmount,
    });

    const selector = lendSelector;
    const result = await chaiAdapter.parseAssetsForMethod(selector, args);
    expect(result).toMatchFunctionOutput(chaiAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAmount],
      minIncomingAssetAmounts_: [incomingAmount],
    });
  });

  it('generates expected output for redeeming', async () => {
    const {
      deployment: { chaiAdapter },
      config: {
        derivatives: { chai },
        integratees: {
          makerDao: { dai },
        },
      },
    } = await provider.snapshot(snapshot);

    const incomingAsset = dai;
    const incomingAmount = utils.parseEther('1');
    const outgoingAsset = chai;
    const outgoingAmount = utils.parseEther('1');

    const args = chaiRedeemArgs({
      outgoingChaiAmount: outgoingAmount,
      expectedIncomingDaiAmount: incomingAmount,
    });

    const selector = redeemSelector;
    const result = await chaiAdapter.parseAssetsForMethod(selector, args);
    expect(result).toMatchFunctionOutput(chaiAdapter.parseAssetsForMethod, {
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      incomingAssets_: [incomingAsset],
      spendAssets_: [outgoingAsset],
      spendAssetAmounts_: [outgoingAmount],
      minIncomingAssetAmounts_: [incomingAmount],
    });
  });
});

describe('lend', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { chaiAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const lendArgs = chaiLendArgs({
      outgoingDaiAmount: 1,
      expectedIncomingChaiAmount: 1,
    });

    const transferArgs = await assetTransferArgs({
      adapter: chaiAdapter,
      selector: lendSelector,
      encodedCallArgs: lendArgs,
    });

    await expect(chaiAdapter.lend(vaultProxy, lendArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const {
      deployment: {
        chaiAdapter,
        chaiIntegratee: chai,
        integrationManager,
        tokens: { dai },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);
    const daiAmount = utils.parseEther('1');
    const minChaiAmount = daiAmount; // Mock rate is 1:1

    // Seed fund vault with enough DAI for tx
    await dai.transfer(vaultProxy, daiAmount);
    const [preTxChaiBalance, preTxDaiBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [chai, dai],
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const receipt = await chaiLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      chaiAdapter,
      dai,
      daiAmount,
      minChaiAmount,
    });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      selector: lendSelector,
      integrationData: expect.anything(),
      adapter: chaiAdapter,
      incomingAssets: [chai],
      incomingAssetAmounts: [minChaiAmount],
      outgoingAssets: [dai],
      outgoingAssetAmounts: [daiAmount],
    });

    const [postTxChaiBalance, postTxDaiBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [chai, dai],
    });

    const expectedChaiAmount = daiAmount;
    expect(postTxChaiBalance).toEqBigNumber(preTxChaiBalance.add(expectedChaiAmount));
    expect(postTxDaiBalance).toEqBigNumber(preTxDaiBalance.sub(daiAmount));
  });
});

describe('redeem', () => {
  it('can only be called via the IntegrationManager', async () => {
    const {
      deployment: { chaiAdapter },
      fund: { vaultProxy },
    } = await provider.snapshot(snapshot);

    const redeemArgs = chaiRedeemArgs({
      outgoingChaiAmount: utils.parseEther('1'),
      expectedIncomingDaiAmount: utils.parseEther('1'),
    });

    const transferArgs = await assetTransferArgs({
      adapter: chaiAdapter,
      selector: redeemSelector,
      encodedCallArgs: redeemArgs,
    });

    await expect(chaiAdapter.redeem(vaultProxy, redeemArgs, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund', async () => {
    const {
      deployment: {
        chaiAdapter,
        chaiIntegratee: chai,
        integrationManager,
        tokens: { dai },
      },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);
    const chaiAmount = utils.parseEther('1');
    const minDaiAmount = chaiAmount; // Mock rate is 1:1

    // Seed fund vault with enough CHAI for tx
    await chai.transfer(vaultProxy, chaiAmount);

    const [preTxChaiBalance, preTxDaiBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [chai, dai],
    });

    const CallOnIntegrationExecutedForFundEvent = integrationManager.abi.getEvent('CallOnIntegrationExecutedForFund');

    const receipt = await chaiRedeem({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      chaiAdapter,
      chai,
      chaiAmount,
      minDaiAmount,
    });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      selector: redeemSelector,
      integrationData: expect.anything(),
      adapter: chaiAdapter,
      incomingAssets: [dai],
      incomingAssetAmounts: [minDaiAmount],
      outgoingAssets: [chai],
      outgoingAssetAmounts: [chaiAmount],
    });

    const [postTxChaiBalance, postTxDaiBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [chai, dai],
    });

    const expectedDaiAmount = chaiAmount;
    expect(postTxChaiBalance).toEqBigNumber(preTxChaiBalance.sub(chaiAmount));
    expect(postTxDaiBalance).toEqBigNumber(preTxDaiBalance.add(expectedDaiAmount));
  });
});
