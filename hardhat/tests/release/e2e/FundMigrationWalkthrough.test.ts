import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  entranceRateBurnFeeConfigArgs,
  feeManagerConfigArgs,
  ITestStandardToken,
  managementFeeConfigArgs,
  managementFeeConvertRateToScaledPerSecondRate,
  performanceFeeConfigArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  buyShares,
  // createMigrationRequest,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  // Deployment,
  // DeploymentHandlers,
  // deployRelease,
  redeemSharesInKind,
  setAccountBalance,
  // ReleaseDeploymentConfig,
  // ReleaseDeploymentOutput,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);
const ONE_HUNDRED_PERCENT = BigNumber.from(10000);

describe('Walkthrough a fund migration', () => {
  let manager: SignerWithAddress;
  let investor: SignerWithAddress;
  let comptrollerProxy: ComptrollerLib;
  let vaultProxy: VaultLib;
  let denominationAsset: ITestStandardToken;

  let preMigrationShareBalance: BigNumber;
  // let newComptrollerProxy: ComptrollerLib;

  // let newRelease: Deployment<DeploymentHandlers<ReleaseDeploymentConfig, ReleaseDeploymentOutput>>;

  beforeAll(async () => {
    fork = await deployProtocolFixture();

    manager = fork.accounts[1];
    investor = fork.accounts[2];

    denominationAsset = new ITestStandardToken(fork.config.weth, provider);

    await setAccountBalance({
      account: investor,
      amount: (await getAssetUnit(denominationAsset)).mul(100),
      provider,
      token: denominationAsset,
    });
  });

  it('creates a fund', async () => {
    // fees
    const scaledPerSecondRate = managementFeeConvertRateToScaledPerSecondRate(utils.parseEther('0.01'));

    const managementFeeSettings = managementFeeConfigArgs({ scaledPerSecondRate });
    const performanceFeeSettings = performanceFeeConfigArgs({
      rate: TEN_PERCENT,
    });
    const entranceRateBurnFeeSettings = entranceRateBurnFeeConfigArgs({ rate: FIVE_PERCENT });

    const feeManagerConfig = feeManagerConfigArgs({
      fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
      settings: [managementFeeSettings, performanceFeeSettings, entranceRateBurnFeeSettings],
    });

    // TODO: add policies

    const createFundTx = await createNewFund({
      denominationAsset,
      feeManagerConfig,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner: manager,
      signer: manager,
    });

    comptrollerProxy = createFundTx.comptrollerProxy;
    vaultProxy = createFundTx.vaultProxy;
  });

  it('buys shares of the fund', async () => {
    await buyShares({
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      provider,
    });

    const rate = FIVE_PERCENT;
    const rateDivisor = ONE_HUNDRED_PERCENT;
    const expectedFee = utils.parseEther('1').mul(rate).div(rateDivisor);

    expect(await vaultProxy.balanceOf(investor)).toBeGteBigNumber(utils.parseEther('1').sub(expectedFee));
  });

  it('seeds the fund with more assets to bring trackedAssets to 20', async () => {
    const assets = [
      // primitives
      new ITestStandardToken(fork.config.primitives.bat, provider),
      new ITestStandardToken(fork.config.primitives.bnb, provider),
      new ITestStandardToken(fork.config.primitives.bnt, provider),
      new ITestStandardToken(fork.config.primitives.comp, provider),
      new ITestStandardToken(fork.config.primitives.dai, provider),
      new ITestStandardToken(fork.config.primitives.link, provider),
      new ITestStandardToken(fork.config.primitives.mana, provider),
      new ITestStandardToken(fork.config.primitives.mln, provider),
      new ITestStandardToken(fork.config.primitives.ren, provider),
      new ITestStandardToken(fork.config.primitives.rep, provider),
      new ITestStandardToken(fork.config.primitives.susd, provider),
      new ITestStandardToken(fork.config.primitives.uni, provider),
      new ITestStandardToken(fork.config.primitives.usdt, provider),
      new ITestStandardToken(fork.config.primitives.zrx, provider),
      // ctokens
      new ITestStandardToken(fork.config.compoundV2.ctokens.ccomp, provider),
      new ITestStandardToken(fork.config.compoundV2.ctokens.cdai, provider),
      new ITestStandardToken(fork.config.compoundV2.ceth, provider),
      new ITestStandardToken(fork.config.compoundV2.ctokens.cusdc, provider),
      new ITestStandardToken(fork.config.compoundV2.ctokens.cuni, provider),
    ];

    await addNewAssetsToFund({
      provider,
      assets,
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      signer: manager,
      amounts: await Promise.all(assets.map((asset) => getAssetUnit(asset))),
    });

    expect((await vaultProxy.getTrackedAssets()).length).toBe(20);
  });

  it('redeems some shares', async () => {
    const balance = await vaultProxy.balanceOf(investor);
    const redeemQuantity = balance.div(2);

    await redeemSharesInKind({
      comptrollerProxy,
      quantity: redeemQuantity,
      signer: investor,
    });

    preMigrationShareBalance = await vaultProxy.balanceOf(investor);
    expect(preMigrationShareBalance).toEqBigNumber(balance.sub(redeemQuantity));
  });

  // it('deploys a new live release', async () => {
  //   newRelease = await deployRelease(fork.config);

  //   await newRelease.fundDeployer.setReleaseLive();
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
  //     newRelease.uniswapV2Adapter,
  //     newRelease.trackedAssetsAdapter,
  //   ]);
  //   const assetBlacklistSettings = assetBlacklistArgs([fork.config.primitives.knc]);

  //   const policyManagerConfig = policyManagerConfigArgs({
  //     policies: [newRelease.adapterBlacklist, newRelease.adapterWhitelist, newRelease.assetBlacklist],
  //     settings: [adapterBlacklistSettings, adapterWhitelistSettings, assetBlacklistSettings],
  //   });

  //   const createMigratedFundTx = await createMigrationRequest({
  //     signer: manager,
  //     fundDeployer: newRelease.fundDeployer,
  //     denominationAsset,
  //     feeManagerConfigData: feeManagerConfig,
  //     policyManagerConfigData: policyManagerConfig,
  //   });

  //   newComptrollerProxy = createMigratedFundTx.comptrollerProxy;

  //   expect(createMigratedFundTx.receipt).toMatchInlineGasSnapshot(`317000`);
  // });

  // it('signals a fund migration', async () => {
  //   const migrationSignal = await newRelease.fundDeployer
  //     .connect(manager)
  //     .signalMigration(vaultProxy, newComptrollerProxy);

  //   expect(migrationSignal).toMatchInlineGasSnapshot(`68000`);

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
