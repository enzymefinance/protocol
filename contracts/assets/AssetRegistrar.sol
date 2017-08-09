pragma solidity ^0.4.11;

import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title Asset Registar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Chain independent asset registrar for the Melon protocol
contract AssetRegistrar is DBC, Owned {

    // FIELDS

    // Fields that are only changed in constructor
    address public backupOwner;

    struct Information {
        address addr;
        string name;
        string symbol;
        uint256 decimal;
        address breakIn;
        address breakOut;
        bytes32 chainId;
    }

    mapping (bytes32 => Information) public information; // InformationHash -> Information
    // PRE, POST, INVARIANT CONDITIONS

    function isNotNullAddress(address x) internal returns (bool) { return x != 0; }
    function isUnique(bytes32 hash) internal returns (bool) { return isNotNullAddress(information[hash].addr); }

    // CONSTANT METHODS

    function getName() constant returns (string) {}
    function getSymbol() constant returns (string) {}
    function getDecimals() constant returns (uint) {}

    // NON-CONSTANT METHODS

    function AssetRegistrar() {}

    /// Pre: Only Backup Owner; Non-null new Backup Owner
    /// Post: Swaps backup Owner to Owner and new backup Owner to backup Owner
    function register(
        address addr,
        string name,
        string symbol,
        uint256 decimal,
        address breakIn,
        address breakOut,
        bytes32 chainId
    )
    pre_cond(isUnique(sha3(addr, name, symbol, decimal, breakIn, breakOut, chainId)))
    {
        bytes32 hash = sha3(addr, name, symbol, decimal, breakIn, breakOut, chainId);
        information[hash] = Information({
            addr: addr,
            name: name,
            symbol: symbol,
            decimal: decimal,
            breakIn: breakIn,
            breakOut: breakOut,
            chainId: chainId
        });
    }
}
