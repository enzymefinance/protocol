const {call, fetchContract, send} = require('../utils/deploy-contract');
const getAccounts = require('../utils/getAccounts.js');
const web3 = require('../utils/get-web3');
const BN = web3.utils.BN;

const main = async (input, deployOut) => {
  const deployer = input.conf.deployer;
  const kyberReserveAmount = input.postDeployment.kyberReserveAmount;
  const deployerWethAmount = input.postDeployment.deployerWethAmount;

  if (kyberReserveAmount) {
    const kyberReserve = await fetchContract('KyberReserve', deployOut.kyber.addr.KyberReserve);
    const reserveBalance = new BN(await web3.eth.getBalance(kyberReserve.options.address));
    if (reserveBalance.lt(new BN(kyberReserveAmount))) {
      const diff = new BN(kyberReserveAmount).sub(reserveBalance).toString();
      await send(kyberReserve, undefined, [], { value: diff });
    }
  }
  if (deployerWethAmount) {
    const weth = await fetchContract('WETH', deployOut.tokens.addr.WETH);
    const deployerWethBalance = new BN(await call(weth, 'balanceOf', [deployer]));
    if (deployerWethBalance.lt(new BN(deployerWethAmount))) {
      const diff = new BN(deployerWethAmount).sub(deployerWethBalance).toString();
      await send(weth, 'deposit', [], { value: diff });
    }
  }

}

module.exports = main;
