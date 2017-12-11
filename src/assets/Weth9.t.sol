pragma solidity ^0.4.19;

import "ds-test/test.sol";
import "ds-weth/weth9.sol";

contract Weth9 is DSTest {

    WETH9_ weth;

    function setUp() {
        weth = new WETH9_();
    }

    function test_deposit() {
        uint depositAmount = 1 ether;
        uint userPreWethBalance = weth.balanceOf(this);
        uint userPreEthBalance = this.balance;
        uint contractPreEthBalance = weth.balance;
        weth.deposit.value(depositAmount)();
        uint userPostWethBalance = weth.balanceOf(this);
        uint userPostEthBalance = this.balance;
        uint contractPostEthBalance = weth.balance;
        uint userWethIncrease = userPostWethBalance - userPreWethBalance;
        uint userEthDecrease = userPreEthBalance - userPostEthBalance;
        uint contractEthIncrease = contractPostEthBalance - contractPreEthBalance;

        assertEq(userWethIncrease, depositAmount);
        assertEq(userEthDecrease, depositAmount);
        assertEq(contractEthIncrease, depositAmount);
    }

}
