const mine = async web3 => {
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

const increaseTime = async (seconds, web3) => {
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
  await mine(web3);
}

module.exports = {increaseTime, mine};
