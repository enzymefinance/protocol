import {
  ONE_DAY_IN_SECONDS,
  CumulativeSlippageTolerancePolicyArgs,
  AddressListRegistry,
  AddressListUpdateType,
} from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';
import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const policyManager = await get('PolicyManager');
  const valueInterpreter = await get('ValueInterpreter');

  // TODO: find a better place to create lists like this. Could do RegisterAdapters, but need a way to communicate
  // `nonSlippageAdaptersListId` to this policy.
  const aaveAdapter = await get('AaveAdapter');
  const compoundAdapter = await get('CompoundAdapter');
  const curveLiquidityAaveAdapter = await get('CurveLiquidityAaveAdapter');
  const curveLiquidityEursAdapter = await get('CurveLiquidityEursAdapter');
  const curveLiquiditySethAdapter = await get('CurveLiquiditySethAdapter');
  const curveLiquidityStethAdapter = await get('CurveLiquidityStethAdapter');
  const idleAdapter = await get('IdleAdapter');
  const synthetixAdapter = await get('SynthetixAdapter');
  const uniswapV2LiquidityAdapter = await get('UniswapV2LiquidityAdapter');
  const yearnVaultV2Adapter = await get('YearnVaultV2Adapter');
  const zeroExV2Adapter = await get('ZeroExV2Adapter');

  const addressListRegistry = await get('AddressListRegistry');
  const addressListRegistryContract = new AddressListRegistry(addressListRegistry.address, deployer);
  const nonSlippageAdaptersListId = await addressListRegistryContract.getListCount();
  await addressListRegistryContract.createList(dispatcher.address, AddressListUpdateType.AddAndRemove, [
    aaveAdapter.address,
    compoundAdapter.address,
    curveLiquidityAaveAdapter.address,
    curveLiquidityEursAdapter.address,
    curveLiquiditySethAdapter.address,
    curveLiquidityStethAdapter.address,
    idleAdapter.address,
    synthetixAdapter.address,
    uniswapV2LiquidityAdapter.address,
    yearnVaultV2Adapter.address,
    zeroExV2Adapter.address,
  ]);

  await deploy('CumulativeSlippageTolerancePolicy', {
    args: [
      policyManager.address,
      addressListRegistry.address,
      valueInterpreter.address,
      config.weth,
      nonSlippageAdaptersListId,
      ONE_DAY_IN_SECONDS * 7, // tolerance period duration
      ONE_DAY_IN_SECONDS * 7, // priceless asset bypass timelock
      ONE_DAY_IN_SECONDS * 2, // priceless asset bypass time limit
    ] as CumulativeSlippageTolerancePolicyArgs,
    from: deployer.address,
    linkedData: {
      type: 'POLICY',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

// TODO: remove these once we move the list registry elsewhere
const tempDependencies = [
  'Dispatcher',
  'AaveAdapter',
  'CompoundAdapter',
  'CurveLiquidityAaveAdapter',
  'CurveLiquidityEursAdapter',
  'CurveLiquidityEursAdapter',
  'CurveLiquiditySethAdapter',
  'CurveLiquidityStethAdapter',
  'IdleAdapter',
  'SynthetixAdapter',
  'UniswapV2LiquidityAdapter',
  'YearnVaultV2Adapter',
  'ZeroExV2Adapter',
];

fn.tags = ['Release', 'Policies', 'CumulativeSlippageTolerancePolicy'];
fn.dependencies = ['Config', 'AddressRegistryList', 'PolicyManager', 'ValueInterpreter', ...tempDependencies];

export default fn;
