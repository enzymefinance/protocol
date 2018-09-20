pragma solidity ^0.4.21;


import "../../dependencies/guard.sol";

/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub is DSGuard {

    // TODO: ACL may be better someplace else; evaluate this
    // TODO: make this more generic, and make fund "head" contract a derivative of this
    // TODO: ensure component is not overloaded far beyond routing
    // TODO: use the contract types instead of generic address (if possible to avoid circular imports)
    address public accounting;
    address public feeManager;
    address public participation;
    address public policyManager;
    address public shares;
    address public trading;
    address public vault;
    address public priceSource;
    address public canonicalRegistrar;
    address public version;
    address public manager;

    bool public spokesSet;

    constructor(address _manager) {
        manager = _manager;
    }

    function setComponents( // or setSpokes(?)
        address _accounting,
        address _feeManager,
        address _participation,
        address _policyManager,
        address _shares,
        address _trading,
        address _vault,
        address _priceSource,
        address _canonicalRegistrar,
        address _version
    ) {
        require(!spokesSet);
        accounting = _accounting;
        feeManager = _feeManager;
        participation = _participation;
        policyManager = _policyManager;
        shares = _shares;
        trading = _trading;
        vault = _vault;
        priceSource = _priceSource;
        canonicalRegistrar = _canonicalRegistrar;
        version = _version;
        spokesSet = true;
    }

    // TODO: decide how to handle `owner`; should any of the components have an owner? if not then we need to remove owner after everything is initialized.
    function setPermissions() {
        require(spokesSet);
        permit(participation, vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(trading, vault, bytes4(keccak256('withdraw(address,uint256)')));
        permit(participation, shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(participation, shares, bytes4(keccak256('destroyFor(address,uint256)')));
        permit(feeManager, shares, bytes4(keccak256('createFor(address,uint256)')));
        permit(participation, accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(participation, accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
        permit(trading, accounting, bytes4(keccak256('addAssetToOwnedAssets(address)')));
        permit(trading, accounting, bytes4(keccak256('removeFromOwnedAssets(address)')));
    }
}

