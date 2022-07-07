import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  ChainlinkRateAsset,
  ISynthetixExchanger,
  redeemSelector,
  SpendAssetsHandleType,
  StandardToken,
  synthetixRedeemArgs,
  synthetixTakeOrderArgs,
  takeOrderSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  seedAccount,
  synthetixAssignExchangeDelegate,
  synthetixRedeem,
  synthetixTakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const synthetixExchangerAddress = '0x2A417C61B8062363e4ff50900779463b45d235f6';

const sethCurrencyKey = utils.formatBytes32String('sETH');
const susdCurrencyKey = utils.formatBytes32String('sUSD');

// Addresses of deprecated synths that can potentially be removed from the asset universe
const sxagAddress = '0x6a22e5e94388464181578aa7a6b869e00fe27846';
const sxauAddress = '0x261efcdd24cea98652b9700800a13dfbca4103ff';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const synthetixAdapter = fork.deployment.synthetixAdapter;

    const integrationManagerResult = await synthetixAdapter.getIntegrationManager();

    expect(integrationManagerResult).toMatchAddress(fork.deployment.integrationManager);

    const originatorResult = await synthetixAdapter.getSynthetixOriginator();

    expect(originatorResult).toMatchAddress(fork.config.synthetix.originator);

    const synthetixResult = await synthetixAdapter.getSynthetix();

    expect(synthetixResult).toMatchAddress(fork.config.synthetix.snx);

    const trackingCodeResult = await synthetixAdapter.getSynthetixTrackingCode();

    expect(trackingCodeResult).toBe(fork.config.synthetix.trackingCode);
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const synthetixAdapter = fork.deployment.synthetixAdapter;

    const args = synthetixTakeOrderArgs({
      minIncomingSusdAmount: 1,
      outgoingAsset: fork.config.unsupportedAssets.seth,
      outgoingAssetAmount: 1,
    });

    await expect(
      synthetixAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(synthetixAdapter.parseAssetsForAction(randomAddress(), takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for take order', async () => {
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const minIncomingSusdAmount = utils.parseEther('1');
    const outgoingAsset = fork.config.unsupportedAssets.seth;
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = synthetixTakeOrderArgs({
      minIncomingSusdAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const result = await synthetixAdapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(synthetixAdapter.parseAssetsForAction, {
      incomingAssets_: [fork.config.synthetix.susd],
      minIncomingAssetAmounts_: [minIncomingSusdAmount],
      spendAssetAmounts_: [outgoingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output for redeem', async () => {
    const [fundOwner] = fork.accounts;
    const sxagSynth = new StandardToken(sxagAddress, provider);
    const synthetixAdapter = fork.deployment.synthetixAdapter;

    const redeemArgs = synthetixRedeemArgs({
      synths: [sxagAddress],
    });

    const { vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.synthetix.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const amount = await getAssetUnit(sxagSynth);

    await seedAccount({ provider, account: vaultProxy, amount, token: sxagSynth });

    const result = await synthetixAdapter.parseAssetsForAction(vaultProxy, redeemSelector, redeemArgs);

    expect(result).toMatchFunctionOutput(synthetixAdapter.parseAssetsForAction, {
      incomingAssets_: [fork.config.synthetix.susd],
      minIncomingAssetAmounts_: [1],
      spendAssetAmounts_: [amount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [sxagAddress],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const outgoingAsset = fork.config.unsupportedAssets.seth;
    const outgoingAssetAmount = utils.parseEther('1');

    const { vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.synthetix.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const takeOrderArgs = synthetixTakeOrderArgs({
      minIncomingSusdAmount: 123,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const transferArgs = await assetTransferArgs({
      adapter: synthetixAdapter,
      encodedCallArgs: takeOrderArgs,
      selector: takeOrderSelector,
    });

    await expect(synthetixAdapter.takeOrder(vaultProxy, takeOrderSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('does not allow an outgoing asset in the asset universe', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const seth = new StandardToken(fork.config.unsupportedAssets.seth, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Add seth to the asset universe
    await fork.deployment.valueInterpreter.addPrimitives(
      [seth],
      [fork.config.chainlink.ethusd],
      [ChainlinkRateAsset.USD],
    );

    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
        outgoingAsset: seth,
        outgoingAssetAmount: 123,
        provider,
        seedFund: true,
        synthetixAdapter,
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Unallowed synth');
  });

  it('works as expected when called by a fund (synth to synth)', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const incomingAsset = new StandardToken(fork.config.primitives.susd, provider);
    const outgoingAsset = new StandardToken(fork.config.unsupportedAssets.seth, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Load the SynthetixExchange contract
    const synthetixExchanger = new ISynthetixExchanger(synthetixExchangerAddress, provider);

    // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
    await synthetixAssignExchangeDelegate({
      comptrollerProxy,
      delegate: synthetixAdapter,
      fundOwner,
      synthetixDelegateApprovals: fork.config.synthetix.delegateApprovals,
    });

    // Define order params
    const outgoingAssetAmount = utils.parseEther('100');
    const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      sethCurrencyKey,
      susdCurrencyKey,
    );

    // Get incoming asset balance prior to tx
    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and execute Synthetix order
    await seedAccount({ provider, account: vaultProxy, amount: outgoingAssetAmount, token: outgoingAsset });
    await synthetixTakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingSusdAmount: expectedIncomingAssetAmount.mul(99).div(100),
      outgoingAsset,
      outgoingAssetAmount,
      provider,
      synthetixAdapter,
      vaultProxy,
    });

    // Get incoming and outgoing asset balances after the tx
    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    // Assert the expected final token balances of the VaultProxy
    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toBeAroundBigNumber(expectedIncomingAssetAmount, 0.01);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});

describe('redeem', () => {
  it('can only be called via the IntegrationManager', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;

    const { vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.synthetix.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const redeemArgs = synthetixRedeemArgs({
      synths: [fork.config.unsupportedAssets.seth],
    });

    const transferArgs = await assetTransferArgs({
      adapter: synthetixAdapter,
      encodedCallArgs: redeemArgs,
      selector: redeemSelector,
    });

    await expect(synthetixAdapter.redeem(vaultProxy, redeemSelector, transferArgs)).rejects.toBeRevertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('works as expected when called by a fund, multiple synths', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;

    const sxagSynth = new StandardToken(sxagAddress, provider);
    const sxauSynth = new StandardToken(sxauAddress, provider);
    const incomingAsset = new StandardToken(fork.config.primitives.susd, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.synthetix.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const sxagAmount = await getAssetUnit(sxagSynth);
    const sxauAmount = await getAssetUnit(sxauSynth);

    await seedAccount({ provider, account: vaultProxy, amount: sxagAmount, token: sxagSynth });
    await seedAccount({ provider, account: vaultProxy, amount: sxauAmount, token: sxauSynth });

    // Get incoming asset balance prior to tx
    const [preTxIncomingAssetBalance, preTxSxagAssetBalance, preTxSxauAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, sxagSynth, sxauSynth],
    });

    await synthetixRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      signer: fundOwner,
      synthetixAdapter,
      synths: [sxagAddress, sxauAddress],
    });

    // Get incoming and outgoing asset balances after the tx
    const [postTxIncomingAssetBalance, postTxSxagAssetBalance, postTxSxauAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, sxagSynth, sxauSynth],
    });

    expect(preTxSxagAssetBalance).toEqBigNumber(sxagAmount);
    expect(postTxSxagAssetBalance).toEqBigNumber(0);
    expect(preTxSxauAssetBalance).toEqBigNumber(sxauAmount);
    expect(postTxSxauAssetBalance).toEqBigNumber(0);
    expect(preTxIncomingAssetBalance).toEqBigNumber(0);
    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
  });
});
