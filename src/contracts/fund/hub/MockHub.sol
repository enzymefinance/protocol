pragma solidity ^0.4.21;

import "guard.sol";
import "Spoke.sol";

/// @notice Hub used for testing
contract MockHub is DSGuard {

    struct Settings {
        address accounting;
        address feeManager;
        address participation;
        address policyManager;
        address shares;
        address trading;
        address vault;
        address priceSource;
        address canonicalRegistrar;
        address version;
        address engine;
        address mlnAddress;
    }
    Settings public settings;
    address public manager;
    string public name;
    bool public isShutDown;

    function setManager(address _manager) { manager = _manager; }

    function setName(string _name) { name = _name; }

    function shutDownFund() { isShutDown = true; }

    function setShutDownState(bool _state) { isShutDown = _state; }

    function setSpokes(address[12] _spokes) {
        settings.accounting = _spokes[0];
        settings.feeManager = _spokes[1];
        settings.participation = _spokes[2];
        settings.policyManager = _spokes[3];
        settings.shares = _spokes[4];
        settings.trading = _spokes[5];
        settings.vault = _spokes[6];
        settings.priceSource = _spokes[7];
        settings.canonicalRegistrar = _spokes[8];
        settings.version = _spokes[9];
        settings.engine = _spokes[10];
        settings.mlnAddress = _spokes[11];
    }

    function setRouting() {
        address[12] memory spokes = [
            settings.accounting, settings.feeManager, settings.participation,
            settings.policyManager, settings.shares, settings.trading,
            settings.vault, settings.priceSource, settings.canonicalRegistrar,
            settings.version, settings.engine, settings.mlnAddress
        ];
        Spoke(settings.accounting).initialize(spokes);
        Spoke(settings.feeManager).initialize(spokes);
        Spoke(settings.participation).initialize(spokes);
        Spoke(settings.policyManager).initialize(spokes);
        Spoke(settings.shares).initialize(spokes);
        Spoke(settings.trading).initialize(spokes);
        Spoke(settings.vault).initialize(spokes);
    }

    function setPermissions() {
        permit(settings.participation, settings.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(settings.trading, settings.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(settings.participation, settings.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(settings.participation, settings.shares, bytes4(keccak256('destroyFor(address,uint256)')));
        permit(settings.feeManager, settings.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(settings.participation, settings.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(settings.participation, settings.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(settings.trading, settings.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(settings.trading, settings.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(settings.accounting, settings.feeManager, bytes4(keccak256('rewardAllFees()')));
        permit(manager, settings.feeManager, bytes4(keccak256('register(address)')));
        permit(manager, settings.feeManager, bytes4(keccak256('batchRegister(address[])')));
        permit(manager, settings.policyManager, bytes4(keccak256('register(bytes4,address)')));
        permit(manager, settings.policyManager, bytes4(keccak256('batchRegister(bytes4[],address[])')));
        permit(manager, settings.participation, bytes4(keccak256('enableInvestment(address[])')));
        permit(manager, settings.participation, bytes4(keccak256('disableInvestment(address[])')));
        permit(bytes32(bytes20(msg.sender)), ANY, ANY);
    }

    function permitSomething(address _from, address _to, bytes4 _sig) {
        permit(
            bytes32(bytes20(_from)),
            bytes32(bytes20(_to)),
            _sig
        );
    }

    function initializeSpoke(address _spoke) {
        address[12] memory spokes = [
            settings.accounting, settings.feeManager, settings.participation,
            settings.policyManager, settings.shares, settings.trading,
            settings.vault, settings.priceSource, settings.canonicalRegistrar,
            settings.version, settings.engine, settings.mlnAddress
        ];
        Spoke(_spoke).initialize(spokes);
    }

    function vault() view returns (address) { return settings.vault; }
    function accounting() view returns (address) { return settings.accounting; }
    function priceSource() view returns (address) { return settings.priceSource; }
    function participation() view returns (address) { return settings.participation; }
    function trading() view returns (address) { return settings.trading; }
    function shares() view returns (address) { return settings.shares; }
    function policyManager() view returns (address) { return settings.policyManager; }
}

