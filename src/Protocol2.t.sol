pragma solidity ^0.4.16;

import "ds-test/test.sol";

import "./Protocol2.sol";

contract Protocol2Test is DSTest {
    Protocol2 protocol;

    function setUp() {
        protocol = new Protocol2();
    }

    function testFail_basic_sanity() {
        assertTrue(false);
    }

    function test_basic_sanity() {
        assertTrue(true);
    }
}
