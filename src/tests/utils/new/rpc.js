const web3 = require('../../../../deploy/utils/get-web3');

const mine = async () => {
  await web3.eth.currentProvider.send('evm_mine', []);
}

const increaseTime = async seconds => {
  await web3.eth.currentProvider.send('evm_increaseTime', [seconds]);
  await mine();
}

module.exports = {increaseTime, mine};
