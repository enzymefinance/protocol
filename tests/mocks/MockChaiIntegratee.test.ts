import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IChai } from '@melonproject/protocol';
import { randomizedTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await randomizedTestDeployment(provider);
  // Initialize chai mock
  const chaiMock = new IChai(config.derivatives.chai, config.deployer);
  return { accounts, deployment, config, mocks: { chai: chaiMock } };
}

it('correctly join with DAI and receives CHAI in exchange', async () => {
  const {
    config: { deployer },
    mocks: { chai },
    deployment: {
      tokens: { dai },
    },
  } = await provider.snapshot(snapshot);

  const preDaiBalance = await dai.balanceOf(deployer);
  const preChaiBalance = await chai.balanceOf(deployer);

  const amount = utils.parseEther('1');
  await dai.approve(chai, amount);
  await chai.join(deployer, amount);

  const postDaiBalance = await dai.balanceOf(deployer);
  const postChaiBalance = await chai.balanceOf(deployer);

  expect(postDaiBalance).toEqBigNumber(preDaiBalance.sub(amount));
  expect(postChaiBalance).toEqBigNumber(preChaiBalance.add(amount));
});

it('correctly exits receiving DAI in exchange', async () => {
  const {
    config: { deployer },
    mocks: { chai },
    deployment: {
      tokens: { dai },
    },
  } = await provider.snapshot(snapshot);

  // Start by minting some tokens
  const joinAmount = utils.parseEther('2');
  await dai.approve(chai, utils.parseEther('2'));
  await chai.join(deployer, joinAmount);

  // Get Balances and redeem received cTokens
  const preDaiBalance = await dai.balanceOf(deployer);
  const preChaiBalance = await chai.balanceOf(deployer);

  const exitAmount = joinAmount;
  await chai.approve(chai, utils.parseEther('2'));
  await chai.exit(deployer, exitAmount);

  const postDaiBalance = await dai.balanceOf(deployer);
  const postChaiBalance = await chai.balanceOf(deployer);

  expect(postDaiBalance).toEqBigNumber(preDaiBalance.add(exitAmount));
  expect(postChaiBalance).toEqBigNumber(preChaiBalance.sub(exitAmount));
});
