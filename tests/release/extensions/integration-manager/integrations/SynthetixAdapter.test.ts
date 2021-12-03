import { randomAddress } from '@enzymefinance/ethers';
import {
  assetTransferArgs,
  ISynthetixAddressResolver,
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
  synthetixAssignExchangeDelegate,
  synthetixRedeem,
  synthetixResolveAddress,
  synthetixTakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const sbtcCurrencyKey = utils.formatBytes32String('sBTC');
const susdCurrencyKey = utils.formatBytes32String('sUSD');

// Address of deprecated synths that can potentially be removed from the asset universe
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

    const synthetixPriceFeedResult = await synthetixAdapter.getSynthetixPriceFeed();
    expect(synthetixPriceFeedResult).toMatchAddress(fork.deployment.synthetixPriceFeed);

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
      incomingAsset: fork.config.synthetix.synths.sbtc,
      minIncomingAssetAmount: 1,
      outgoingAsset: fork.config.synthetix.susd,
      outgoingAssetAmount: 1,
    });

    await expect(
      synthetixAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), args),
    ).rejects.toBeRevertedWith('_selector invalid');

    await expect(synthetixAdapter.parseAssetsForAction(randomAddress(), takeOrderSelector, args)).resolves.toBeTruthy();
  });

  it('generates expected output for take order', async () => {
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const incomingAsset = fork.config.synthetix.synths.sbtc;
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = fork.config.synthetix.susd;
    const outgoingAssetAmount = utils.parseEther('1');

    const takeOrderArgs = synthetixTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
    });

    const result = await synthetixAdapter.parseAssetsForAction(randomAddress(), takeOrderSelector, takeOrderArgs);

    expect(result).toMatchFunctionOutput(synthetixAdapter.parseAssetsForAction, {
      incomingAssets_: [incomingAsset],
      minIncomingAssetAmounts_: [minIncomingAssetAmount],
      spendAssetAmounts_: [outgoingAssetAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.None,
      spendAssets_: [outgoingAsset],
    });
  });

  it('generates expected output for redeem', async () => {
    const [fundOwner] = fork.accounts;
    const sxagSynth = new StandardToken(sxagAddress, whales.sxag);
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

    // All synths have 18 decimals
    const seedAmount = utils.parseUnits('1', 18);

    await sxagSynth.transfer(vaultProxy, seedAmount);

    const result = await synthetixAdapter.parseAssetsForAction(vaultProxy, redeemSelector, redeemArgs);

    expect(result).toMatchFunctionOutput(synthetixAdapter.parseAssetsForAction, {
      incomingAssets_: [fork.config.synthetix.susd],
      minIncomingAssetAmounts_: [1],
      spendAssetAmounts_: [seedAmount],
      spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
      spendAssets_: [sxagAddress],
    });
  });
});

describe('takeOrder', () => {
  it('can only be called via the IntegrationManager', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const incomingAsset = fork.config.synthetix.synths.sbtc;
    const minIncomingAssetAmount = utils.parseEther('1');
    const outgoingAsset = fork.config.synthetix.susd;
    const outgoingAssetAmount = utils.parseEther('1');

    const { vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.synthetix.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    const takeOrderArgs = synthetixTakeOrderArgs({
      incomingAsset,
      minIncomingAssetAmount,
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

  it('works as expected when called by a fund (synth to synth)', async () => {
    const [fundOwner] = fork.accounts;
    const synthetixAdapter = fork.deployment.synthetixAdapter;
    const synthetixAddressResolver = new ISynthetixAddressResolver(fork.config.synthetix.addressResolver, provider);
    const outgoingAsset = new StandardToken(fork.config.primitives.susd, whales.susd);
    const incomingAsset = new StandardToken(fork.config.synthetix.synths.sbtc, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Load the SynthetixExchange contract
    const exchangerAddress = await synthetixResolveAddress({
      addressResolver: synthetixAddressResolver,
      name: 'Exchanger',
    });
    const synthetixExchanger = new ISynthetixExchanger(exchangerAddress, provider);

    // Delegate SynthetixAdapter to exchangeOnBehalf of VaultProxy
    await synthetixAssignExchangeDelegate({
      addressResolver: synthetixAddressResolver,
      comptrollerProxy,
      delegate: synthetixAdapter,
      fundOwner,
    });

    // Define order params
    const outgoingAssetAmount = utils.parseEther('100');
    const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      susdCurrencyKey,
      sbtcCurrencyKey,
    );

    // Get incoming asset balance prior to tx
    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and execute Synthetix order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
    await synthetixTakeOrder({
      comptrollerProxy,
      fundOwner,
      incomingAsset,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAssetAmount: expectedIncomingAssetAmount,
      outgoingAsset,
      outgoingAssetAmount,
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
    expect(incomingAssetAmount).toEqBigNumber(expectedIncomingAssetAmount);
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
      synths: [fork.config.synthetix.synths.sbtc],
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

    const sxagSynth = new StandardToken(sxagAddress, whales.sxag);
    const sxauSynth = new StandardToken(sxauAddress, whales.sxau);
    const incomingAsset = new StandardToken(fork.config.primitives.susd, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.synthetix.susd, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fork.deployer,
    });

    // All synths have 18 decimals
    const seedAmount = utils.parseUnits('1', 18);

    await sxagSynth.transfer(vaultProxy, seedAmount);
    await sxauSynth.transfer(vaultProxy, seedAmount);

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

    expect(preTxSxagAssetBalance).toEqBigNumber(seedAmount);
    expect(postTxSxagAssetBalance).toEqBigNumber(0);
    expect(preTxSxauAssetBalance).toEqBigNumber(seedAmount);
    expect(postTxSxauAssetBalance).toEqBigNumber(0);
    expect(preTxIncomingAssetBalance).toEqBigNumber(0);
    expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
  });
});
