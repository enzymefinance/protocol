// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../dependencies/DSAuth.sol";
import "../dependencies/libs/EnumerableSet.sol";
import "../integrations/libs/IIntegrationAdapter.sol";

/// @title Registry Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract for all Melon infrastructure that maintains registries of
/// assets, integrations, fees, policies, and funds, as well as the current versions of
/// infrastructural contracts
/// @dev This contract should be kept relatively abstract,
/// so that it requires minimal changes as the protocol evolves
contract Registry is DSAuth {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AssetAdded (address asset);

    event AssetRemoved (address asset);

    event DerivativePriceSourceUpdated(address derivative, address priceSource);

    event EngineChanged (address engine);

    event FeeAdded (address fee);

    event FeeRemoved (address fee);

    event FundAdded (address indexed manager, address hub, bytes32 hashedName);

    event FundFactoryChanged (address fundFactory);

    event IncentiveChanged (uint256 incentiveAmount);

    event IntegrationAdapterAdded (address indexed adapter, string indexed identifier);

    event IntegrationAdapterRemoved (address indexed adapter, string indexed identifier);

    event MGMChanged (address MGM);

    event MlnTokenChanged (address mlnToken);

    event NativeAssetChanged (address nativeAsset);

    event PolicyAdded (address policy);

    event PolicyRemoved (address policy);

    event PriceSourceChanged (address priceSource);

    event SharesRequestorChanged(address sharesRequestor);

    event ValueInterpreterChanged(address valueInterpreter);

    EnumerableSet.AddressSet private assets;

    // Plugins
    EnumerableSet.AddressSet private fees;
    EnumerableSet.AddressSet private integrationAdapters;
    EnumerableSet.AddressSet private policies;
    mapping (bytes32 => bool) private integrationAdapterIdentifierIsRegistered;

    // Derivatives (tokens representing underlying assets, e.g,. cDai)
    mapping (address => address) public derivativeToPriceSource;

    // Fund Factories
    mapping (address => bool) public fundFactoryIsRegistered;

    // Funds
    mapping (address => bool) public fundIsRegistered;
    mapping (bytes32 => bool) public fundNameHashIsTaken;
    mapping (address => address[]) public managerToFunds;

    address public engine;
    address public fundFactory;
    uint256 public incentive;
    address public priceSource;
    address public MGM;
    address public mlnToken;
    address public nativeAsset;
    address public sharesRequestor;
    address public valueInterpreter;

    constructor(address _postDeployOwner) public {
        incentive = 10 finney;
        setOwner(_postDeployOwner);
    }

    // ASSETS

    /// @notice Remove an asset from the list of registered assets
    /// @param _asset The address of the asset to remove
    function deregisterAsset(address _asset) external auth {
        require(assetIsRegistered(_asset), "deregisterAsset: _asset is not registered");

        EnumerableSet.remove(assets, _asset);

        emit AssetRemoved(_asset);
    }

    /// @notice Get all registered assets
    /// @return A list of all registered asset addresses
    function getRegisteredAssets() external view returns (address[] memory) {
        return EnumerableSet.enumerate(assets);
    }

    /// @notice Add an asset to the Registry
    /// @param _asset Address of asset to be registered
    function registerAsset(address _asset) external auth {
        require(!assetIsRegistered(_asset), "registerAsset: _asset already registered");

        EnumerableSet.add(assets, _asset);

        emit AssetAdded(_asset);
    }

    /// @notice Add or update a price source for a derivative
    /// @param _derivative The address of the derivative
    /// @param _priceSource The address of the price source
    function registerDerivativePriceSource(address _derivative, address _priceSource)
        external
        auth
    {
        require(
            derivativeToPriceSource[_derivative] != _priceSource,
            "registerDerivativePriceSource: derivative already set to specified source"
        );
        derivativeToPriceSource[_derivative] = _priceSource;

        emit DerivativePriceSourceUpdated(_derivative, _priceSource);
    }

    /// @notice Check whether an asset is registered
    /// @param _asset The address of the asset to check
    /// @return True if the asset is registered
    function assetIsRegistered(address _asset) public view returns (bool) {
        return EnumerableSet.contains(assets, _asset);
    }

    // FEES

    /// @notice Remove a fee from the list of registered fees
    /// @param _fee The address of the fee to remove
    function deregisterFee(address _fee) external auth {
        require(feeIsRegistered(_fee), "deregisterFee: _fee is not registered");

        EnumerableSet.remove(fees, _fee);

        emit FeeRemoved(_fee);
    }

    /// @notice Get all registered fees
    /// @return A list of all registered fee addresses
    function getRegisteredFees() external view returns (address[] memory) {
        return EnumerableSet.enumerate(fees);
    }

    /// @notice Add a fee to the Registry
    /// @param _fee Address of fee to be registered
    function registerFee(address _fee) external auth {
        require(!feeIsRegistered(_fee), "registerFee: _fee already registered");

        EnumerableSet.add(fees, _fee);

        emit FeeAdded(_fee);
    }

    /// @notice Check whether a fee is registered
    /// @param _fee The address of the fee to check
    /// @return True if the fee is registered
    function feeIsRegistered(address _fee) public view returns (bool) {
        return EnumerableSet.contains(fees, _fee);
    }

    // FUNDS

    /// @notice Add a fund to the Registry
    /// @param _hub The Hub for the fund
    /// @param _manager The manager of the fund
    function registerFund(address _hub, address _manager, bytes32 _hashedName) external {
        require(
            fundFactoryIsRegistered[msg.sender],
            "registerFund: Only fundFactory can call this function"
        );
        require(!fundIsRegistered[_hub], "registerFund: Fund is already registered");
        require(!fundNameHashIsTaken[_hashedName], "registerFund: Fund name is already taken");

        fundIsRegistered[_hub] = true;
        fundNameHashIsTaken[_hashedName] = true;
        managerToFunds[_manager].push(_hub);

        emit FundAdded(_manager, _hub, _hashedName);
    }

    // POLICIES

    /// @notice Remove a policy from the list of registered policies
    /// @param _policy The address of the policy to remove
    function deregisterPolicy(address _policy) external auth {
        require(policyIsRegistered(_policy), "deregisterPolicy: _policy is not registered");

        EnumerableSet.remove(policies, _policy);

        emit PolicyRemoved(_policy);
    }

    /// @notice Get all registered policies
    /// @return A list of all registered policy addresses
    function getRegisteredPolicies() external view returns (address[] memory) {
        return EnumerableSet.enumerate(policies);
    }

    /// @notice Add a policy to the Registry
    /// @param _policy Address of policy to be registered
    function registerPolicy(address _policy) external auth {
        require(!policyIsRegistered(_policy), "registerPolicy: _policy already registered");

        EnumerableSet.add(policies, _policy);

        emit PolicyAdded(_policy);
    }

    /// @notice Check whether a policy is registered
    /// @param _policy The address of the policy to check
    /// @return True if the policy is registered
    function policyIsRegistered(address _policy) public view returns (bool) {
        return EnumerableSet.contains(policies, _policy);
    }

    // INTEGRATIONS

    /// @notice Remove an integration adapter from the Registry
    /// @param _adapter The address of the adapter to remove
    function deregisterIntegrationAdapter(address _adapter) external auth {
        require(
            integrationAdapterIsRegistered(_adapter),
            "deregisterIntegrationAdapter: Adapter already disabled"
        );

        string memory identifier = IIntegrationAdapter(_adapter).identifier();
        integrationAdapterIdentifierIsRegistered[keccak256(bytes(identifier))] = false;

        EnumerableSet.remove(integrationAdapters, _adapter);

        emit IntegrationAdapterRemoved(_adapter, identifier);
    }

    /// @notice Get all registered integration adapters
    /// @return A list of all registered integration adapters
    function getRegisteredIntegrationAdapters() external view returns (address[] memory) {
        return EnumerableSet.enumerate(integrationAdapters);
    }

    /// @notice Register an integration adapter with its associated external contract and type
    /// @dev Adapters are unique. There may be different adapters for same exchange (0x / Ethfinex)
    /// @param _adapter Address of integration adapter contract
    function registerIntegrationAdapter(address _adapter) external auth {
        require(
            _adapter != address(0),
            "registerIntegrationAdapter: _adapter cannot be empty"
        );
        require(
            !integrationAdapterIsRegistered(_adapter),
            "registerIntegrationAdapter: Adapter already registered"
        );

        // Plugins should only have their latest version registered
        string memory identifier = IIntegrationAdapter(_adapter).identifier();
        require(
            bytes(identifier).length != 0,
            "registerIntegrationAdapter: Identifier must be defined in the adapter"
        );
        bytes32 identifierHash = keccak256(bytes(identifier));
        require(
            !integrationAdapterIdentifierIsRegistered[identifierHash],
            string(abi.encodePacked(
                "registerIntegrationAdapter: Adapter with identifier exists: ",
                identifier
            ))
        );

        EnumerableSet.add(policies, _adapter);
        integrationAdapterIdentifierIsRegistered[identifierHash] = true;

        EnumerableSet.add(integrationAdapters, _adapter);

        emit IntegrationAdapterAdded(_adapter, identifier);
    }

    /// @notice Check if an integration adapter is on the Registry
    /// @param _adapter The adapter to check
    /// @return True if the adapter is registered
    function integrationAdapterIsRegistered(address _adapter) public view returns (bool) {
        return EnumerableSet.contains(integrationAdapters, _adapter);
    }

    // MISC

    /// @notice Set the fundFactory storage var
    /// @param _fundFactory The FundFactory contract to set
    function setFundFactory(address _fundFactory) external auth {
        fundFactory = _fundFactory;
        fundFactoryIsRegistered[_fundFactory] = true;
        emit FundFactoryChanged(_fundFactory);
    }

    /// @notice Set the incentive storage var
    /// @param _amount The amount to set for incentive (in wei)
    function setIncentive(uint256 _amount) external auth {
        incentive = _amount;
        emit IncentiveChanged(_amount);
    }

    /// @notice Set the priceSource storage var
    /// @param _priceSource The PriceSource contract to set
    function setPriceSource(address _priceSource) external auth {
        priceSource = _priceSource;
        emit PriceSourceChanged(_priceSource);
    }

    /// @notice Set the mlnToken storage var
    /// @param _mlnToken The MlnToken contract to set
    function setMlnToken(address _mlnToken) external auth {
        mlnToken = _mlnToken;
        emit MlnTokenChanged(_mlnToken);
    }

    /// @notice Set the nativeAsset storage var
    /// @param _nativeAsset The native asset contract to set
    function setNativeAsset(address _nativeAsset) external auth {
        nativeAsset = _nativeAsset;
        emit NativeAssetChanged(_nativeAsset);
    }

    /// @notice Set the engine storage var
    /// @param _engine The Engine contract to set
    function setEngine(address _engine) external auth {
        engine = _engine;
        emit EngineChanged(_engine);
    }

    /// @notice Set the MGM storage var
    /// @param _MGM The MGM address to set
    function setMGM(address _MGM) external auth {
        MGM = _MGM;
        emit MGMChanged(_MGM);
    }

    /// @notice Set the sharesRequestor storage var
    /// @param _sharesRequestor The SharesRequestor contract to set
    function setSharesRequestor(address _sharesRequestor) external auth {
        sharesRequestor = _sharesRequestor;
        emit SharesRequestorChanged(_sharesRequestor);
    }

    /// @notice Set the valueInterpreter storage var
    /// @param _valueInterpreter The ValueInterpreter contract to set
    function setValueInterpreter(address _valueInterpreter) external auth {
        valueInterpreter = _valueInterpreter;
        emit ValueInterpreterChanged(_valueInterpreter);
    }
}
