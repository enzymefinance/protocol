import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  guaranteedRedemptionArgs,
  ISynthetixAddressResolver,
  ISynthetixExchanger,
  policyManagerConfigArgs,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  buyShares,
  createNewFund,
  getAssetBalances,
  redeemShares,
  synthetixAssignExchangeDelegate,
  synthetixResolveAddress,
  synthetixTakeOrder,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function warpBeyondWaitingPeriod() {
  // TODO: get waiting period dynamically
  const waitingPeriod = 360; // As of Jan 9, 2021
  await provider.send('evm_increaseTime', [waitingPeriod]);
  await provider.send('evm_mine', []);
}

describe("Walkthrough a synth-based fund's lifecycle", () => {
  const sbtcCurrencyKey = utils.formatBytes32String('sBTC');
  const susdCurrencyKey = utils.formatBytes32String('sUSD');

  let manager: SignerWithAddress;
  let investor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;
  let vaultProxy: VaultLib;
  let denominationAsset: StandardToken;

  let susd: StandardToken;
  let sbtc: StandardToken;
  let synthetixExchanger: ISynthetixExchanger;

  beforeAll(async () => {
    manager = fork.accounts[0];
    investor = fork.accounts[1];

    susd = new StandardToken(fork.config.primitives.susd, whales.susd);
    sbtc = new StandardToken(fork.config.synthetix.synths.sbtc, provider);
    denominationAsset = susd;

    const exchangerAddress = await synthetixResolveAddress({
      addressResolver: new ISynthetixAddressResolver(fork.config.synthetix.addressResolver, provider),
      name: 'Exchanger',
    });
    synthetixExchanger = new ISynthetixExchanger(exchangerAddress, provider);

    // Seed investor with denomination asset
    const denominationAssetSeedAmount = utils.parseUnits('1000', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, denominationAssetSeedAmount);
  });

  it('creates a new fund with sUSD as its denomination asset', async () => {
    // TODO: add fees?

    // Set GuaranteedRedemption policy with redemption window starting immediately
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [fork.deployment.guaranteedRedemption],
      settings: [
        guaranteedRedemptionArgs({
          duration: [100],
          startTimestamp: (await provider.getBlock('latest')).timestamp,
        }),
      ],
    });

    const createFundRes = await createNewFund({
      signer: manager,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner: manager,
      denominationAsset,
      policyManagerConfig,
    });

    comptrollerProxy = createFundRes.comptrollerProxy;
    vaultProxy = createFundRes.vaultProxy;
  });

  it('buys shares of a fund', async () => {
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [utils.parseEther('100')],
      minSharesAmounts: [utils.parseEther('0.00000000001')],
    });
  });

  it('attempts to trade on Synthetix within the redemption window', async () => {
    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        synthetixAdapter: fork.deployment.synthetixAdapter,
        outgoingAsset: susd,
        outgoingAssetAmount: utils.parseEther('10'),
        incomingAsset: sbtc,
        minIncomingAssetAmount: '1',
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: GUARANTEED_REDEMPTION');
  });

  it('warps beyond the redemption window', async () => {
    const duration = (await fork.deployment.guaranteedRedemption.getRedemptionWindowForFund(comptrollerProxy)).duration;
    await provider.send('evm_increaseTime', [duration.toNumber()]);
    await provider.send('evm_mine', []);
  });

  it('attempts to trade on Synthetix without delegating the SynthetixAdapter to exchangeOnBehalf of VaultProxy', async () => {
    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        synthetixAdapter: fork.deployment.synthetixAdapter,
        outgoingAsset: susd,
        outgoingAssetAmount: utils.parseEther('10'),
        incomingAsset: sbtc,
        minIncomingAssetAmount: '1',
      }),
    ).rejects.toBeRevertedWith('Not approved to act on behalf');
  });

  it('designates the SynthetixAdapter to exchangeOnBehalf of VaultProxy', async () => {
    await synthetixAssignExchangeDelegate({
      addressResolver: new ISynthetixAddressResolver(fork.config.synthetix.addressResolver, provider),
      comptrollerProxy,
      fundOwner: manager,
      delegate: fork.deployment.synthetixAdapter,
    });
  });

  it('trades on Synthetix after the redemption window has elapsed', async () => {
    const outgoingAsset = susd;
    const incomingAsset = sbtc;
    const outgoingAssetAmount = utils.parseEther('10');
    const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      susdCurrencyKey,
      sbtcCurrencyKey,
    );

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    await synthetixTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner: manager,
      synthetixAdapter: fork.deployment.synthetixAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: expectedIncomingAssetAmount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));
  });

  it('trades again on Synthetix with the same assets', async () => {
    const outgoingAsset = susd;
    const incomingAsset = sbtc;
    const outgoingAssetAmount = utils.parseEther('10');
    const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      susdCurrencyKey,
      sbtcCurrencyKey,
    );

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    await synthetixTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner: manager,
      synthetixAdapter: fork.deployment.synthetixAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: expectedIncomingAssetAmount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));
  });

  it('attempts (and fails) to trade on Synthetix with the same assets in reverse', async () => {
    const outgoingAsset = sbtc;
    const incomingAsset = susd;
    const outgoingAssetAmount = (await outgoingAsset.balanceOf(vaultProxy)).div(10);

    const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      sbtcCurrencyKey,
      susdCurrencyKey,
    );

    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner: manager,
        synthetixAdapter: fork.deployment.synthetixAdapter,
        outgoingAsset,
        outgoingAssetAmount,
        incomingAsset,
        minIncomingAssetAmount: expectedIncomingAssetAmount,
      }),
    ).rejects.toBeRevertedWith('Cannot settle during waiting period');
  });

  it('warps beyond the waiting period and trades on Synthetix with the same assets in reverse', async () => {
    await warpBeyondWaitingPeriod();

    const outgoingAsset = sbtc;
    const incomingAsset = susd;
    const outgoingAssetAmount = (await outgoingAsset.balanceOf(vaultProxy)).div(10);

    const { 0: expectedIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      sbtcCurrencyKey,
      susdCurrencyKey,
    );

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    await synthetixTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner: manager,
      synthetixAdapter: fork.deployment.synthetixAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount: expectedIncomingAssetAmount,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    expect(postTxIncomingAssetBalance).toEqBigNumber(preTxIncomingAssetBalance.add(expectedIncomingAssetAmount));
    expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(outgoingAssetAmount));
  });

  it('investor attempts (and fails) to redeem shares immediately after the Synthetix trade', async () => {
    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith('Cannot settle Synth');
  });

  it('investor redeems all shares after the waiting period', async () => {
    await warpBeyondWaitingPeriod();

    await redeemShares({
      comptrollerProxy,
      signer: investor,
    });
  });
});
