pragma solidity ^0.4.13;

import "ds-test/test.sol";

import "./Protocol.sol";

contract ProtocolTest is DSTest {
    Protocol protocol;

    function setUp() {
        protocol = new Protocol();
    }

    function testFail_basic_sanity() {
        assert(false);
    }

    function test_basic_sanity() {
        assert(true);
    }
}
