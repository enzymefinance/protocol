pragma solidity ^0.4.11;

/// @title AssetRegistrar Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice AssetRegistrar according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as an interface on how to access the underlying AssetRegistrar Contract
contract AssetRegistrarInterface {

    // CONSTANT METHODS

    // Get general information
    function numRegisteredAssets() constant returns (uint) {}
    function getRegisteredAssetAt(uint id) constant returns (address) {}
    // Get specific information
    function getDescriptiveInformation(address ofAsset) constant returns (string, string, string, bytes32) {}
    function getName(address ofAsset) constant returns (string) {}
    function getSymbol(address ofAsset) constant returns (string) {}
    function getDecimals(address ofAsset) constant returns (uint256) {}
    function getSpecificInformation(address ofAsset) constant returns (uint256, bytes32, address, address) {}
}
