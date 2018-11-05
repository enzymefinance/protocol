import { Environment } from './Environment';
import { getGlobalEnvironment } from './getGlobalEnvironment';

const getAccounts = async (
  environment: Environment = getGlobalEnvironment(),
) => {
  const accounts = await environment.eth.getAccounts();
  return accounts;
};

export { getAccounts };
