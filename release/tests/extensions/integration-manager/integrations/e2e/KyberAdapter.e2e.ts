import { utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { StandardERC20 } from '../../../../../codegen/StandardERC20';
import { defaultTestDeployment } from '../../../../../utils/testing';

async function snapshot(provider: EthereumTestnetProvider) {
  // Use the normal test deployment but override the kyber integratee.
  const deployment = await defaultTestDeployment(provider, (config) => {
    config.integratees.kyber = '0x9AAb3f75489902f3a48495025729a0AF77d4b11e';
    return config;
  });

  const mlnWhaleAddress = '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d';
  const mlnWhale = provider.getSigner(mlnWhaleAddress);
  const mlnTokenAddress = '0xec67005c4e498ec7f55e092bd1d35cbc47c91892';
  const realMlnToken = new StandardERC20(mlnTokenAddress, provider);

  const [richDude] = deployment.accounts;
  await realMlnToken
    .connect(mlnWhale)
    .transfer(richDude, utils.parseEther('1000'));

  return {
    richDude,
    realMlnToken,
    ...deployment,
  };
}

it('has a bunch of mln', async () => {
  const { richDude, realMlnToken } = await provider.snapshot(snapshot);

  await expect(realMlnToken.balanceOf(richDude)).resolves.toEqBigNumber(
    utils.parseEther('1000'),
  );
});
