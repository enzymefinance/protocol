import { SignerWithAddress } from '@crestproject/crestproject';
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
  ForkDeployment,
  loadForkDeployment,
  mainnetWhales,
  redeemShares,
  // ReleaseDeploymentConfig,
  // ReleaseDeploymentOutput,
  unlockWhales,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';
import hre from 'hardhat';

// const gasAssertionTolerance = 0.03; // 3%
let fork: ForkDeployment;
const whales: Record<string, SignerWithAddress> = {};

beforeAll(async () => {
  // Denomination asset
  whales.weth = ((await hre.ethers.getSigner(mainnetWhales.weth)) as any) as SignerWithAddress;

  // Primitives
  whales.bat = ((await hre.ethers.getSigner(mainnetWhales.bat)) as any) as SignerWithAddress;
  whales.bnb = ((await hre.ethers.getSigner(mainnetWhales.bnb)) as any) as SignerWithAddress;
  whales.bnt = ((await hre.ethers.getSigner(mainnetWhales.bnt)) as any) as SignerWithAddress;
  whales.comp = ((await hre.ethers.getSigner(mainnetWhales.comp)) as any) as SignerWithAddress;
  whales.dai = ((await hre.ethers.getSigner(mainnetWhales.dai)) as any) as SignerWithAddress;
  whales.link = ((await hre.ethers.getSigner(mainnetWhales.link)) as any) as SignerWithAddress;
  whales.mana = ((await hre.ethers.getSigner(mainnetWhales.mana)) as any) as SignerWithAddress;
  whales.mln = ((await hre.ethers.getSigner(mainnetWhales.mln)) as any) as SignerWithAddress;
  whales.ren = ((await hre.ethers.getSigner(mainnetWhales.ren)) as any) as SignerWithAddress;
  whales.rep = ((await hre.ethers.getSigner(mainnetWhales.rep)) as any) as SignerWithAddress;
  whales.susd = ((await hre.ethers.getSigner(mainnetWhales.susd)) as any) as SignerWithAddress;
  whales.uni = ((await hre.ethers.getSigner(mainnetWhales.uni)) as any) as SignerWithAddress;
  whales.usdt = ((await hre.ethers.getSigner(mainnetWhales.usdt)) as any) as SignerWithAddress;
  whales.zrx = ((await hre.ethers.getSigner(mainnetWhales.zrx)) as any) as SignerWithAddress;

  // Compound tokens
  whales.ccomp = ((await hre.ethers.getSigner(mainnetWhales.ccomp)) as any) as SignerWithAddress;
  whales.cdai = ((await hre.ethers.getSigner(mainnetWhales.cdai)) as any) as SignerWithAddress;
  whales.ceth = ((await hre.ethers.getSigner(mainnetWhales.ceth)) as any) as SignerWithAddress;
  whales.cusdc = ((await hre.ethers.getSigner(mainnetWhales.cusdc)) as any) as SignerWithAddress;
  whales.cuni = ((await hre.ethers.getSigner(mainnetWhales.cuni)) as any) as SignerWithAddress;

  await unlockWhales({
    provider: hre.ethers.provider,
    whales: Object.values(whales),
  });
});

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
    fork = await loadForkDeployment();

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
      fees: [fork.deployment.ManagementFee, fork.deployment.PerformanceFee, fork.deployment.EntranceRateBurnFee],
      settings: [managementFeeSettings, performanceFeeSettings, entranceRateFeeSettings],
    });

    // policies
    const maxConcentrationSettings = maxConcentrationArgs(utils.parseEther('1'));
    const adapterBlacklistSettings = adapterBlacklistArgs([fork.deployment.CompoundAdapter]);
    const adapterWhitelistSettings = adapterWhitelistArgs([
      fork.deployment.KyberAdapter,
      fork.deployment.UniswapV2Adapter,
      fork.deployment.TrackedAssetsAdapter,
      fork.deployment.ChaiAdapter,
    ]);
    const assetBlacklistSettings = assetBlacklistArgs([fork.config.primitives.knc]);

    const policyManagerConfig = policyManagerConfigArgs({
      policies: [
        fork.deployment.MaxConcentration,
        fork.deployment.AdapterBlacklist,
        fork.deployment.AdapterWhitelist,
        fork.deployment.AssetBlacklist,
      ],
      settings: [maxConcentrationSettings, adapterBlacklistSettings, adapterWhitelistSettings, assetBlacklistSettings],
    });

    const createFundTx = await createNewFund({
      signer: manager,
      fundDeployer: fork.deployment.FundDeployer,
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
      new StandardToken(fork.config.primitives.rep, whales.rep),
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
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner: manager,
      trackedAssetsAdapter: fork.deployment.TrackedAssetsAdapter,
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
  //   await fork.deployment.Dispatcher.setCurrentFundDeployer(newRelease.fundDeployer);
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
  //     newRelease.chaiAdapter,
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

  //   expect(createMigratedFundTx.receipt).toCostLessThan(`317000`, gasAssertionTolerance);
  // });

  // it('signals a fund migration', async () => {
  //   const migrationSignal = await newRelease.fundDeployer
  //     .connect(manager)
  //     .signalMigration(vaultProxy, newComptrollerProxy);

  //   expect(migrationSignal).toCostLessThan(`68000`, gasAssertionTolerance);

  //   const getPendingComptrollerProxyCreatorCall = await newRelease.fundDeployer.getPendingComptrollerProxyCreator(
  //     newComptrollerProxy,
  //   );

  //   expect(getPendingComptrollerProxyCreatorCall).toMatchAddress(manager);
  // });

  // it('executes the fund migration', async () => {
  //   // Warp to migratable time
  //   const migrationTimelock = await fork.deployment.Dispatcher.getMigrationTimelock();
  //   await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

  //   await newRelease.fundDeployer.connect(manager).executeMigration(vaultProxy);
  // });

  // it('checks the number of shares post migration', async () => {
  //   const postMigrationShareNumbers = await vaultProxy.balanceOf(investor);

  //   expect(postMigrationShareNumbers).toEqBigNumber(preMigrationShareBalance);
  // });
});
