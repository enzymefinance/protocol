pragma solidity ^0.4.21;


/// @notice Router for communication between components
contract Hub {

    // TODO: use the contract types instead of generic address when available
    address public shares;
    address public vault;
    address public participation;
    address public trading;
    address public policyManager;
    address public feeManager;
    address public accounting;
    address public priceSource;
    address public registrar;
    address public version;

    function Hub(
        address _shares,
        address _vault,
        address _participation,
        address _trading,
        address _policyManager,
        address _feeManager,
        address _accounting,
        address _priceSource,
        address _registrar,
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
        registrar = _registrar;
        version = _version;
    }
}
