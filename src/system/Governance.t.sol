pragma solidity ^0.4.19;

import "ds-test/test.sol";
import "../assets/PreminedAsset.sol";
import "../version/Version.sol";
import "./Governance.sol";


contract GovernanceTest is DSTest {
    Governance governance;
    PreminedAsset melonToken;
    PreminedAsset nativeToken;
    Version version;
    Caller hal;
    Caller pal;

    // constants
    uint MELON_DECIMALS = 18;
    string VERSION_NUMBER = "1.2.3";

    function setUp() {
        melonToken = new PreminedAsset();
        nativeToken = new PreminedAsset();
        hal = new Caller();
        pal = new Caller();
        address[] memory members = new address[](2);
        members[0] = hal;
        members[1] = pal;
        governance = new Governance(members, 1, 1000000);
    }

    function test_addAndGetVersion() {
        version = new Version(VERSION_NUMBER, governance, nativeToken, melonToken, address(0), address(0));
        activateVersion(version);
        var (returnedVersion, active, ) = governance.getVersionById(0);
        assertEq(returnedVersion, version);
        assert(active);
    }

    function test_shutDownVersion() {
        version = new Version(VERSION_NUMBER, governance, nativeToken, melonToken, address(0), address(0));
        activateVersion(version);
        bytes memory calldata = new bytes(36);
        bytes4 sig = bytes4(sha3("shutDownVersion(uint256)"));
        bytes memory uintInBytes = uintToBytes(0);
        calldata[0] = sig[0];
        calldata[1] = sig[1];
        calldata[2] = sig[2];
        calldata[3] = sig[3];
        // Padded address
        for (uint j = 0; j < uintInBytes.length; j++) {
            calldata[4 + j] = uintInBytes[j];
        }
        pal.propose(governance, address(governance), calldata, 0);
        uint id = governance.actionCount();
        hal.confirm(governance, id);
        hal.trigger(governance, id);
        var (, active, ) = governance.getVersionById(0);
        assert(!active);
    }

    function activateVersion(Version version) {
        bytes memory calldata = new bytes(36);
        bytes4 sig = bytes4(sha3("addVersion(address)"));
        bytes memory addressInBytes = addressToBytes(address(version));
        calldata[0] = sig[0];
        calldata[1] = sig[1];
        calldata[2] = sig[2];
        calldata[3] = sig[3];
        // Padded address
        for (uint j = 0; j < addressInBytes.length; j++) {
            calldata[16 + j] = addressInBytes[j];
        }
        pal.propose(governance, address(governance), calldata, 0);
        uint id = governance.actionCount();
        hal.confirm(governance, id);
        hal.trigger(governance, id);
    }

    function addressToBytes(address a) constant returns (bytes b){
       assembly {
            let m := mload(0x40)
            mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
            mstore(0x40, add(m, 52))
            b := m
       }
    }

    function uintToBytes(uint256 x) returns (bytes b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
    }
}

contract Caller {
    function () payable {}

    function propose(Governance governance, address target, bytes calldata, uint value) {
        governance.propose(target, calldata, value);
    }

    function confirm(Governance governance, uint id) {
        governance.confirm(id);
    }

    function trigger(Governance governance, uint id) {
        governance.trigger(id);
    }
}
