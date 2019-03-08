import { Environment } from '~/utils/environment/Environment';

export const increaseTime = async (
  environment: Environment,
  seconds: number,
) => {
  await new Promise((resolve, reject) => {
    environment.eth.currentProvider.send(
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
    environment.eth.currentProvider.send(
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
