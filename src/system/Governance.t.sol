pragma solidity ^0.4.11;

import "ds-test/test.sol";
import "./Governance.sol";
import "../assets/PreminedAsset.sol";
import "../version/Version.sol";


contract DataFeedTest is DSTest {
    Governance governance;
    PreminedAsset melonToken;
    Version version;

    // constants
    uint MELON_DECIMALS = 18;
    uint PREMINED_AMOUNT = 10 ** 28;
    string VERSION_NUMBER = "1.2.3";

    function setUp() {
        melonToken = new PreminedAsset("Melon Token", "MLN-T", MELON_DECIMALS, PREMINED_AMOUNT);
        governance = new Governance();
    }

    function testAddAndGetVersion() {
        version = new Version(VERSION_NUMBER, governance, melonToken);
        governance.addVersion(version);
        var (returnedVersion, active, ) = governance.getVersionById(0);

        assertEq(returnedVersion, version);
        assert(active);
    }

    function testShutDownVersion() {
        version = new Version(VERSION_NUMBER, governance, melonToken);
        governance.addVersion(version);
        governance.shutDownVersion(0);
        var (, active, ) = governance.getVersionById(0);

        assert(!active);
    }
}
