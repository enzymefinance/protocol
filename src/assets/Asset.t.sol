pragma solidity ^0.4.11;

import "ds-test/test.sol";
import "./EtherToken.sol";


contract AssetTest is DSTest {

    EtherToken etherToken;
    uint preminedAmount = 10 ** 28;

    function setUp() {
        etherToken = new EtherToken();
    }

    function testPreminedAmountCorrect() {
        assertEq(etherToken.balanceOf(this), preminedAmount);
    }

    function testDeposit() {
        uint depositAmount = 1 ether;
        uint preTokenBalance = etherToken.balanceOf(this);
        uint preEthBalance = this.balance;
        etherToken.deposit.value(depositAmount)();
        uint postTokenBalance = etherToken.balanceOf(this);
        uint postEthBalance = this.balance;
        uint tokenIncrease = postTokenBalance - preTokenBalance;
        uint ethDecrease = preEthBalance - postEthBalance;
        assertEq(tokenIncrease, depositAmount);
        assertEq(ethDecrease, depositAmount);
    }

// TODO: enable this test when dapphub/ds-test#4
//    function testWithdraw() {
//        uint withdrawAmount = 500 finney;
//        uint preTokenBalance = etherToken.balanceOf(this);
//        uint preEthBalance = this.balance;
//        etherToken.withdraw(withdrawAmount);
//        uint postTokenBalance = etherToken.balanceOf(this);
//        uint postEthBalance = this.balance;
//        uint tokenDecrease = preTokenBalance - postTokenBalance;
//        uint ethIncrease = postEthBalance - preEthBalance;
//        assertEq(tokenDecrease, withdrawAmount);
//        assertEq(ethIncrease, withdrawAmount);
//    }
}
