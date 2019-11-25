const web3 = require('../../../../new/deploy/get-web3');

// TODO: make work with web3 2.0
export const increaseTime = async seconds => {
  await new Promise((resolve, reject) => {
    web3.eth.currentProvider.send(
      {
        id: new Date().getSeconds(),
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [seconds],
      },
      (err, response) => {
        if (err) reject(err);
        else resolve(response);
      },
    );
  });
  return new Promise((resolve, reject) => {
    web3.eth.currentProvider.send(
      {
        id: new Date().getSeconds(),
        jsonrpc: '2.0',
        method: 'evm_mine',
        params: [],
      },
      (err, response) => {
        if (err) reject(err);
        else resolve(response);
      },
    );
  });
};

module.exports = increaseTime;
