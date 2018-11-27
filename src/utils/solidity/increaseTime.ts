import { Environment } from '~/utils/environment/Environment';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';

export const increaseTime = async (
  seconds: number,
  environment: Environment = getGlobalEnvironment(),
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
