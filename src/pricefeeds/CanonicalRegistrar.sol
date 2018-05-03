pragma solidity ^0.4.19;

import "../dependencies/DBC.sol";
import "ds-thing/thing.sol";

/// @title Asset Registar Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Chain independent asset registrar for the Melon protocol
contract CanonicalRegistrar is DSThing, DBC {

    // TYPES

    struct Asset {
        bool exists; // True if asset is registered here
        bytes32 name; // Human-readable name of the Asset as in ERC223 token standard
        bytes8 symbol; // Human-readable symbol of the Asset as in ERC223 token standard
        uint decimals; // Decimal, order of magnitude of precision, of the Asset as in ERC223 token standard
        string url; // URL for additional information of Asset
        string ipfsHash; // Same as url but for ipfs
        address breakIn; // Break in contract on destination chain
        address breakOut; // Break out contract on this chain; A way to leave
        uint[] standards; // compliance with standards like ERC20, ERC223, ERC777, etc. (the uint is the standard number)
        bytes4[] functionSignatures; // Whitelisted function signatures that can be called using `useExternalFunction` in Fund contract. Note: Adhere to a naming convention for `Fund<->Asset` as much as possible. I.e. name same concepts with the same functionSignature.
        uint price; // Price of asset quoted against `QUOTE_ASSET` * 10 ** decimals
        uint timestamp; // Timestamp of last price update of this asset
    }

    struct Exchange {
        bool exists;
        address adapter; // adapter contract for this exchange
        // One-time note: takesCustody is inverse case of isApproveOnly
        bool takesCustody; // True in case of exchange implementation which requires  are approved when an order is made instead of transfer
        bytes4[] functionSignatures; // Whitelisted function signatures that can be called using `useExternalFunction` in Fund contract. Note: Adhere to a naming convention for `Fund<->ExchangeAdapter` as much as possible. I.e. name same concepts with the same functionSignature.
    }
    // TODO: populate each field here
    // TODO: add whitelistFunction function

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
    /// @dev Post: Address ofAsset is registered
    /// @param ofAsset Address of asset to be registered
    /// @param inputName Human-readable name of the Asset as in ERC223 token standard
    /// @param inputSymbol Human-readable symbol of the Asset as in ERC223 token standard
    /// @param inputDecimals Human-readable symbol of the Asset as in ERC223 token standard
    /// @param inputUrl Url for extended information of the asset
    /// @param inputIpfsHash Same as url but for ipfs
    /// @param breakInBreakOut Address of break in and break out contracts on destination chain
    /// @param inputStandards Integers of EIP standards this asset adheres to
    /// @param inputFunctionSignatures Function signatures for whitelisted asset functions
    function registerAsset(
        address ofAsset,
        bytes32 inputName,
        bytes8 inputSymbol,
        uint inputDecimals,
        string inputUrl,
        string inputIpfsHash,
        address[2] breakInBreakOut,
        uint[] inputStandards,
        bytes4[] inputFunctionSignatures
    )
        auth
        pre_cond(!assetInformation[ofAsset].exists)
    {
        assetInformation[ofAsset].exists = true;
        registeredAssets.push(ofAsset);
        updateAsset(
            ofAsset,
            inputName,
            inputSymbol,
            inputDecimals,
            inputUrl,
            inputIpfsHash,
            breakInBreakOut,
            inputStandards,
            inputFunctionSignatures
        );
        assert(assetInformation[ofAsset].exists);
    }

    /// @notice Register an exchange information entry
    /// @dev Pre: Only registrar owner should be able to register
    /// @dev Post: Address ofExchange is registered
    /// @param ofExchange Address of the exchange
    /// @param ofExchangeAdapter Address of exchange adapter for this exchange
    /// @param inputTakesCustody Whether this exchange takes custody of tokens before trading
    /// @param inputFunctionSignatures Function signatures for whitelisted exchange functions
    function registerExchange(
        address ofExchange,
        address ofExchangeAdapter,
        bool inputTakesCustody,
        bytes4[] inputFunctionSignatures
    )
        auth
        pre_cond(!exchangeInformation[ofExchange].exists)
    {
        exchangeInformation[ofExchange].exists = true;
        registeredExchanges.push(ofExchange);
        updateExchange(
            ofExchange,
            ofExchangeAdapter,
            inputTakesCustody,
            inputFunctionSignatures
        );
        assert(exchangeInformation[ofExchange].exists);
    }

    /// @notice Updates description information of a registered Asset
    /// @dev Pre: Owner can change an existing entry
    /// @dev Post: Changed Name, Symbol, URL and/or IPFSHash
    /// @param ofAsset Address of the asset to be updated
    /// @param inputName Human-readable name of the Asset as in ERC223 token standard
    /// @param inputSymbol Human-readable symbol of the Asset as in ERC223 token standard
    /// @param inputUrl Url for extended information of the asset
    /// @param inputIpfsHash Same as url but for ipfs
    function updateAsset(
        address ofAsset,
        bytes32 inputName,
        bytes8 inputSymbol,
        uint inputDecimals,
        string inputUrl,
        string inputIpfsHash,
        address[2] ofBreakInBreakOut,
        uint[] inputStandards,
        bytes4[] inputFunctionSignatures
    )
        auth
        pre_cond(assetInformation[ofAsset].exists)
    {
        Asset asset = assetInformation[ofAsset];
        asset.name = inputName;
        asset.symbol = inputSymbol;
        asset.decimals = inputDecimals;
        asset.url = inputUrl;
        asset.ipfsHash = inputIpfsHash;
        asset.breakIn = ofBreakInBreakOut[0];
        asset.breakOut = ofBreakInBreakOut[1];
        asset.standards = inputStandards;
        asset.functionSignatures = inputFunctionSignatures;
    }

    function updateExchange(
        address ofExchange,
        address ofExchangeAdapter,
        bool inputTakesCustody,
        bytes4[] inputFunctionSignatures
    )
        auth
        pre_cond(exchangeInformation[ofExchange].exists)
    {
        Exchange exchange = exchangeInformation[ofExchange];
        exchange.adapter = ofExchangeAdapter;
        exchange.takesCustody = inputTakesCustody;
        exchange.functionSignatures = inputFunctionSignatures;
    }

    // TODO: check max size of array before remaking this becomes untenable
    /// @notice Deletes an existing entry
    /// @dev Owner can delete an existing entry
    /// @param ofAsset address for which specific information is requested
    function removeAsset(
        address ofAsset,
        uint assetIndex
    )
        auth
        pre_cond(assetInformation[ofAsset].exists)
    {
        require(registeredAssets[assetIndex] == ofAsset);
        delete assetInformation[ofAsset]; // Sets exists boolean to false
        delete registeredAssets[assetIndex];
        for (uint i = assetIndex; i < registeredAssets.length-1; i++) {
            registeredAssets[i] = registeredAssets[i+1];
        }
        registeredAssets.length--;
        assert(!assetInformation[ofAsset].exists);
    }

    /// @notice Deletes an existing entry
    /// @dev Owner can delete an existing entry
    /// @param ofExchange address for which specific information is requested
    /// @param exchangeIndex index of the exchange in array
    function removeExchange(
        address ofExchange,
        uint exchangeIndex
    )
        auth
        pre_cond(exchangeInformation[ofExchange].exists)
    {
        require(registeredExchanges[exchangeIndex] == ofExchange);
        delete exchangeInformation[ofExchange];
        delete registeredExchanges[exchangeIndex];
        for (uint i = exchangeIndex; i < registeredExchanges.length-1; i++) {
            registeredExchanges[i] = registeredExchanges[i+1];
        }
        registeredExchanges.length--;
        assert(!exchangeInformation[ofExchange].exists);
    }

    // PUBLIC VIEW METHODS

    // get asset specific information
    function getName(address ofAsset) view returns (bytes32) { return assetInformation[ofAsset].name; }
    function getSymbol(address ofAsset) view returns (bytes8) { return assetInformation[ofAsset].symbol; }
    function getDecimals(address ofAsset) view returns (uint) { return assetInformation[ofAsset].decimals; }
    function assetIsRegistered(address ofAsset) view returns (bool) { return assetInformation[ofAsset].exists; }
    function getRegisteredAssets() view returns (address[]) { return registeredAssets; }
    function assetMethodIsAllowed(
        address ofAsset, bytes4 querySignature
    )
        returns (bool)
    {
        bytes4[] memory signatures = assetInformation[ofAsset].functionSignatures;
        for (uint i = 0; i < signatures.length; i++) {
            if(signatures[i] == querySignature) {
                return true;
            }
        }
        return false;
    }

    // get exchange-specific information
    function exchangeIsRegistered(address ofExchange) view returns (bool) { return exchangeInformation[ofExchange].exists; }
    function getRegisteredExchanges() view returns (address[]) { return registeredExchanges; }
    function getExchangeInformation(address ofExchange)
        view
        returns (address, bool)
    {
        Exchange exchange = exchangeInformation[ofExchange];
        return (
            exchange.adapter,
            exchange.takesCustody
        );
    }
    function getExchangeFunctionSignatures(address ofExchange)
        view
        returns (bytes4[])
    {
        return exchangeInformation[ofExchange].functionSignatures;
    }
    function exchangeMethodIsAllowed(
        address ofExchange, bytes4 querySignature
    )
        returns (bool)
    {
        bytes4[] memory signatures = exchangeInformation[ofExchange].functionSignatures;
        for (uint i = 0; i < signatures.length; i++) {
            if(signatures[i] == querySignature) {
                return true;
            }
        }
        return false;
    }
}
