pragma solidity ^0.4.11;

import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';


/// @title Asset Registar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Chain independent asset registrar for the Melon protocol
contract AssetRegistrar is DBC, Owned {

    // TYPES

    struct Asset {
        string name;
        string symbol;
        uint256 decimal;
        string url;
        bytes32 ipfsHash;
        bytes32 chainId; // unique identifier on which chain we are located on
        address breakIn;
        address breakOut;
        bytes32 hash;
    }

    // FIELDS

    // Fields that can be changed by functions
    mapping (address => Asset) public information; // Asset specific information
    address[] public registeredAssets;

    // PRE, POST, INVARIANT CONDITIONS

    function isNotNullAddress(address x) internal returns (bool) { return x != 0; }
    function isNotSet(address x) internal returns (bool) { return information[x].hash.length == 0; }
    function isUnique(address x, bytes32 y) internal returns (bool) { return information[x].hash != y; }

    // CONSTANT METHODS

    // Get registartion specific information
    function isSet(address ofAsset) constant returns (bool) { return !isNotSet(ofAsset); }
    function numRegisteredAssets() constant returns (uint) { return registeredAssets.length; }
    function getRegisteredAssetAt(uint id) constant returns (address) { return registeredAssets[id]; }
    // Get asset specific information
    function getName(address ofAsset) constant returns (string) { return information[ofAsset].name; }
    function getSymbol(address ofAsset) constant returns (string) { return information[ofAsset].symbol; }
    function getDecimals(address ofAsset) constant returns (uint256) { return information[ofAsset].decimal; }
    function getDescriptiveInformation(address ofAsset)
        constant
        returns (string, string, uint256, string, bytes32)
    {
        return (
            information[ofAsset].name,
            information[ofAsset].symbol,
            information[ofAsset].decimal,
            information[ofAsset].url,
            information[ofAsset].ipfsHash
        );
    }
    function getSpecificInformation(address ofAsset)
        constant
        returns (uint256, bytes32, address, address)
    {
        return (
            information[ofAsset].decimal,
            information[ofAsset].chainId,
            information[ofAsset].breakIn,
            information[ofAsset].breakOut
        );
    }

    // NON-CONSTANT METHODS

    function AssetRegistrar() {}

    /// Pre: Only Backup Owner; Non-null new Backup Owner
    /// Post: Swaps backup Owner to Owner and new backup Owner to backup Owner
    function register(
        address ofAsset,
        string name,
        string symbol,
        uint256 decimal,
        string url,
        bytes32 ipfsHash,
        bytes32 chainId, // unique identifier on which chain we are located on
        address breakIn,
        address breakOut
    )
        pre_cond(isNotSet(ofAsset))
    {
        registeredAssets.push(ofAsset);
        information[ofAsset] = Asset({
            name: name,
            symbol: symbol,
            decimal: decimal,
            url: url,
            ipfsHash: ipfsHash,
            chainId: chainId,
            breakIn: breakIn,
            breakOut: breakOut,
            hash: sha3(name, symbol, decimal, breakIn, breakOut)
        });
    }
}
