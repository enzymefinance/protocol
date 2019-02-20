import { Address } from '@melonproject/token-math';
import { getPoliciesBySig } from '~/contracts/fund/policies/calls/getPoliciesBySig';
import { identifier as getIdentifier } from '~/contracts/fund/policies/calls/identifier';
import { maxConcentration as getMaxConcentration } from '~/contracts/fund/policies/calls/maxConcentration';
import { maxPositions as getMaxPositions } from '~/contracts/fund/policies/calls/maxPositions';
import { tolerance as getTolerance } from '~/contracts/fund/policies/calls/tolerance';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { Environment } from '~/utils/environment/Environment';

// manually defining cases for each policy that has params
const getParametersForPolicy = async (env, policyName, policyAddress) => {
  const params: any = {};
  switch (policyName) {
    case 'MaxConcentration':
      params.maxConcentration = getMaxConcentration(env, policyAddress);
      break;
    case 'MaxPositions':
      params.maxPositions = getMaxPositions(env, policyAddress);
      break;
    case 'PriceTolerance':
      params.tolerance = getTolerance(env, policyAddress);
      break;
    default:
      break;
  }
  return params;
};

export const getPolicyInformation = async (
  env: Environment,
  policyManager: Address,
) => {
  // HACK: uses a heuristic to check most common signatures
  const sigsToCheck = [
    FunctionSignatures.makeOrder,
    FunctionSignatures.takeOrder,
    FunctionSignatures.cancelOrder,
    FunctionSignatures.withdrawTokens,
    FunctionSignatures.executeRequestFor,
  ];
  const registeredPolicies = [];
  for (const sig of sigsToCheck) {
    const retrievedPolicies = await getPoliciesBySig(env, policyManager, {
      sig,
    });
    for (const policyAddress of retrievedPolicies.pre.concat(
      retrievedPolicies.post,
    )) {
      if (registeredPolicies.indexOf(policyAddress) === -1) {
        const policyName = getIdentifier(env, policyAddress);

        const policyObject = {
          address: policyAddress,
          name: policyName,
          parameters: await getParametersForPolicy(
            env,
            policyName,
            policyAddress,
          ),
        };
        registeredPolicies.push(policyObject);
      }
    }
  }
  return registeredPolicies;
};
