import { default as deployContract } from '~/utils/solidity/deploy';

const deploy = async (
  symbol: string = 'FIXED',
  decimals: number = 18,
  name: string = 'Premined Token',
) => {
  const address = await deployContract('dependencies/token/PreminedToken.sol', [
    symbol,
    decimals,
    name,
  ]);
  return address;
};

export default deploy;
