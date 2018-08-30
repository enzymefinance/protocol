pragma solidity ^0.4.21;


/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub {

    // TODO: ensure component is not overloaded far beyond routing
    // TODO: use the contract types instead of generic address when available
    // TODO: track spokes and add them dynamically when the Fund is created
    address public shares;
    address public vault;
    address public participation;
    address public trading;
    address public policyManager;
    address public feeManager;
    address public accounting;
    address public priceSource;
    address public canonicalRegistrar;
    address public version;
    address public manager;

    constructor(address _manager) {
        manager = _manager;
    }

    // TODO: make only callable once
    function setComponents( // or setSpokes(?)
        address _shares,
        address _vault,
        address _participation,
        address _trading,
        address _policyManager,
        address _feeManager,
        address _accounting,
        address _priceSource,
        address _canonicalRegistrar,
        address _version
    ) {
        shares = _shares;
        vault = _vault;
        participation = _participation;
        trading = _trading;
        policyManager = _policyManager;
        feeManager = _feeManager;
        accounting = _accounting;
        priceSource = _priceSource;
        canonicalRegistrar = _canonicalRegistrar;
        version = _version;
    }
}
