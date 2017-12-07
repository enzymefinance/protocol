pragma solidity ^0.4.19;

/// @title AssetRegistrar Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice AssetRegistrar according to the Standard Price Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as an interface on how to access the underlying AssetRegistrar Contract
contract AssetRegistrarInterface {
    // EVENTS

    // CONSTANT METHODS

    // Get asset specific information
    function getDescriptiveInformation(address ofAsset) view returns (string, string, string, bytes32) {}
    function getName(address ofAsset) view returns (string) {}
    function getSymbol(address ofAsset) view returns (string) {}
    function getDecimal(address ofAsset) view returns (uint) {}
    function isExistent(address ofAsset) view returns (bool) {}
    function getSpecificInformation(address ofAsset) view returns (uint, bytes32, address, address) {}
}
