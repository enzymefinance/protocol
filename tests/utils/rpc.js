import web3 from '~/deploy/utils/get-web3';

const mine = async () => {
  return new Promise((resolve, reject) => {
    web3.eth.currentProvider.send(
      {
        id: Date.now(),
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
}

const increaseTime = async seconds => {
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
  await mine();
}

module.exports = {increaseTime, mine};
