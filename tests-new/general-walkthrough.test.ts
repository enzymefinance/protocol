import { ethers } from 'ethers';
import { Registry } from './contracts/Registry';
import { FundFactory } from './contracts/FundFactory';
import { SharesFactory } from './contracts/SharesFactory';
import { BuidlerProvider } from 'crestproject';
import { PolicyManagerFactory } from './contracts/PolicyManagerFactory';
import { VaultFactory } from './contracts/VaultFactory';
import { FeeManagerFactory } from './contracts/FeeManagerFactory';
import { Engine } from './contracts/Engine';
import { PreminedToken } from './contracts/PreminedToken';
import { SharesRequestor } from './contracts/SharesRequestor';
import { ValueInterpreter } from './contracts/ValueInterpreter';
import { WETH } from './contracts/WETH';
import { PriceTolerance } from './contracts/PriceTolerance';
import { AssetBlacklist } from './contracts/AssetBlacklist';
import { AssetWhitelist } from './contracts/AssetWhitelist';
import { MaxConcentration } from './contracts/MaxConcentration';
import { MaxPositions } from './contracts/MaxPositions';
import { UserWhitelist } from './contracts/UserWhitelist';
import { PerformanceFee } from './contracts/PerformanceFee';
import { ManagementFee } from './contracts/ManagementFee';
import { EngineAdapter } from './contracts/EngineAdapter';

async function deploy(provider: BuidlerProvider) {
  const signer = provider.getSigner(0);
  const deployer = await signer.getAddress();
  const mtc = await provider.getSigner(1).getAddress();
  const mgm = await provider.getSigner(2).getAddress();

  const weth = await WETH.deploy(signer);
  const mln = await PreminedToken.deploy(signer, 'MLN', 18, 'Melon');
  const registry = await Registry.deploy(signer, mtc, mgm);
  await registry.setMlnToken(mln.address);
  await registry.setNativeAsset(weth.address);

  const engine = await Engine.deploy(signer, 0, registry.address);

  const [
    sharesFactory,
    policyManagerFactory,
    vaultFactory,
    feeManagerFactory,
  ] = await Promise.all([
    SharesFactory.deploy(signer),
    PolicyManagerFactory.deploy(signer),
    VaultFactory.deploy(signer),
    FeeManagerFactory.deploy(signer),
  ]);

  const fundFactory = await FundFactory.deploy(
    signer,
    feeManagerFactory.address,
    sharesFactory.address,
    vaultFactory.address,
    policyManagerFactory.address,
    registry.address,
  );

  const [sharesRequestor, valueInterpreter] = await Promise.all([
    SharesRequestor.deploy(signer, registry.address),
    ValueInterpreter.deploy(signer, registry.address),
  ]);

  const [
    userWhitelist,
    priceTolerance,
    assetBlackList,
    assetWhiteList,
    maxPositions,
    maxConcentration,
  ] = await Promise.all([
    UserWhitelist.deploy(signer, registry.address),
    PriceTolerance.deploy(signer, registry.address),
    AssetBlacklist.deploy(signer, registry.address),
    AssetWhitelist.deploy(signer, registry.address),
    MaxPositions.deploy(signer, registry.address),
    MaxConcentration.deploy(signer, registry.address),
  ]);

  await Promise.all([
    registry.registerPolicy(priceTolerance.address),
    registry.registerPolicy(assetBlackList.address),
    registry.registerPolicy(assetWhiteList.address),
    registry.registerPolicy(userWhitelist.address),
    registry.registerPolicy(maxPositions.address),
    registry.registerPolicy(maxConcentration.address),
  ]);

  const [performanceFee, managementFee] = await Promise.all([
    PerformanceFee.deploy(signer),
    ManagementFee.deploy(signer),
  ]);

  await Promise.all([
    registry.registerFee(performanceFee.address),
    registry.registerFee(managementFee.address),
  ]);

  const [engineAdapter] = await Promise.all([
    EngineAdapter.deploy(signer, registry.address, engine.address),
  ]);

  await Promise.all([
    registry.registerIntegrationAdapter(engineAdapter.address),
  ]);

  return {
    registry,
    engine,
    sharesFactory,
    policyManagerFactory,
    vaultFactory,
    feeManagerFactory,
    fundFactory,
    valueInterpreter,
    sharesRequestor,
    userWhitelist,
    priceTolerance,
    assetBlackList,
    assetWhiteList,
    maxPositions,
    maxConcentration,
    performanceFee,
    managementFee,
    weth,
    mln,
    deployer,
    mtc,
    mgm,
  };
}

describe('deployment', () => {
  it('deploys the registry', async () => {
    const { registry, deployer, mtc, mgm, mln } = await provider.snapshot(
      deploy,
    );

    const expectedBalance = ethers.utils.parseEther('1000000');
    await expect(mln.balanceOf(deployer)).resolves.toEqBigNumber(
      expectedBalance,
    );

    await expect(registry.MTC()).resolves.toBe(mtc);
    await expect(registry.MGM()).resolves.toBe(mgm);
  });

  it('registry doesnt allow duplicated', async () => {});
});

// import { fixtures, contracts } from '~/framework';
// import {
//   setupFundWithParams,
//   assetWhitelistPolicy,
//   userWhitelistPolicy,
//   managementFee,
//   performanceFee,
//   requestShares,
// } from '~/framework/fund';
// import { fromArtifact, transferToken, approveToken } from '~/framework/utils';

// async function fixture(provider: BuidlerProvider) {
//   const [deployer, manager, disallowed, allowed] = await Promise.all([
//     provider.getSigner(0),
//     provider.getSigner(1),
//     provider.getSigner(2),
//     provider.getSigner(3),
//   ]);

//   const registry = fixtures.Registry.connect(provider);

//   const fund = await setupFundWithParams({
//     factory: fixtures.FundFactory.connect(manager),
//     policies: [
//       userWhitelistPolicy([allowed]),
//       assetWhitelistPolicy([fixtures.WETH, fixtures.MLN]),
//     ],
//     fees: [managementFee(0.1, 30), performanceFee(0.1, 90)],
//     adapters: [
//       fixtures.KyberAdapter.connect(provider),
//       fixtures.EngineAdapter.connect(provider),
//     ],
//   });

//   return { deployer, manager, disallowed, allowed, fund, registry };
// }

// describe('general walkthrough', () => {
//   const provider = GanacheProvider.fork();

//   it('request shares fails for whitelisted user with no allowance', async () => {
//     const { allowed, fund } = await provider.snapshot(fixture);
//     const requestor = fromArtifact(contracts.SharesRequestor, allowed);

//     await expect(requestShares({ fund, requestor })).toRevertWith(
//       'Actual allowance is less than _investmentAmount',
//     );
//   });

//   it('buying shares (initial investment) fails for user not on whitelist', async () => {
//     const { disallowed, deployer, fund } = await provider.snapshot(fixture);
//     const requestor = fromArtifact(contracts.SharesRequestor, disallowed);

//     await transferToken(fixtures.WETH.connect(deployer), disallowed);
//     await approveToken(fixtures.WETH.connect(disallowed), requestor);

//     await expect(requestShares({ fund, requestor })).toRevertWith(
//       'Rule evaluated to false: USER_WHITELIST',
//     );
//   });

//   it('buying shares (initial investment) succeeds for whitelisted user with allowance', async () => {
//     const { allowed, deployer, fund } = await provider.snapshot(fixture);
//     const requestor = fromArtifact(contracts.SharesRequestor, allowed);
//     const amount = ethers.utils.parseEther('1');
//     const shares = ethers.utils.parseEther('1');

//     await transferToken(fixtures.WETH.connect(deployer), allowed);
//     await approveToken(fixtures.WETH.connect(allowed), requestor);
//     await requestShares({ fund, requestor, amount, shares });

//     const balance = await fund.shares.balanceOf(allowed);
//     expect(balance).toEqualBn(shares);
//   });

//   it('cannot invest in a shutdown fund', async () => {
//     const { allowed, fund } = await provider.snapshot(fixture);
//     const requestor = fromArtifact(contracts.SharesRequestor, allowed);

//     await fund.hub.shutDownFund().send();
//     await expect(requestShares({ fund, requestor })).toRevertWith(
//       'Fund is not active',
//     );
//   });

//   it('fund can take an order on oasisdex', async () => {
//     // TODO
//   });
// });
