pragma solidity ^0.4.19;

import "../dependencies/DBC.sol";
import "ds-thing/thing.sol";

/// @title Asset Registar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Chain independent asset registrar for the Melon protocol
contract CanonicalRegistrar is DSThing, DBC {

    // TYPES

    struct Asset {
        address breakIn; // Break in contract on destination chain
        address breakOut; // Break out contract on this chain; A way to leave
        bytes32 chainId; // On which chain this asset resides
        uint decimal; // Decimal, order of magnitude of precision, of the Asset as in ERC223 token standard
        bool exists; // Is this asset registered
        string ipfsHash; // Same as url but for ipfs
        bytes32 name; // Human-readable name of the Asset as in ERC223 token standard
        uint price; // Price of asset quoted against `QUOTE_ASSET` * 10 ** decimals
        bytes8 symbol; // Human-readable symbol of the Asset as in ERC223 token standard
        uint timestamp; // Timestamp of last price update of this asset
        string url; // URL for additional information of Asset
    }

    // FIELDS

    // Methods fields
    mapping (address => Asset) public information;

    // METHODS

    // PUBLIC METHODS

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
        bytes32 name,
        bytes8 symbol,
        uint decimal,
        string url,
        string ipfsHash,
        bytes32 chainId,
        address breakIn,
        address breakOut
    )
        auth
        pre_cond(!information[ofAsset].exists)
    {
        Asset asset = information[ofAsset];
        asset.name = name;
        asset.symbol = symbol;
        asset.decimal = decimal;
        asset.url = url;
        asset.ipfsHash = ipfsHash;
        asset.breakIn = breakIn;
        asset.breakOut = breakOut;
        asset.exists = true;
        assert(information[ofAsset].exists);
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
        bytes32 name,
        bytes8 symbol,
        string url,
        string ipfsHash
    )
        auth
        pre_cond(information[ofAsset].exists)
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
        auth
        pre_cond(information[ofAsset].exists)
    {
        delete information[ofAsset]; // Sets exists boolean to false
        assert(!information[ofAsset].exists);
    }

    // PUBLIC VIEW METHODS

    // Get asset specific information
    function getName(address ofAsset) view returns (bytes32) { return information[ofAsset].name; }
    function getSymbol(address ofAsset) view returns (bytes8) { return information[ofAsset].symbol; }
    function getDecimals(address ofAsset) view returns (uint) { return information[ofAsset].decimal; }
    function isRegistered(address ofAsset) view returns (bool) { return information[ofAsset].exists; }
}
