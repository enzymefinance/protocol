import * as Ganache from "ganache-cli";

import constructEnvironment from "./constructEnvironment";
import setGlobalEnvironment from "./setGlobalEnvironment";

const initTestEnvironment = async () => {
  const environment = constructEnvironment({
    provider: Ganache.provider()
  });
  const accounts = await environment.eth.getAccounts();
  const enhancedEnvironment = {
    ...environment,
    wallet: { address: accounts[0] }
  };
  setGlobalEnvironment(enhancedEnvironment);
};

export default initTestEnvironment;
