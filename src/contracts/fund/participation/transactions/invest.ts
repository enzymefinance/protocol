import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { executeRequestFor } from '~/contracts/fund/participation/transactions/executeRequestFor';
import { Environment } from '~/utils/environment/Environment';

const invest = async (
  environment: Environment,
  { hubAddress, investmentAmount, requestedShares },
) => {
  const routes = await getRoutes(environment, hubAddress);

  await approve(environment, {
    howMuch: investmentAmount,
    spender: routes.participationAddress,
  });

  await requestInvestment(environment, routes.participationAddress, {
    investmentAmount,
    requestedShares,
  });

  const result = await executeRequestFor(
    environment,
    routes.participationAddress,
    { who: environment.wallet.address },
  );

  return result;
};

export { invest };
