import * as R from 'ramda';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math/address';

interface GetVersionInformationArgs {
  version: Address;
}

const prepareArgs = (_, { version }: GetVersionInformationArgs) => {
  return [version.toString()];
};

const postProcess = async (_, result) => {
  const picked = R.pick(['exists', 'name'], result);
  return picked.exists && picked;
};

const getVersionInformation = callFactory(
  'versionInformation',
  Contracts.Registry,
  {
    postProcess,
    prepareArgs,
  },
);

export { getVersionInformation };
