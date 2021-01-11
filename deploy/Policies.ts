import { DeployFunction } from 'hardhat-deploy/types';
import {
  AdapterBlacklistArgs,
  AdapterWhitelistArgs,
  AssetBlacklistArgs,
  AssetWhitelistArgs,
  BuySharesCallerWhitelistArgs,
  GuaranteedRedemptionArgs,
  MaxConcentrationArgs,
  MinMaxInvestmentArgs,
  InvestorWhitelistArgs,
  GuaranteedRedemption,
  PolicyManager,
} from '@enzymefinance/protocol';
import { sameAddress } from '@crestproject/crestproject';
import { loadConfig } from './config/Config';

const fn: DeployFunction = async function (hre) {
  const { deploy, get, log } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const config = await loadConfig(hre);

  const policyManager = await get('PolicyManager');
  const fundDeployer = await get('FundDeployer');
  const valueInterpreter = await get('ValueInterpreter');
  const synthetixAdapter = await get('SynthetixAdapter');

  const adapterBlacklist = await deploy('AdapterBlacklist', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as AdapterBlacklistArgs,
  });

  const adapterWhitelist = await deploy('AdapterWhitelist', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as AdapterWhitelistArgs,
  });

  const assetBlacklist = await deploy('AssetBlacklist', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as AssetBlacklistArgs,
  });

  const assetWhitelist = await deploy('AssetWhitelist', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as AssetWhitelistArgs,
  });

  const buySharesCallerWhitelist = await deploy('BuySharesCallerWhitelist', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as BuySharesCallerWhitelistArgs,
  });

  const maxConcentration = await deploy('MaxConcentration', {
    from: deployer.address,
    log: true,
    args: [policyManager.address, valueInterpreter.address] as MaxConcentrationArgs,
  });

  const minMaxInvestment = await deploy('MinMaxInvestment', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as MinMaxInvestmentArgs,
  });

  const investorWhitelist = await deploy('InvestorWhitelist', {
    from: deployer.address,
    log: true,
    args: [policyManager.address] as InvestorWhitelistArgs,
  });

  const guaranteedRedemption = await deploy('GuaranteedRedemption', {
    from: deployer.address,
    log: true,
    args: [policyManager.address, fundDeployer.address, 0, []] as GuaranteedRedemptionArgs,
  });

  // Register synthetix as a redemption blocking adapter.
  const guaranteedRedemptionInstance = new GuaranteedRedemption(guaranteedRedemption.address, deployer);
  if (!(await guaranteedRedemptionInstance.adapterCanBlockRedemption(synthetixAdapter.address))) {
    log('Registering synthetix as a redemption blocking adapter');
    await guaranteedRedemptionInstance.addRedemptionBlockingAdapters([synthetixAdapter.address]);
  } else {
    log('Synthetix already set as redemption blocking adapter');
  }

  // Set the redemption window buffer.
  const redemptionWindowBuffer = config.policies.guaranteedRedemption.redemptionWindowBuffer;
  if (!(await guaranteedRedemptionInstance.getRedemptionWindowBuffer()).eq(redemptionWindowBuffer)) {
    log(`Setting redemption window buffer to ${redemptionWindowBuffer}`);
    await guaranteedRedemptionInstance.setRedemptionWindowBuffer(redemptionWindowBuffer);
  } else {
    log('Redemption window buffer already set');
  }

  // Register policies.
  const policyManagerInstance = new PolicyManager(policyManager.address, deployer);
  const registeredPolicies = await policyManagerInstance.getRegisteredPolicies();
  const policiesNeedingRegistration = [
    adapterBlacklist.address,
    adapterWhitelist.address,
    assetBlacklist.address,
    assetWhitelist.address,
    buySharesCallerWhitelist.address,
    maxConcentration.address,
    minMaxInvestment.address,
    investorWhitelist.address,
    guaranteedRedemption.address,
  ].filter((adapter) => !registeredPolicies.some((address) => sameAddress(adapter, address)));

  if (!!policiesNeedingRegistration.length) {
    log('Registering new policies', policiesNeedingRegistration);
    await policyManagerInstance.registerPolicies(policiesNeedingRegistration);
  } else {
    log('Policies already registered');
  }
};

fn.tags = ['Release', 'Policies'];
fn.dependencies = ['PolicyManager', 'FundDeployer', 'Prices', 'Adapters'];

export default fn;
