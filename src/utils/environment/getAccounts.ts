import { Environment } from './Environment';

const getAccounts = async (environment: Environment) => {
  const accounts = await environment.eth.getAccounts();
  return accounts;
};

export { getAccounts };
