pragma solidity ^0.4.19;

import '../assets/Asset.sol';
import './SharesInterface.sol';

/// @title Shares Contract for creating ERC20 compliant assets.
/// @author Melonport AG <team@melonport.com>
/// @notice Fund
contract Shares is Asset, SharesInterface {

    // FIELDS

    // Constructor fields
    string public name;
    string public symbol;
    uint public decimal;
    uint public creationTime;

    // VIEW METHODS

    function getName() view returns (string) { return name; }
    function getSymbol() view returns (string) { return symbol; }
    function getDecimals() view returns (uint) { return decimal; }
    function getCreationTime() view returns (uint) { return creationTime; }
    function toSmallestShareUnit(uint quantity) view returns (uint) { return mul(quantity, 10 ** getDecimals()); }
    function toWholeShareUnit(uint quantity) view returns (uint) { return quantity / (10 ** getDecimals()); }

    /// @param _name Name these shares
    /// @param _symbol Symbol of shares
    /// @param _decimal Amount of decimals sharePrice is denominated in, defined to be equal as deciamls in REFERENCE_ASSET contract
    /// @param _creationTime Timestamp of share creation
    function Shares(string _name, string _symbol, uint _decimal, uint _creationTime) {
        name = _name;
        symbol = _symbol;
        decimal = _decimal;
        creationTime = _creationTime;
    }

    // INTERNAL METHODS

    function createShares(address recipient, uint shareQuantity) internal {
        totalSupply = add(totalSupply, shareQuantity);
        balances[recipient] = add(balances[recipient], shareQuantity);
        Created(msg.sender, now, shareQuantity);
    }

    function annihilateShares(address recipient, uint shareQuantity) internal {
        totalSupply = sub(totalSupply, shareQuantity);
        balances[recipient] = sub(balances[recipient], shareQuantity);
        Annihilated(msg.sender, now, shareQuantity);
    }

}
