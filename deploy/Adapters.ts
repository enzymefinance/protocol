import { utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  AaveAdapterArgs,
  AlphaHomoraV1AdapterArgs,
  ChaiAdapterArgs,
  CompoundAdapterArgs,
  KyberAdapterArgs,
  ParaSwapAdapterArgs,
  SynthetixAdapterArgs,
  TrackedAssetsAdapterArgs,
  UniswapV2AdapterArgs,
  ZeroExV2AdapterArgs,
  IntegrationManager,
  FundDeployer,
  sighash,
} from '@enzymefinance/protocol';
import { loadConfig } from './config/Config';
import { sameAddress } from '@crestproject/crestproject';

const fn: DeployFunction = async function (hre) {
  const { deploy, get, log } = hre.deployments;
  const deployer = await hre.ethers.getNamedSigner('deployer');
  const config = await loadConfig(hre);

  const integrationManager = await get('IntegrationManager');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');
  const compoundPriceFeed = await get('CompoundPriceFeed');
  const fundDeployer = await get('FundDeployer');

  const paraSwapAdapter = await deploy('ParaSwapAdapter', {
    from: deployer.address,
    log: true,
    args: [
      integrationManager.address,
      config.paraswap.augustusSwapper,
      config.paraswap.tokenTransferProxy,
      config.weth,
    ] as ParaSwapAdapterArgs,
  });

  const synthetixAdapter = await deploy('SynthetixAdapter', {
    from: deployer.address,
    log: true,
    args: [
      integrationManager.address,
      synthetixPriceFeed.address,
      config.synthetix.originator,
      config.synthetix.snx,
      config.synthetix.trackingCode,
    ] as SynthetixAdapterArgs,
  });

  // Register synthetix vault call.
  const vaultCallSelector = sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)'));
  const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);
  if (!(await fundDeployerInstance.isRegisteredVaultCall(config.synthetix.delegateApprovals, vaultCallSelector))) {
    log('Registering new vault call', [config.synthetix.delegateApprovals], [vaultCallSelector]);
    await fundDeployerInstance.registerVaultCalls([config.synthetix.delegateApprovals], [vaultCallSelector]);
  } else {
    log('Synthetix vault calls already set');
  }

  // TODO: Set the allowed makers after deployment.
  const zeroExAdapter = await deploy('ZeroExV2Adapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.zeroex.exchange, fundDeployer.address, []] as ZeroExV2AdapterArgs,
  });

  const aaveAdapter = await deploy('AaveAdapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.aave.lendingPoolAddressProvider] as AaveAdapterArgs,
  });

  const compoundAdapter = await deploy('CompoundAdapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, compoundPriceFeed.address, config.weth] as CompoundAdapterArgs,
  });

  const uniswapV2Adapter = await deploy('UniswapV2Adapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.uniswap.router, config.uniswap.factory] as UniswapV2AdapterArgs,
  });

  const trackedAssetsAdapter = await deploy('TrackedAssetsAdapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address] as TrackedAssetsAdapterArgs,
  });

  const chaiAdapter = await deploy('ChaiAdapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.chai.chai, config.chai.dai] as ChaiAdapterArgs,
  });

  const kyberAdapter = await deploy('KyberAdapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.kyber.networkProxy, config.weth] as KyberAdapterArgs,
  });

  const alphaHomoraV1Adapter = await deploy('AlphaHomoraV1Adapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.alphaHomoraV1.ibeth, config.weth] as AlphaHomoraV1AdapterArgs,
  });

  // Register adapters.
  const integrationManagerInstance = new IntegrationManager(integrationManager.address, deployer);
  const registeredAdapters = await integrationManagerInstance.getRegisteredAdapters();
  const adaptersNeedingRegistration = [
    aaveAdapter.address,
    paraSwapAdapter.address,
    synthetixAdapter.address,
    zeroExAdapter.address,
    compoundAdapter.address,
    uniswapV2Adapter.address,
    trackedAssetsAdapter.address,
    chaiAdapter.address,
    kyberAdapter.address,
    alphaHomoraV1Adapter.address,
  ].filter((adapter) => !registeredAdapters.some((address) => sameAddress(adapter, address)));

  if (!!adaptersNeedingRegistration.length) {
    log('Registering new adapters', adaptersNeedingRegistration);
    await integrationManagerInstance.registerAdapters(adaptersNeedingRegistration);
  } else {
    log('Adapters already registered');
  }
};

fn.tags = ['Release', 'Adapters'];
fn.dependencies = ['Config', 'IntegrationManager', 'FundDeployer', 'Prices'];

export default fn;
