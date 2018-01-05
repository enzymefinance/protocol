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
        version = new Version(VERSION_NUMBER, governance, melonToken, nativeToken);
        pal.proposeVersion(governance, version);
        pal.approveVersion(governance, version);
        hal.approveVersion(governance, version);
        hal.triggerVersion(governance, version);
        var (returnedVersion, active, ) = governance.getVersionById(0);
        assertEq(returnedVersion, version);
        assert(active);
    }

    function test_shutDownVersion() {
        version = new Version(VERSION_NUMBER, governance, melonToken, nativeToken);
        pal.proposeVersion(governance, version);
        pal.approveVersion(governance, version);
        hal.approveVersion(governance, version);
        hal.triggerVersion(governance, version);
        hal.proposeShutdown(governance, 0);
        hal.approveShutdown(governance, 0);
        pal.approveShutdown(governance, 0);
        pal.triggerShutdown(governance, 0);
        var (, active, ) = governance.getVersionById(0);
        assert(!active);
    }
}

contract Caller {
    function () payable {}

    function proposeVersion(Governance governance, address ofVersion) {
        governance.proposeVersion(ofVersion);
    }

    function approveVersion(Governance governance, address ofVersion) {
        governance.approveVersion(ofVersion);
    }

    function triggerVersion(Governance governance, address ofVersion) {
        governance.triggerVersion(ofVersion);
    }

    function proposeShutdown(Governance governance, uint ofVersionId) {
        governance.proposeShutdown(ofVersionId);
    }

    function approveShutdown(Governance governance, uint ofVersionId) {
        governance.approveShutdown(ofVersionId);
    }

    function triggerShutdown(Governance governance, uint ofVersionId) {
        governance.triggerShutdown(ofVersionId);
    }
}
