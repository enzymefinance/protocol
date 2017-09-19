pragma solidity ^0.4.11;

import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import './AssetRegistrarInterface.sol';

/// @title Asset Registar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Chain independent asset registrar for the Melon protocol
contract AssetRegistrar is DBC, Owned, AssetRegistrarInterface {

    // TYPES

    struct Asset {
        string name;
        string symbol;
        uint256 decimal;
        string url;
        bytes32 ipfsHash;
        bytes32 chainId;
        address breakIn;
        address breakOut;
        bool exists;
    }

    // FIELDS

    // Function fields
    mapping (address => Asset) public information;
    address[] public registeredAssets;

    // PRE, POST AND INVARIANT CONDITIONS

    function notRegistered(address a) internal constant returns (bool) { return information[a].exists == false; }

    // CONSTANT METHODS

    // Get registration specific information
    function isRegistered(address ofAsset) constant returns (bool) { return !notRegistered(ofAsset); }
    function numRegisteredAssets() constant returns (uint) { return registeredAssets.length; }
    function getRegisteredAssetAt(uint id) constant returns (address) { return registeredAssets[id]; }
    // Get asset specific information
    function getName(address ofAsset) constant returns (string) { return information[ofAsset].name; }
    function getSymbol(address ofAsset) constant returns (string) { return information[ofAsset].symbol; }
    function getDecimals(address ofAsset) constant returns (uint256) { return information[ofAsset].decimal; }

    /// @notice Get human-readable information about an Asset
    /// @param ofAsset address for which descriptive information is requested
    function getDescriptiveInformation(address ofAsset)
        constant
        returns (string, string, string, bytes32)
    {
        return (
            information[ofAsset].name,
            information[ofAsset].symbol,
            information[ofAsset].url,
            information[ofAsset].ipfsHash
        );
    }

    /// @notice Get fund accounting related information about an Asset
    /// @param ofAsset address for which specific information is requested
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

    /// @dev Pre:  Only registrar owner should be able to register
    /// @dev Post: Address ofAsset is registered
    function register(
        address ofAsset,
        string name,
        string symbol,
        uint256 decimal,
        string url,
        bytes32 ipfsHash,
        bytes32 chainId,
        address breakIn,
        address breakOut
    )
        pre_cond(isOwner())
        pre_cond(notRegistered(ofAsset))
        //post_cond(isRegistered(ofAsset)) // Wait for next release of solidity
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
            exists: true
        });
        assert(isRegistered(ofAsset));
    }

    /// @dev Pre: Owner can change an existing entry
    /// @dev Post: Changed Name, Symbol, URL and/or IPFSHash
    function updateDescriptiveInformation(
        address ofAsset,
        string name,
        string symbol,
        string url,
        bytes32 ipfsHash
    )
        pre_cond(isOwner())
        pre_cond(isRegistered(ofAsset))
    {
        Asset asset = information[ofAsset];
        asset.name = name;
        asset.symbol = symbol;
        asset.url = url;
        asset.ipfsHash = ipfsHash;
    }

    /// @dev Owner can delete an existing entry
    /// @param ofAsset address for which specific information is requested
    /// @return deletes an existing entry
    function remove(
        address ofAsset
    )
        pre_cond(isOwner())
        pre_cond(isRegistered(ofAsset))
        post_cond(notRegistered(ofAsset))
    {
        delete information[ofAsset]; // Sets exists boolean to false
    }
}
