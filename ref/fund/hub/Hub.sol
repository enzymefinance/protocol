pragma solidity ^0.4.21;


/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub {

    // TODO: make this more generic, and make fund "head" contract a derivative of this
    // TODO: ensure component is not overloaded far beyond routing
    // TODO: use the contract types instead of generic address (if possible to avoid circular imports)
    // TODO: track spokes and add them dynamically when the Fund is created
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
        spokesSet = true;
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
    }
}

