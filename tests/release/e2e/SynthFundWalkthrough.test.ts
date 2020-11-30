import { EthereumTestnetProvider, SignerWithAddress } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  guaranteedRedemptionArgs,
  ISynthetixExchanger,
  policyManagerConfigArgs,
  StandardToken,
  VaultLib,
} from '@melonproject/protocol';
import {
  buyShares,
  createNewFund,
  defaultForkDeployment,
  ForkReleaseDeploymentConfig,
  redeemShares,
  synthetixAssignExchangeDelegate,
  synthetixResolveAddress,
  synthetixTakeOrder,
} from '@melonproject/testutils';
import { utils } from 'ethers';

export type Snapshot = ReturnType<typeof snapshot> extends Promise<infer T> ? T : never;

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe("Walkthrough a synth-based fund's lifecycle", () => {
  const sbtcCurrencyKey = utils.formatBytes32String('sBTC');
  const susdCurrencyKey = utils.formatBytes32String('sUSD');

  let config: ForkReleaseDeploymentConfig;
  let deployment: Snapshot['deployment'];

  let manager: SignerWithAddress;
  let investor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;
  let vaultProxy: VaultLib;
  let denominationAsset: StandardToken;

  let susd: StandardToken;
  let sbtc: StandardToken;
  let synthetixExchanger: ISynthetixExchanger;

  beforeAll(async () => {
    const forkSnapshot = await provider.snapshot(snapshot);

    manager = forkSnapshot.accounts[0];
    investor = forkSnapshot.accounts[1];
    deployment = forkSnapshot.deployment;
    config = forkSnapshot.config;

    susd = config.tokens.susd;
    sbtc = new StandardToken(config.derivatives.synthetix.sbtc, provider);

    const exchangerAddress = await synthetixResolveAddress({
      addressResolver: config.integratees.synthetix.addressResolver,
      name: 'Exchanger',
    });
    synthetixExchanger = new ISynthetixExchanger(exchangerAddress, provider);
  });

  it('creates a new fund with sUSD as its denomination asset', async () => {
    denominationAsset = susd;

    // TODO: add fees?

    // Set GuaranteedRedemption policy with redemption window starting immediately
    const policyManagerConfig = policyManagerConfigArgs({
      policies: [deployment.guaranteedRedemption],
      settings: [
        guaranteedRedemptionArgs({
          startTimestamp: (await provider.getBlock('latest')).timestamp,
          duration: [100],
        }),
      ],
    });

    const createFundRes = await createNewFund({
      signer: manager,
      fundDeployer: deployment.fundDeployer,
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

  it('calculates the GAV of the fund with only the denomination asset', async () => {
    const calcGavTx = await comptrollerProxy.calcGav();

    // Bumped from 65991
    expect(calcGavTx).toCostLessThan(`66100`);
  });

  it('attempts to trade on Synthetix within the redemption window', async () => {
    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        synthetixAdapter: deployment.synthetixAdapter,
        outgoingAsset: susd,
        outgoingAssetAmount: utils.parseEther('10'),
        incomingAsset: sbtc,
        minIncomingAssetAmount: '1',
      }),
    ).rejects.toBeRevertedWith('Rule evaluated to false: GUARANTEED_REDEMPTION');
  });

  it('warps beyond the redemption window', async () => {
    const duration = (await deployment.guaranteedRedemption.getRedemptionWindowForFund(comptrollerProxy)).duration;
    await provider.send('evm_increaseTime', [duration.toNumber()]);
    await provider.send('evm_mine', []);
  });

  it('attempts to trade on Synthetix without delegating the SynthetixAdapter to exchangeOnBehalf of VaultProxy', async () => {
    await expect(
      synthetixTakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager: deployment.integrationManager,
        fundOwner: manager,
        synthetixAdapter: deployment.synthetixAdapter,
        outgoingAsset: susd,
        outgoingAssetAmount: utils.parseEther('10'),
        incomingAsset: sbtc,
        minIncomingAssetAmount: '1',
      }),
    ).rejects.toBeRevertedWith('Not approved to act on behalf');
  });

  it('designates the SynthetixAdapter to exchangeOnBehalf of VaultProxy', async () => {
    await synthetixAssignExchangeDelegate({
      comptrollerProxy,
      addressResolver: config.integratees.synthetix.addressResolver,
      fundOwner: manager,
      delegate: deployment.synthetixAdapter,
    });
  });

  it('trades on Synthetix after the redemption window has elapsed', async () => {
    const outgoingAsset = susd;
    const incomingAsset = sbtc;
    const outgoingAssetAmount = utils.parseEther('10');
    const { 0: minIncomingAssetAmount } = await synthetixExchanger.getAmountsForExchange(
      outgoingAssetAmount,
      susdCurrencyKey,
      sbtcCurrencyKey,
    );

    const takeOrder = await synthetixTakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager: deployment.integrationManager,
      fundOwner: manager,
      synthetixAdapter: deployment.synthetixAdapter,
      outgoingAsset,
      outgoingAssetAmount,
      incomingAsset,
      minIncomingAssetAmount,
    });

    // Bumped from 691889
    expect(takeOrder).toCostLessThan(692000);

    const balance = await incomingAsset.balanceOf(vaultProxy);
    expect(balance).toEqBigNumber(minIncomingAssetAmount);
  });

  it('investor attempts to redeem shares immediately after the Synthetix trade', async () => {
    await expect(
      redeemShares({
        comptrollerProxy,
        signer: investor,
      }),
    ).rejects.toBeRevertedWith('Cannot transfer during waiting period');
  });

  it('warps beyond the Synthetix waiting period', async () => {
    // TODO: get this dynamically from synthetix
    const waitingPeriod = 180;
    await provider.send('evm_increaseTime', [waitingPeriod]);
    await provider.send('evm_mine', []);
  });

  it('investor redeems all shares', async () => {
    const redeemed = await redeemShares({
      comptrollerProxy,
      signer: investor,
    });

    // Bumped from 310925
    expect(redeemed).toCostLessThan(311000);
  });
});
