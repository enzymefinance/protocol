import { utils } from 'ethers';
import { task } from 'hardhat/config';

task('verify-vault-proxy', 'Verifies the vault proxy contract')
  .addParam('proxy', 'The vault proxy contracts address')
  .addParam('lib', 'The vault lib contracts address')
  .setAction(async (params, hre) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { VaultLib, encodeFunctionData } = require('@enzymefinance/protocol');

    const contract = new VaultLib(params.proxy, hre.ethers.provider);
    const [owner, accessor, name] = await Promise.all([contract.getOwner(), contract.getAccessor(), contract.name()]);

    const init = encodeFunctionData(utils.FunctionFragment.fromString('init(address, address, string)'), [
      owner,
      accessor,
      name,
    ]);

    await hre.run('verify:verify', {
      address: params.proxy,
      constructorArguments: [init, params.lib],
      contract: 'contracts/persistent/vault/VaultProxy.sol:VaultProxy',
    });
  });

task('verify-comptroller-proxy', 'Verifies the comptroller proxy contract')
  .addParam('proxy', 'The comptroller proxy contracts address')
  .addParam('lib', 'The comptroller lib contracts address')
  .setAction(async (params, hre) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ComptrollerLib, encodeFunctionData } = require('@enzymefinance/protocol');

    const contract = new ComptrollerLib(params.proxy, hre.ethers.provider);
    const [denomination, timelock] = await Promise.all([
      contract.getDenominationAsset(),
      contract.getSharesActionTimelock(),
    ]);

    const init = encodeFunctionData(utils.FunctionFragment.fromString('init(address, uint256)'), [
      denomination,
      timelock,
    ]);

    await hre.run('verify:verify', {
      address: params.proxy,
      constructorArguments: [init, params.lib],
      contract: 'contracts/release/core/fund/comptroller/ComptrollerProxy.sol:ComptrollerProxy',
    });
  });

task('verify-external-position-proxy', 'Verifies the external position proxy contract')
  .addParam('address', 'The address of the external position proxy contract')
  .addParam('vault', 'The vault proxy contract address')
  .addParam('type', 'The external position type id')
  .addParam('lib', 'The external position lib address')
  .addParam('data', 'The external position construct data payload')
  .setAction(async (params, hre) => {
    await hre.run('verify:verify', {
      address: params.address,
      constructorArguments: [params.vault, params.type, params.lib, params.data],
      contract: 'contracts/persistent/external-positions/ExternalPositionProxy.sol:ExternalPositionProxy',
    });
  });

task('verify-convex-wrapper', 'Verifies a convex wrapper proxy contract')
  .addParam('factory', 'The proxy factory contract address')
  .addParam('pid', 'The pool id')
  .setAction(async (params, hre) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ConvexCurveLpStakingWrapperFactory, encodeFunctionData } = require('@enzymefinance/protocol');

    const contract = new ConvexCurveLpStakingWrapperFactory(params.factory, hre.ethers.provider);
    const wrapper = await contract.getWrapperForConvexPool(params.pid);

    const init = encodeFunctionData(utils.FunctionFragment.fromString('init(uint256)'), [params.pid]);

    await hre.run('verify:verify', {
      address: wrapper,
      constructorArguments: [init, params.factory],
      contract: 'contracts/release/utils/beacon-proxy/BeaconProxy.sol:BeaconProxy',
    });
  });
