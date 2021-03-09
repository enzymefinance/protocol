import { FundDeployerArgs, sighash } from '@enzymefinance/protocol';
import { utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const vaultLib = await get('VaultLib');

  const vaultCalls = [
    [
      config.synthetix.delegateApprovals,
      sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)')),
    ],
    [config.curve.minter, sighash(utils.FunctionFragment.fromString('mint(address)'))],
    [config.curve.minter, sighash(utils.FunctionFragment.fromString('mint_many(address[8])'))],
    [config.curve.minter, sighash(utils.FunctionFragment.fromString('toggle_approve_mint(address)'))],
  ] as const;

  await deploy('FundDeployer', {
    args: [
      dispatcher.address,
      vaultLib.address,
      vaultCalls.map(([address]) => address),
      vaultCalls.map(([, selector]) => selector),
    ] as FundDeployerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'FundDeployer'];
fn.dependencies = ['Dispatcher', 'VaultLib'];

export default fn;
