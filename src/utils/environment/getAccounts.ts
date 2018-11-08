import { Environment } from './Environment';
import { getGlobalEnvironment } from './globalEnvironment';

const getAccounts = async (
  environment: Environment = getGlobalEnvironment(),
) => {
  const accounts = await environment.eth.getAccounts();
  return accounts;
};

export { getAccounts };
