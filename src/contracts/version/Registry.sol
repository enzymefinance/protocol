pragma solidity ^0.4.21;

import "../dependencies/auth.sol";

contract Registry is DSAuth {

    // TYPES
    struct Asset {
        bool exists;
        string name;
        string symbol;
        uint decimals;
        string url;
        string ipfsHash;
        address breakIn;
        address breakOut;
        uint[] standards;
        bytes4[] sigs;
        uint price;
        uint timestamp;
    }

    struct Exchange {
        bool exists;
        address adapter;
        bool takesCustody;
        bytes4[] sigs;
    }

    // FIELDS
    // Methods fields
    mapping (address => Asset) public assetInformation;
    address[] public registeredAssets;

    mapping (address => Exchange) public exchangeInformation;
    address[] public registeredExchanges;

    // METHODS

    // PUBLIC METHODS

    /// @notice Registers an Asset information entry
    /// @dev Pre: Only registrar owner should be able to register
    /// @dev Post: Address _asset is registered
    /// @param _asset Address of asset to be registered
    /// @param _name Human-readable name of the Asset as in ERC223 token standard
    /// @param _symbol Human-readable symbol of the Asset as in ERC223 token standard
    /// @param _decimals Human-readable symbol of the Asset as in ERC223 token standard
    /// @param _url Url for extended information of the asset
    /// @param _ipfsHash Same as url but for ipfs
    /// @param _breakInBreakOut Address of break in and break out contracts on destination chain
    /// @param _standards Integers of EIP standards this asset adheres to
    /// @param _sigs Function signatures for whitelisted asset functions
    function registerAsset(
        address _asset,
        string _name,
        string _symbol,
        uint _decimals,
        string _url,
        string _ipfsHash,
        address[2] _breakInBreakOut,
        uint[] _standards,
        bytes4[] _sigs
    ) auth {
        require(!assetInformation[_asset].exists);
        assetInformation[_asset].exists = true;
        registeredAssets.push(_asset);
        updateAsset(
            _asset,
            _name,
            _symbol,
            _decimals,
            _url,
            _ipfsHash,
            _breakInBreakOut,
            _standards,
            _sigs
        );
        assert(assetInformation[_asset].exists);
    }

    /// @notice Register an exchange information entry
    /// @dev Pre: Only registrar owner should be able to register
    /// @dev Post: Address _exchange is registered
    /// @param _exchange Address of the exchange
    /// @param _adapter Address of exchange adapter for this exchange
    /// @param _takesCustody Whether this exchange takes custody of tokens before trading
    /// @param _sigs Function signatures for whitelisted exchange functions
    function registerExchange(
        address _exchange,
        address _adapter,
        bool _takesCustody,
        bytes4[] _sigs
    ) auth {
        require(!exchangeInformation[_exchange].exists);
        exchangeInformation[_exchange].exists = true;
        registeredExchanges.push(_exchange);
        updateExchange(
            _exchange,
            _adapter,
            _takesCustody,
            _sigs
        );
        assert(exchangeInformation[_exchange].exists);
    }

    /// @notice Updates description information of a registered Asset
    /// @dev Pre: Owner can change an existing entry
    /// @dev Post: Changed Name, Symbol, URL and/or IPFSHash
    /// @param _asset Address of the asset to be updated
    /// @param _name Human-readable name of the Asset as in ERC223 token standard
    /// @param _symbol Human-readable symbol of the Asset as in ERC223 token standard
    /// @param _url Url for extended information of the asset
    /// @param _ipfsHash Same as url but for ipfs
    function updateAsset(
        address _asset,
        string _name,
        string _symbol,
        uint _decimals,
        string _url,
        string _ipfsHash,
        address[2] _breakInBreakOut,
        uint[] _standards,
        bytes4[] _sigs
    ) auth {
        require(assetInformation[_asset].exists);
        Asset asset = assetInformation[_asset];
        asset.name = _name;
        asset.symbol = _symbol;
        asset.decimals = _decimals;
        asset.url = _url;
        asset.ipfsHash = _ipfsHash;
        asset.breakIn = _breakInBreakOut[0];
        asset.breakOut = _breakInBreakOut[1];
        asset.standards = _standards;
        asset.sigs = _sigs;
    }

    function updateExchange(
        address _exchange,
        address _adapter,
        bool _takesCustody,
        bytes4[] _sigs
    ) auth {
        require(exchangeInformation[_exchange].exists);
        Exchange exchange = exchangeInformation[_exchange];
        exchange.adapter = _adapter;
        exchange.takesCustody = _takesCustody;
        exchange.sigs = _sigs;
    }

    // TODO: check max size of array before remaking this becomes untenable
    /// @notice Deletes an existing entry
    /// @dev Owner can delete an existing entry
    /// @param _asset address for which specific information is requested
    function removeAsset(
        address _asset,
        uint _assetIndex
    ) auth {
        require(assetInformation[_asset].exists);
        require(registeredAssets[_assetIndex] == _asset);
        delete assetInformation[_asset];
        delete registeredAssets[_assetIndex];
        for (uint i = _assetIndex; i < registeredAssets.length-1; i++) {
            registeredAssets[i] = registeredAssets[i+1];
        }
        registeredAssets.length--;
        assert(!assetInformation[_asset].exists);
    }

    /// @notice Deletes an existing entry
    /// @dev Owner can delete an existing entry
    /// @param _exchange address for which specific information is requested
    /// @param _exchangeIndex index of the exchange in array
    function removeExchange(
        address _exchange,
        uint _exchangeIndex
    ) auth {
        require(exchangeInformation[_exchange].exists);
        require(registeredExchanges[_exchangeIndex] == _exchange);
        delete exchangeInformation[_exchange];
        delete registeredExchanges[_exchangeIndex];
        for (uint i = _exchangeIndex; i < registeredExchanges.length-1; i++) {
            registeredExchanges[i] = registeredExchanges[i+1];
        }
        registeredExchanges.length--;
        assert(!exchangeInformation[_exchange].exists);
    }

    // PUBLIC VIEW METHODS

    // get asset specific information
    function getName(address _asset) view returns (string) { return assetInformation[_asset].name; }
    function getSymbol(address _asset) view returns (string) { return assetInformation[_asset].symbol; }
    function getDecimals(address _asset) view returns (uint) { return assetInformation[_asset].decimals; }
    function assetIsRegistered(address _asset) view returns (bool) { return assetInformation[_asset].exists; }
    function getRegisteredAssets() view returns (address[]) { return registeredAssets; }
    function assetMethodIsAllowed(address _asset, bytes4 _sig)
        returns (bool)
    {
        bytes4[] memory signatures = assetInformation[_asset].sigs;
        for (uint i = 0; i < signatures.length; i++) {
            if (signatures[i] == _sig) {
                return true;
            }
        }
        return false;
    }

    // get exchange-specific information
    function exchangeIsRegistered(address _exchange) view returns (bool) { return exchangeInformation[_exchange].exists; }
    function getRegisteredExchanges() view returns (address[]) { return registeredExchanges; }
    function getExchangeInformation(address _exchange)
        view
        returns (address, bool)
    {
        Exchange exchange = exchangeInformation[_exchange];
        return (
            exchange.adapter,
            exchange.takesCustody
        );
    }
    function getExchangeFunctionSignatures(address _exchange)
        view
        returns (bytes4[])
    {
        return exchangeInformation[_exchange].sigs;
    }
    function exchangeMethodIsAllowed(
        address _exchange, bytes4 _sig
    )
        returns (bool)
    {
        bytes4[] memory signatures = exchangeInformation[_exchange].sigs;
        for (uint i = 0; i < signatures.length; i++) {
            if (signatures[i] == _sig) {
                return true;
            }
        }
        return false;
    }
}

