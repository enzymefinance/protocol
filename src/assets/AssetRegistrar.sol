pragma solidity ^0.4.17;

import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import './AssetRegistrarInterface.sol';

/// @title Asset Registar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Chain independent asset registrar for the Melon protocol
contract AssetRegistrar is DBC, Owned, AssetRegistrarInterface {

    // TYPES

    struct Asset {
        string name; // Human-readable name of the Asset as in ERC223 token standard
        string symbol; // Human-readable symbol of the Asset as in ERC223 token standard
        uint decimal; // Decimal, order of magnitude of precision, of the Asset as in ERC223 token standard
        string url; // URL for additional information of Asset
        bytes32 ipfsHash; // Same as url but for ipfs
        bytes32 chainId; // On which chain this asset resides
        address breakIn; // Break in contract on destination chain
        address breakOut; // Break out contract on this chain; A way to leave
        bool exists; // Is this asset registered
    }

    // FIELDS

    // Methods fields
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
    function getDecimals(address ofAsset) constant returns (uint) { return information[ofAsset].decimal; }

    // NON-CONSTANT METHODS

    /// @notice Registers an Asset residing in a chain
    /// @dev Pre: Only registrar owner should be able to register
    /// @dev Post: Address ofAsset is registered
    /// @param ofAsset Address of asset to be registered
    /// @param name Human-readable name of the Asset as in ERC223 token standard
    /// @param symbol Human-readable symbol of the Asset as in ERC223 token standard
    /// @param decimal Human-readable symbol of the Asset as in ERC223 token standard
    /// @param url Url for extended information of the asset
    /// @param ipfsHash Same as url but for ipfs
    /// @param chainId Chain where the asset resides
    /// @param breakIn Address of break in contract on destination chain
    /// @param breakOut Address of break out contract on this chain
    function register(
        address ofAsset,
        string name,
        string symbol,
        uint decimal,
        string url,
        bytes32 ipfsHash,
        bytes32 chainId,
        address breakIn,
        address breakOut
    )
        pre_cond(isOwner())
        pre_cond(notRegistered(ofAsset))
        post_cond(isRegistered(ofAsset))
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
    }

    /// @notice Updates description information of a registered Asset
    /// @dev Pre: Owner can change an existing entry
    /// @dev Post: Changed Name, Symbol, URL and/or IPFSHash
    /// @param ofAsset Address of the asset to be updated
    /// @param name Human-readable name of the Asset as in ERC223 token standard
    /// @param symbol Human-readable symbol of the Asset as in ERC223 token standard
    /// @param url Url for extended information of the asset
    /// @param ipfsHash Same as url but for ipfs
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

    /// @notice Deletes an existing entry
    /// @dev Owner can delete an existing entry
    /// @param ofAsset address for which specific information is requested
    function remove(
        address ofAsset
    )
        pre_cond(isOwner())
        pre_cond(isRegistered(ofAsset))
        //post_cond(notRegistered(ofAsset)) // Wait for next release of solidity
    {
        delete information[ofAsset]; // Sets exists boolean to false
        assert(notRegistered(ofAsset));
    }
}
