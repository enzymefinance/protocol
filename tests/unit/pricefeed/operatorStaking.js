import test from "ava";
import api from "../../../utils/lib/api";
import deployEnvironment from "../../../utils/deploy/contracts";
import {deployContract} from "../../../utils/lib/contracts";
import {mineToTime, txidToTimestamp} from "../../../utils/lib/time";

const BigNumber = require("bignumber.js");

const environment = "development";

// hoisted variables
let deployer;
let stakers;

// constants
const initialMln = new BigNumber(10 ** 20);
const minimumStake = new BigNumber(1000);

// helpers
function shuffle(array) { // TODO: iterate stakers randomly (further below)
  array.sort(() => .5 - Math.random());
}

test.before(async () => {
  const accounts = await api.eth.accounts();
  [deployer, ...stakers] = accounts;
});

test.beforeEach(async t => {
  const deployed = await deployEnvironment(environment);
  t.context.mlnToken = deployed.MlnToken;
  await Promise.all(stakers.map(async staker => {
    await t.context.mlnToken.methods.transfer(
      staker, initialMln
    ).send({from: deployer});
  }));
  t.context.staking = await deployContract(
    "system/OperatorStaking",
    {from: deployer, gas: 6000000},
    [
      t.context.mlnToken.options.address,    // staking token
      minimumStake,
      4,                             // number of operators
      0                              // withdrawal delay
    ]
  );
});

test.only("staker cannot stake below minimum", async t => {
  console.log('-------------------------------------HERE')
  await t.context.mlnToken.methods.approve(
    t.context.staking.options.address, minimumStake.minus(1)
  ).send({from: stakers[0]});
  console.log('-------------------------------------HERE')
  await t.context.staking.methods.stake(
    minimumStake.minus(1), ""
  ).send({from: stakers[0]});
  console.log('-------------------------------------HERE')
  const totalStake = await t.context.staking.methods.stakedAmounts(
    stakers[0]
  ).call();
  const isOperator = await t.context.staking.methods.isOperator(
    stakers[0]
  ).call();
  console.log('-------------------------------------HERE')

  t.is(Number(totalStake), 0);
  t.false(isOperator);
});

test("staker approves, stakes, and is tracked in contract", async t => {
  const preStakerMln = await t.context.mlnToken.methods.balanceOf(
    stakers[0]
  ).call();
  const preContractMln = await t.context.mlnToken.methods.balanceOf(
    t.context.staking.options.address
  ).call();
  await t.context.mlnToken.methods.approve(
    t.context.staking.options.address, minimumStake
  ).send({from: stakers[0]});
  await t.context.staking.methods.stake(
    minimumStake, ""
  ).send({from: stakers[0]});
  const totalStake = await t.context.staking.methods.stakedAmounts(
    stakers[0]
  ).call();
  const isOperator = await t.context.staking.methods.isOperator(
    stakers[0]
  ).call();
  const operators = await t.context.staking.methods.getOperators.call()
  const postStakerMln = await t.context.mlnToken.methods.balanceOf(stakers[0]).call();
  const postContractMln = await t.context.mlnToken.methods.balanceOf(t.context.staking.options.address).call();

  t.is(Number(totalStake), Number(minimumStake));
  t.true(isOperator);
  t.is(operators[0]._value, stakers[0]);
  t.is(Number(postContractMln.minus(preContractMln)), Number(minimumStake));
  t.is(Number(preStakerMln.minus(postStakerMln)), Number(minimumStake));
});

test("staker unstakes fully, and is no longer an operator", async t => {
  const preStakerMln = await t.context.mlnToken.methods.balanceOf(stakers[0]).call();
  const preContractMln = await t.context.mlnToken.methods.balanceOf(t.context.staking.options.address).call();
  await t.context.mlnToken.methods.approve(
    t.context.staking.options.address, minimumStake
  ).send({from: stakers[0]});
  await t.context.staking.methods.stake(
    minimumStake, ""
  ).send({from: stakers[0]});
  const preTotalStake = await t.context.staking.methods.stakedAmounts(stakers[0]).call();
  const preIsOperator = await t.context.staking.methods.isOperator(stakers[0]).call();
  const preIsRanked = await t.context.staking.methods.isRanked(stakers[0]).call();

  t.is(Number(preTotalStake), Number(minimumStake));
  t.true(preIsOperator);
  t.true(preIsRanked);

  await t.context.staking.methods.unstake(minimumStake, "").send({from: stakers[0]});

  const postUnstakeStakerMln = await t.context.mlnToken.methods.balanceOf(stakers[0]).call();
  const postUnstakeContractMln = await t.context.mlnToken.methods.balanceOf(t.context.staking.options.address).call();
  const postUnstakeTotalStake = await t.context.staking.methods.stakedAmounts(stakers[0]).call();
  const postUnstakeIsOperator = await t.context.staking.methods.isOperator(stakers[0]).call();
  const postUnstakeIsRanked = await t.context.staking.methods.isRanked(stakers[0]).call();

  t.deepEqual(preStakerMln.minus(minimumStake), postUnstakeStakerMln);
  t.deepEqual(preContractMln.plus(minimumStake), postUnstakeContractMln);
  t.is(Number(postUnstakeTotalStake), 0);
  t.false(postUnstakeIsOperator);
  t.false(postUnstakeIsRanked);

  await t.context.staking.methods.withdrawStake().send({from: stakers[0]});
  const postWithdrawStakerMln = await t.context.mlnToken.methods.balanceOf(stakers[0]).call();
  const postWithdrawContractMln = await t.context.mlnToken.methods.balanceOf(
    t.context.staking.options.address
  ).call();

  t.deepEqual(preStakerMln, postWithdrawStakerMln);
  t.deepEqual(preContractMln, postWithdrawContractMln);
});

test("unstake fails before delay complete", async t => {
  const inputGas = 6000000;
  const withdrawalDelay = 7;
  t.context.staking = await deployContract(
    "system/OperatorStaking",
    {from: deployer, gas: 6000000},
    [
      t.context.mlnToken.options.address,    // staking token
      minimumStake,
      4,                             // number of operators
      withdrawalDelay
    ]
  );
  await t.context.mlnToken.methods.approve(
    t.context.staking.options.address, minimumStake
  ).send({from: stakers[0]});
  let txid = await t.context.staking.methods.stake(
    minimumStake, ""
  ).send({from: stakers[0]});
  const stakedAmount = await t.context.staking.methods.stakedAmounts(
    stakers[0]
  ).call();

  t.is(Number(stakedAmount), Number(minimumStake));

  txid = await t.context.staking.methods.unstake(
    minimumStake, ""
  ).send({from: stakers[0], gas: inputGas});
  const postUnstakeStakedAmount = await t.context.staking.methods.stakedAmounts(
    stakers[0]
  ).call();
  const unstakeTime = await txidToTimestamp(txid);
  t.is(Number(postUnstakeStakedAmount), 0);

  txid = await t.context.staking.methods.withdrawStake(
    minimumStake, ""
  ).send({from: stakers[0], gas: inputGas});
  const failedWithdrawalTime = await txidToTimestamp(txid);
  const failedWithdrawGas = (await api.eth.getTransactionReceipt(txid)).gasUsed;

  t.true(unstakeTime + withdrawalDelay > failedWithdrawalTime); // delay not reached
  t.is(Number(failedWithdrawGas), inputGas);

  await mineToTime(unstakeTime + withdrawalDelay + 2); // pass delay

  txid = await t.context.staking.methods.withdrawStake(
    minimumStake, ""
  ).send({from: stakers[0], gas: inputGas});
  const unstakeGas = (await api.eth.getTransactionReceipt(txid)).gasUsed;
  const withdrawalTime = await txidToTimestamp(txid);

  t.true(withdrawalTime > unstakeTime + withdrawalDelay);  // delay was indeed passed
  t.true(Number(unstakeGas) < inputGas);
});

test("ranking is correct with multiple stakers", async t => {
  // "amounts": amount used by $action
  // "final": expected staked amount after applying $action
  // "order": order of stakers output after applying $action (from most to least staked)
  const scenario = [
    {
      action:  'stake',
      amounts: [ 20000, 19000, 18000, 15000, 14000 ],
      final:   [ 20000, 19000, 18000, 15000, 14000 ],
      order:   [ 0, 1, 2, 3, 4 ]
    }, {
      action:  'unstake',
      amounts: [ 10000, 19000, 0,      6000, 9000  ],
      final:   [ 10000, 0,     18000,  9000, 5000  ],
      order:   [ 2, 0, 3, 4 ]
    }, {
      action:  'stake',
      amounts: [ 0,     30000, 1000,   5000, 20000 ],
      final:   [ 10000, 30000, 19000, 14000, 25000  ],
      order:   [ 1, 4, 2, 3, 0 ]
    }
  ];

  /*eslint-disable */
  for (const [iStep, step] of scenario.entries()) {
    for (const [iStaker, staker] of stakers.entries()) {
      if (step.amounts[iStaker] !== 0) { // TODO: iterate stakers randomly
        if (step.action === 'stake') {
          await t.context.mlnToken.methods.approve(
            t.context.staking.options.address, 0
          ).send({from: staker, gas: 6000000});
          await t.context.mlnToken.methods.approve(
            t.context.staking.options.address, step.amounts[iStaker]
          ).send({from: staker, gas: 6000000});
          await t.context.staking.methods.stake(
            step.amounts[iStaker], ""
          ).send({from: staker, gas: 6000000});
        } else if (step.action === 'unstake') {
          await t.context.staking.methods.unstake(
            step.amounts[iStaker], ""
          ).send({from: staker, gas: 6000000});
          await t.context.staking.methods.withdrawStake().send({from: staker, gas: 6000000});
        }
      }
      const total = await t.context.staking.methods.stakedAmounts(staker).call();

      t.is(Number(total), step.final[iStaker]);
    };
    const [rawStakers, rawAmounts] = await t.context.staking.methods.getStakersAndAmounts().call();
    const outStakers = rawStakers.map(e => e._value);
    const outAmounts = rawAmounts.map(e => Number(e._value));
    const sortedFinal = step.order.map(item => step.final[item]);
    const sortedStakers = step.order.map(item => stakers[item]);

    for (let i = 0; i < sortedStakers.length; i++) {
      const currentOperator = sortedStakers[i];
      const isOperator = await t.context.staking.methods.isOperator(currentOperator).call();
      if (i < 4) { // only top 4 stakers should be operator (max defined at contract deploy)
        t.true(isOperator);
      } else {
        t.false(isOperator);
      }
    }
    /* eslint-enable */
    t.is(outAmounts.join(', '), sortedFinal.join(', '));
    t.is(outStakers.join(', '), sortedStakers.join(', '));
  };
});
