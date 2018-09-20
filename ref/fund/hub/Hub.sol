pragma solidity ^0.4.21;


import "../../dependencies/guard.sol";
import "./Spoke.sol";

/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub is DSGuard {

    // TODO: ACL may be better someplace else; evaluate this
    // TODO: make this more generic, and make fund "head" contract a derivative of this
    // TODO: ensure component is not overloaded far beyond routing
    // TODO: use the contract types instead of generic address (if possible to avoid circular imports)
    struct Settings {     // TODO: improve naming; perhaps inherit from same thing as Spoke
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
    }
    Settings public settings;
    address[10] public spokes;
    address public manager;
    bool public spokesSet;
    bool public routingSet;
    bool public permissionsSet;

    constructor(address _manager) {
        manager = _manager;
    }

    function setSpokes(address[10] _spokes) {
        require(!spokesSet);
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
        spokes = _spokes;
        spokesSet = true;
    }

    function setRouting() {
        require(spokesSet);
        require(!routingSet);
        require(!permissionsSet);
        routingSet = true;
    }

    // TODO: decide how to handle `owner`; should any of the components have an owner? if not then we need to remove owner after everything is initialized.
    function setPermissions() {
        require(spokesSet);
        require(routingSet);
        require(!permissionsSet);
        permit(settings.participation, settings.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(settings.trading, settings.vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(settings.participation, settings.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(settings.participation, settings.shares, bytes4(keccak256('destroyFor(address,uint256)')));
        permit(settings.feeManager, settings.shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(settings.participation, settings.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(settings.participation, settings.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(settings.trading, settings.accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(settings.trading, settings.accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permissionsSet = true;
    }

    function getSpokes() view returns (address[10]) {
        return spokes;
    }

    // TODO: these are used in the adapters and fee contracts; there must be a better way than using nominal functions like this
    function vault() view returns (address) { return settings.vault; }
    function accounting() view returns (address) { return settings.accounting; }
    function priceSource() view returns (address) { return settings.priceSource; }
    function shares() view returns (address) { return settings.shares; }
}

