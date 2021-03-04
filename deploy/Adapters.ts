import { utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  CurveLiquidityStethAdapterArgs,
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

function nonOptional<T>(array: (T | undefined)[]): T[] {
  return array.filter((item) => item !== undefined) as T[];
}

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

  // TODO: Set the allowed makers after deployment.
  const zeroExAdapter = await deploy('ZeroExV2Adapter', {
    from: deployer.address,
    log: true,
    args: [integrationManager.address, config.zeroex.exchange, fundDeployer.address, []] as ZeroExV2AdapterArgs,
  });

  const curveStethEthPoolAdapter = await deploy('CurveLiquidityStethAdapter', {
    from: deployer.address,
    log: true,
    args: [
      integrationManager.address,
      config.curve.pools.steth.liquidityGaugeToken,
      config.curve.pools.steth.lpToken,
      config.curve.pools.steth.pool,
      config.lido.steth,
      config.weth,
    ] as CurveLiquidityStethAdapterArgs,
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
    curveStethEthPoolAdapter,
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

  // Register vault calls
  // TODO: move to FundDeployer deployment?
  const vaultCalls = [
    [
      config.synthetix.delegateApprovals,
      sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address)')),
    ],
    [config.curve.minter, sighash(utils.FunctionFragment.fromString('mint(address)'))],
    [config.curve.minter, sighash(utils.FunctionFragment.fromString('mint_many(address[8])'))],
    [config.curve.minter, sighash(utils.FunctionFragment.fromString('toggle_approve_mint(address)'))],
  ];

  const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);
  const vaultCallsNeedingRegistration = nonOptional(
    await Promise.all(
      vaultCalls.map(async ([contract, sig]) => {
        return (await fundDeployerInstance.isRegisteredVaultCall(contract, sig)) ? undefined : { contract, sig };
      }),
    ),
  );

  if (!!vaultCallsNeedingRegistration.length) {
    log('Registering new vault calls', vaultCallsNeedingRegistration);
    await fundDeployerInstance.registerVaultCalls(
      vaultCallsNeedingRegistration.map((vaultCall) => vaultCall.contract),
      vaultCallsNeedingRegistration.map((vaultCall) => vaultCall.sig),
    );
  } else {
    log('All vault calls already registered');
  }
};

fn.tags = ['Release', 'Adapters'];
fn.dependencies = ['Config', 'IntegrationManager', 'FundDeployer', 'Prices'];

export default fn;
