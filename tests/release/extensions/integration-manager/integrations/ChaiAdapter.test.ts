import {
  assetTransferArgs,
  chaiLendArgs,
  chaiRedeemArgs,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  chaiLend,
  chaiRedeem,
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const {
    deployer,
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await deployProtocolFixture();

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.weth, deployer),
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
        chai: { chai, dai },
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
        chai: { chai, dai },
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
        chai: { chai, dai },
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
      config,
      deployment: { chaiAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);
    const daiAmount = utils.parseEther('1');
    const minChaiAmount = 1;

    const chai = new StandardToken(config.chai.chai, provider);
    const dai = new StandardToken(config.chai.dai, whales.dai);

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

    const [postTxChaiBalance, postTxDaiBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [chai, dai],
    });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      selector: lendSelector,
      integrationData: expect.anything(),
      adapter: chaiAdapter,
      incomingAssets: [chai],
      incomingAssetAmounts: [postTxChaiBalance.sub(preTxChaiBalance)],
      outgoingAssets: [dai],
      outgoingAssetAmounts: [daiAmount],
    });

    // const expectedChaiAmount = daiAmount; //TODO
    // expect(postTxChaiBalance).toEqBigNumber(preTxChaiBalance.add(expectedChaiAmount));
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
      config,
      deployment: { chaiAdapter, integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    const chai = new StandardToken(config.chai.chai, whales.chai);
    const dai = new StandardToken(config.chai.dai, whales.dai);

    const chaiAmount = utils.parseEther('1');
    const minDaiAmount = 1;

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

    const [postTxChaiBalance, postTxDaiBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [chai, dai],
    });

    assertEvent(receipt, CallOnIntegrationExecutedForFundEvent, {
      comptrollerProxy,
      vaultProxy,
      caller: fundOwner,
      selector: redeemSelector,
      integrationData: expect.anything(),
      adapter: chaiAdapter,
      incomingAssets: [dai],
      incomingAssetAmounts: [postTxDaiBalance.sub(preTxDaiBalance)],
      outgoingAssets: [chai],
      outgoingAssetAmounts: [chaiAmount],
    });

    // const expectedDaiAmount = chaiAmount; // TODO
    // expect(postTxDaiBalance).toEqBigNumber(preTxDaiBalance.add(expectedDaiAmount));
    expect(postTxChaiBalance).toEqBigNumber(preTxChaiBalance.sub(chaiAmount));
  });
});
