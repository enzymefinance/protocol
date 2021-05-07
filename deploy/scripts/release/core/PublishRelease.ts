import { Dispatcher, FundDeployer, ReleaseStatusTypes } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');
  const fundDeployer = await get('FundDeployer');

  const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);
  await fundDeployerInstance.setReleaseStatus(ReleaseStatusTypes.Live);

  const dispatcherInstance = new Dispatcher(dispatcher.address, deployer);
  await dispatcherInstance.setCurrentFundDeployer(fundDeployer.address);
};

fn.tags = ['Release'];
fn.dependencies = ['Dispatcher', 'FundDeployer'];
fn.runAtTheEnd = true;

// NOTE: On mainnet, this is part of the hand over / release routine.
fn.skip = async (hre) => hre.network.live;

export default fn;
