import { utils } from 'ethers';

export function randomAddress() {
  const address = utils.hexlify(utils.randomBytes(20));

  return utils.getAddress(address);
}
