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
        //post_cond(isRegistered(ofAsset)) // XXX: oddly, this doesn't work with a post_condition, so it's just added to the end of the function body. Investigate this eventually.
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
}
