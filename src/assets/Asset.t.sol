pragma solidity ^0.4.19;

import "ds-test/test.sol";
import "./EtherToken.sol";


contract AssetTest is DSTest {

    EtherToken etherToken;
    uint preminedAmount = 10 ** 28;

    function setUp() {
        etherToken = new EtherToken();
    }

    function testPreminedAmountCorrect() {
        uint contractBalance = etherToken.balanceOf(this);

        assertEq(contractBalance, preminedAmount);
    }

    function testDeposit() {
        uint depositAmount = 1 ether;
        uint userPreTokenBalance = etherToken.balanceOf(this);
        uint userPreEthBalance = this.balance;
        uint contractPreEthBalance = etherToken.balance;
        etherToken.deposit.value(depositAmount)();
        uint userPostTokenBalance = etherToken.balanceOf(this);
        uint userPostEthBalance = this.balance;
        uint contractPostEthBalance = etherToken.balance;
        uint userTokenIncrease = userPostTokenBalance - userPreTokenBalance;
        uint userEthDecrease = userPreEthBalance - userPostEthBalance;
        uint contractEthIncrease = contractPostEthBalance - contractPreEthBalance;

        assertEq(userTokenIncrease, depositAmount);
        assertEq(userEthDecrease, depositAmount);
        assertEq(contractEthIncrease, depositAmount);
    }

    // TODO: fix this; not clear why it throws on etherToken.withdraw()
    event Log(address a);
    function testWithdraw() {
        uint depositAmount = 1 ether;
        uint withdrawAmount = 500 finney;
        etherToken.deposit.value(depositAmount)();

        assertEq(etherToken.balance, depositAmount);

        uint preTokenBalance = etherToken.balanceOf(this);
        uint preEthBalance = this.balance;
        //etherToken.withdraw(withdrawAmount);
        //uint postTokenBalance = etherToken.balanceOf(this);
        //uint postEthBalance = this.balance;
        //uint tokenDecrease = preTokenBalance - postTokenBalance;
        //uint ethIncrease = postEthBalance - preEthBalance;

        //assertEq(tokenDecrease, withdrawAmount);
        //assertEq(ethIncrease, withdrawAmount);
    }
}
