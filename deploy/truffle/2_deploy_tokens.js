const conf = require('../deploy-config.js');
const BN = web3.utils.BN;
const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');
const DAI = artifacts.require('DAI');
const EUR = artifacts.require('EUR');
const KNC = artifacts.require('KNC');
const ZRX = artifacts.require('ZRX');

module.exports = async (deployer, _, accounts) => {
  await deployer.deploy(WETH);
  const weth = await WETH.deployed();
  await deployer.deploy(MLN);
  await deployer.deploy(DAI);
  await deployer.deploy(EUR);
  await deployer.deploy(KNC);
  await deployer.deploy(ZRX);

  const initialWeth = conf.initialWethDepositAmount;
  const wethAlreadyOwned = await weth.balanceOf(accounts[0]);
  const wethToDeposit = new BN(initialWeth).sub(new BN(wethAlreadyOwned));
  if (wethToDeposit.gt(new BN(0))) {
    await weth.deposit({value: wethToDeposit});
  }
}
