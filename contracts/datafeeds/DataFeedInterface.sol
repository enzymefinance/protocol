pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';

/// @title DataFeed Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice DataFeed according to the Standard Data Feed Contract; See https://github.com/ethereum/wiki/wiki/Standardized_Contract_APIs#data-feeds
/// @notice This is to be considered as an interface on how to access the underlying DataFeed Contract
contract DataFeedInterface {

    // EVENTS

    event DataUpdated(uint id);

    // CONSTANT METHODS

    // Get registartion specific information
    function numRegisteredAssets() constant returns (uint) {}
    function getRegisteredAssetAt(uint id) constant returns (address) {}
    // Get asset specific information
    function getName(address ofAsset) constant returns (string) {}
    function getSymbol(address ofAsset) constant returns (string) {}
    function getDecimals(address ofAsset) constant returns (uint256) {}
    function getDescriptiveInformation(address ofAsset) constant returns (string, string, string, bytes32) {}
    function getSpecificInformation(address ofAsset) constant returns (uint256, bytes32, address, address) {}
    // Get data feed specific information
    function getQuoteAsset() constant returns (address) {}
    function getInterval() constant returns (uint) {}
    function getValidity() constant returns (uint) {}
    function getLastUpdateId() constant returns (uint) {}
    function getLastUpdateTimestamp() constant returns (uint) {}
    // Get asset specific information
    function isValid(address ofAsset) constant returns (bool) {}
    function getPrice(address ofAsset) constant returns (uint) {}
    function getInvertedPrice(address ofAsset) constant returns (uint) {}
    function getReferencePrice(address ofBase, address ofQuote) constant returns (uint) {}
    function getPriceOfOrder(
        ERC20    haveToken,
        ERC20    wantToken,
        uint     haveAmount,
        uint     wantAmount
    )
        constant returns (uint)
    {}
    function getTimestamp(address ofAsset) constant returns (uint) {}
    function getData(address ofAsset) constant returns (uint, uint) {}
}
