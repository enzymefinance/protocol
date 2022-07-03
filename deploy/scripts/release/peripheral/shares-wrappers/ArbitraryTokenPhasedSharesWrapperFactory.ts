import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, deploy },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  const addressListRegistry = await get('AddressListRegistry');
  const dispatcher = await get('Dispatcher');
  const fundDeployer = await get('FundDeployer');
  const protocolFeeReserveProxy = await get('ProtocolFeeReserveProxy');

  // TODO: create a config.sharesWrappers for the protocolFeeBps,
  // and confirm whether we want the recipient to be the ProtocolFeeReserve
  // TODO: confirm protocol fee amount (likely more than 25 bps since it will
  // involve work + slippage to manually swap received assets into MLN and burn)
  const protocolFeeBps = 25;
  const protocolFeeRecipient = protocolFeeReserveProxy.address;
  await deploy('ArbitraryTokenPhasedSharesWrapperFactory', {
    args: [dispatcher.address, addressListRegistry.address, fundDeployer.address, protocolFeeRecipient, protocolFeeBps],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'ArbitraryTokenPhasedSharesWrapperFactory'];
fn.dependencies = ['AddressListRegistry', 'Dispatcher', 'FundDeployer', 'ProtocolFeeReserve'];

export default fn;
