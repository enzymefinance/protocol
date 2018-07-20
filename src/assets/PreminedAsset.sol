pragma solidity ^0.4.21;

import "../assets/Asset.sol";

/// @title Premined asset Contract for testing
/// @author Melonport AG <team@melonport.com>
/// @notice Do not use in production environment net
contract PreminedAsset is Asset {

  // FIELDS

    // Constructor fields
    bytes32 public name;
    bytes8 public symbol;
    uint public decimals;
    uint public creationTime;

    // METHODS

    // CONSTRUCTOR

    /// @param _name Name these shares
    /// @param _symbol Symbol of shares
    /// @param _decimal Amount of decimals sharePrice is denominated in, defined to be equal as deciamls in REFERENCE_ASSET contract
    /// @param _creationTime Timestamp of share creation

    /// @notice Asset with 10 ** 28 of premined token given to msg.sender
    function PreminedAsset(bytes32 _name, bytes8 _symbol, uint _decimal, uint _creationTime) {
        // Premine balances of contract creator and totalSupply
        name = _name;
        symbol = _symbol;
        decimals = _decimal;
        creationTime = _creationTime;
        balances[msg.sender] = 10 ** uint256(28);
        _totalSupply = 10 ** uint256(28);
    }
}
