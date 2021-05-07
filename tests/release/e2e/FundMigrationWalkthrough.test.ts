import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  adapterBlacklistArgs,
  adapterWhitelistArgs,
  assetBlacklistArgs,
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  entranceRateFeeConfigArgs,
  feeManagerConfigArgs,
  managementFeeConfigArgs,
  maxConcentrationArgs,
  performanceFeeConfigArgs,
  policyManagerConfigArgs,
  // ReleaseStatusTypes,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addTrackedAssets,
  buyShares,
  // createMigratedFundConfig,
  createNewFund,
  // Deployment,
  // DeploymentHandlers,
  // deployRelease,
  redeemShares,
  // ReleaseDeploymentConfig,
  // ReleaseDeploymentOutput,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

describe('Walkthrough a fund migration', () => {
  let manager: SignerWithAddress;
  let investor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;
  let vaultProxy: VaultLib;
  let denominationAsset: StandardToken;

  let preMigrationShareBalance: BigNumber;
  // let newComptrollerProxy: ComptrollerLib;

  // let newRelease: Deployment<DeploymentHandlers<ReleaseDeploymentConfig, ReleaseDeploymentOutput>>;

  beforeAll(async () => {
    manager = fork.accounts[1];
    investor = fork.accounts[2];

    denominationAsset = new StandardToken(fork.config.weth, whales.weth);

    // Seed investor with denomination asset
    const denominationAssetSeedAmount = utils.parseUnits('100', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, denominationAssetSeedAmount);
  });

  it('creates a fund', async () => {
    // fees
    const rate = utils.parseEther('0.01');
    const scaledPerSecondRate = convertRateToScaledPerSecondRate(rate);

    const managementFeeSettings = managementFeeConfigArgs(scaledPerSecondRate);
    const performanceFeeSettings = performanceFeeConfigArgs({
      rate: utils.parseEther('0.1'),
      period: 365 * 24 * 60 * 60,
    });
    const entranceRateFeeSettings = entranceRateFeeConfigArgs(utils.parseEther('0.05'));

    const feeManagerConfig = feeManagerConfigArgs({
      fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
      settings: [managementFeeSettings, performanceFeeSettings, entranceRateFeeSettings],
    });

    // policies
    const maxConcentrationSettings = maxConcentrationArgs(utils.parseEther('1'));
    const adapterBlacklistSettings = adapterBlacklistArgs([fork.deployment.compoundAdapter]);
    const adapterWhitelistSettings = adapterWhitelistArgs([
      fork.deployment.kyberAdapter,
      fork.deployment.uniswapV2Adapter,
      fork.deployment.trackedAssetsAdapter,
    ]);
    const assetBlacklistSettings = assetBlacklistArgs([fork.config.primitives.knc]);

    const policyManagerConfig = policyManagerConfigArgs({
      policies: [
        fork.deployment.maxConcentration,
        fork.deployment.adapterBlacklist,
        fork.deployment.adapterWhitelist,
        fork.deployment.assetBlacklist,
      ],
      settings: [maxConcentrationSettings, adapterBlacklistSettings, adapterWhitelistSettings, assetBlacklistSettings],
    });

    const createFundTx = await createNewFund({
      signer: manager,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner: manager,
      denominationAsset,
      feeManagerConfig,
      policyManagerConfig,
    });

    comptrollerProxy = createFundTx.comptrollerProxy;
    vaultProxy = createFundTx.vaultProxy;
  });

  it('buys shares of the fund', async () => {
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [utils.parseEther('1')],
      minSharesAmounts: [utils.parseEther('0.00000000001')],
    });

    const rate = utils.parseEther('0.05');
    const rateDivisor = utils.parseEther('1');
    const expectedFee = utils.parseEther('1').mul(rate).div(rateDivisor.add(rate));

    expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(utils.parseEther('1').sub(expectedFee));
  });

  it('seeds the fund with more assets to bring trackedAssets to 20', async () => {
    const assets = [
      // primitives
      new StandardToken(fork.config.primitives.bat, whales.bat),
      new StandardToken(fork.config.primitives.bnb, whales.bnb),
      new StandardToken(fork.config.primitives.bnt, whales.bnt),
      new StandardToken(fork.config.primitives.comp, whales.comp),
      new StandardToken(fork.config.primitives.dai, whales.dai),
      new StandardToken(fork.config.primitives.link, whales.link),
      new StandardToken(fork.config.primitives.mana, whales.mana),
      new StandardToken(fork.config.primitives.mln, whales.mln),
      new StandardToken(fork.config.primitives.ren, whales.ren),
      new StandardToken(fork.config.primitives.repv2, whales.repv2),
      new StandardToken(fork.config.primitives.susd, whales.susd),
      new StandardToken(fork.config.primitives.uni, whales.uni),
      new StandardToken(fork.config.primitives.usdt, whales.usdt),
      new StandardToken(fork.config.primitives.zrx, whales.zrx),
      // ctokens
      new StandardToken(fork.config.compound.ctokens.ccomp, whales.ccomp),
      new StandardToken(fork.config.compound.ctokens.cdai, whales.cdai),
      new StandardToken(fork.config.compound.ceth, whales.ceth),
      new StandardToken(fork.config.compound.ctokens.cusdc, whales.cusdc),
      new StandardToken(fork.config.compound.ctokens.cuni, whales.cuni),
    ];

    for (const asset of Object.values(assets)) {
      const decimals = await asset.decimals();
      const transferAmount = utils.parseUnits('1', decimals);
      await asset.transfer.args(vaultProxy, transferAmount).send();

      const balance = await asset.balanceOf(vaultProxy);
      expect(balance).toBeGteBigNumber(transferAmount);
    }

    await addTrackedAssets({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner: manager,
      trackedAssetsAdapter: fork.deployment.trackedAssetsAdapter,
      incomingAssets: Object.values(assets),
    });

    expect((await vaultProxy.getTrackedAssets()).length).toBe(20);
  });

  it('redeems some shares', async () => {
    const balance = await vaultProxy.balanceOf(investor);
    const redeemQuantity = balance.div(2);

    await redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemQuantity,
    });

    preMigrationShareBalance = await vaultProxy.balanceOf(investor);
    expect(preMigrationShareBalance).toEqBigNumber(balance.sub(redeemQuantity));
  });

  // it('deploys a new live release', async () => {
  //   newRelease = await deployRelease(fork.config);

  //   await newRelease.fundDeployer.setReleaseStatus(ReleaseStatusTypes.Live);
  //   await fork.deployment.dispatcher.setCurrentFundDeployer(newRelease.fundDeployer);
  // });

  // it('creates a migrated fund on the new release', async () => {
  //   // fees
  //   const managementFeeSettings = managementFeeConfigArgs(utils.parseEther('0.02'));
  //   const performanceFeeSettings = performanceFeeConfigArgs({
  //     rate: utils.parseEther('0.1'),
  //     period: 30 * 24 * 60 * 60,
  //   });

  //   const feeManagerConfig = feeManagerConfigArgs({
  //     fees: [newRelease.managementFee, newRelease.performanceFee],
  //     settings: [managementFeeSettings, performanceFeeSettings],
  //   });

  //   // policies
  //   const adapterBlacklistSettings = adapterBlacklistArgs([newRelease.compoundAdapter]);
  //   const adapterWhitelistSettings = adapterWhitelistArgs([
  //     newRelease.kyberAdapter,
  //     newRelease.uniswapV2Adapter,
  //     newRelease.trackedAssetsAdapter,
  //   ]);
  //   const assetBlacklistSettings = assetBlacklistArgs([fork.config.primitives.knc]);

  //   const policyManagerConfig = policyManagerConfigArgs({
  //     policies: [newRelease.adapterBlacklist, newRelease.adapterWhitelist, newRelease.assetBlacklist],
  //     settings: [adapterBlacklistSettings, adapterWhitelistSettings, assetBlacklistSettings],
  //   });

  //   const createMigratedFundTx = await createMigratedFundConfig({
  //     signer: manager,
  //     fundDeployer: newRelease.fundDeployer,
  //     denominationAsset,
  //     feeManagerConfigData: feeManagerConfig,
  //     policyManagerConfigData: policyManagerConfig,
  //   });

  //   newComptrollerProxy = createMigratedFundTx.comptrollerProxy;

  //   expect(createMigratedFundTx.receipt).toCostLessThan(`317000`);
  // });

  // it('signals a fund migration', async () => {
  //   const migrationSignal = await newRelease.fundDeployer
  //     .connect(manager)
  //     .signalMigration(vaultProxy, newComptrollerProxy);

  //   expect(migrationSignal).toCostLessThan(`68000`);

  //   const getPendingComptrollerProxyCreatorCall = await newRelease.fundDeployer.getPendingComptrollerProxyCreator(
  //     newComptrollerProxy,
  //   );

  //   expect(getPendingComptrollerProxyCreatorCall).toMatchAddress(manager);
  // });

  // it('executes the fund migration', async () => {
  //   // Warp to migratable time
  //   const migrationTimelock = await fork.deployment.dispatcher.getMigrationTimelock();
  //   await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

  //   await newRelease.fundDeployer.connect(manager).executeMigration(vaultProxy);
  // });

  // it('checks the number of shares post migration', async () => {
  //   const postMigrationShareNumbers = await vaultProxy.balanceOf(investor);

  //   expect(postMigrationShareNumbers).toEqBigNumber(preMigrationShareBalance);
  // });
});
