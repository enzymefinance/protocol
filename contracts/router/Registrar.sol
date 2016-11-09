pragma solidity ^0.4.4;

import "./RegistrarProtocol.sol";

/// @title Registrar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes internal data to smart-contracts
/// @notice Simple Registrar Contract, no adding of assets, no asset specific functionality.
contract Registrar is RegistrarProtocol {

    // FILEDS
    
    address public owner = msg.sender;
    address[] public assets;
    address[] public prices;
    address[] public exchanges;

    mapping (address => bool) m_isAssetAvailable;
    mapping (address => address) m_exchangeForAsset; // exchange available for certain asset

    // EVENTS

    // MODIFIERS

    modifier maps_equal(address[] x, address[] y, address[] z) {
        if (x.length != y.length || y.length != z.length) throw;
        _;
    }

    // CONSTANT METHDOS

    function numAssets() constant returns (uint) { return assets.length; }

    function lookup(address _asset) constant returns(bool) { return m_isAssetAvailable[_asset]; }

    function lookupExchange(address _asset) constant returns (address) { return m_exchangeForAsset[_asset]; }

    // NON-CONSTANT METHODS

    function Registrar(address[] _assets, address[] _prices, address[] _exchanges)
        maps_equal(_assets, _prices, _exchanges)
    {
        for (uint i = 0; i < _assets.length; ++i) {
            m_isAssetAvailable[_assets[i]] = true;
            assets.push(_assets[i]);
            prices.push(_prices[i]);
            exchanges.push(_exchanges[i]);
            m_exchangeForAsset[_assets[i]] = _exchanges[i];
        }
    }
}
