import { Address } from '@melonproject/token-math';
import { getPoliciesBySig } from '~/contracts/fund/policies/calls/getPoliciesBySig';
import { identifier as getIdentifier } from '~/contracts/fund/policies/calls/identifier';
import { maxConcentration as getMaxConcentration } from '~/contracts/fund/policies/calls/maxConcentration';
import { maxPositions as getMaxPositions } from '~/contracts/fund/policies/calls/maxPositions';
import { tolerance as getTolerance } from '~/contracts/fund/policies/calls/tolerance';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { Environment } from '~/utils/environment/Environment';
import web3Utils from 'web3-utils';

// manually defining cases for each policy that has params
const getParametersForPolicy = async (env, policyName, policyAddress) => {
  switch (policyName) {
    case 'MaxConcentration': {
      const maxConcentration = await getMaxConcentration(env, policyAddress);
      return { maxConcentration };
    }

    case 'MaxPositions': {
      const maxPositions = await getMaxPositions(env, policyAddress);
      return { maxPositions };
    }

    case 'PriceTolerance': {
      const tolerance = await getTolerance(env, policyAddress);
      return { tolerance };
    }

    default:
      return {};
  }
};

const getFunctionIdentifier = (env, functionNameAndArguments) => {
  return web3Utils.keccak256(functionNameAndArguments).slice(0, 10);
};

export const getPolicyInformation = async (
  env: Environment,
  policyManager: Address,
) => {
  // HACK: uses a heuristic to check most common signatures
  const sigsToCheck = [
    getFunctionIdentifier(env, FunctionSignatures.makeOrder),
    getFunctionIdentifier(env, FunctionSignatures.takeOrder),
    getFunctionIdentifier(env, FunctionSignatures.cancelOrder),
    getFunctionIdentifier(env, FunctionSignatures.withdrawTokens),
    getFunctionIdentifier(env, FunctionSignatures.executeRequestFor),
  ];

  const retrievedPolicies = await Promise.all(
    sigsToCheck.map(sig => {
      return getPoliciesBySig(env, policyManager, { sig });
    }),
  );

  const policyAddresses = retrievedPolicies.map(policy => {
    return [...policy.pre, ...policy.post].map(address => address.toString());
  });

  const uniquePolicyAddresses = policyAddresses.reduce((carry, current) => {
    const add = current.filter(address => carry.indexOf(address) === -1);
    return [...carry, ...add];
  }, []);

  const policyObjects = uniquePolicyAddresses.map(async address => {
    const name = await getIdentifier(env, address);
    const parameters = await getParametersForPolicy(env, name, address);

    return {
      address,
      name,
      parameters,
    };
  });

  return Promise.all(policyObjects);
};
