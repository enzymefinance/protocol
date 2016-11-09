pragma solidity ^0.4.4;

import "./RegistrarProtocol.sol";

/// @title Registrar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Routes internal data to smart-contracts
/// @notice Simple Registrar Contract, no adding of assets, no asset specific functionality.
contract Registrar is RegistrarProtocol {

    function Registrar(address[] _assets, address[] _prices, address[] _exchanges) {
        if (_assets.length != _prices.length ||
            _assets.length != _exchanges.length)
          throw;

        for (uint i = 0; i < _assets.length; ++i) {
            is_asset_available[_assets[i]] = true;
            assets.push(_assets[i]);
            prices.push(_prices[i]);
            exchanges.push(_exchanges[i]);
            exchange_for_asset[_assets[i]] = _exchanges[i];
        }
    }

    function numAssets() constant returns (uint) { return assets.length; }

    /// Lookup if asset can be stored in this vault
    function lookup(address _asset) constant returns(bool) {
        return is_asset_available[_asset];
    }

    /// Lookup if asset can be stored in this vault
    function lookupExchange(address _asset) constant returns (address) {
        return exchange_for_asset[_asset];
    }
}
