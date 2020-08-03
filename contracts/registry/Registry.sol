// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../dependencies/libs/EnumerableSet.sol";
import "../fund/policies/IPolicy.sol";
import "../integrations/IIntegrationAdapter.sol";
import "./utils/MelonCouncilOwnable.sol";

/// @title Registry Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice The top-level contract for all Melon infrastructure that maintains registries of
/// assets, integrations, fees, policies, and funds, as well as the current versions of
/// infrastructural contracts
/// @dev This contract should be kept relatively abstract,
/// so that it requires minimal changes as the protocol evolves
contract Registry is MelonCouncilOwnable {
    using EnumerableSet for EnumerableSet.AddressSet;

    event PrimitiveAdded (address primitive);

    event PrimitiveRemoved (address primitive);

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

    event PolicyAdded (address indexed policy, string indexed identifier);

    event PolicyRemoved (address indexed policy, string indexed identifier);

    event PriceSourceChanged (address priceSource);

    event SharesRequestorChanged(address sharesRequestor);

    event ValueInterpreterChanged(address valueInterpreter);

    // Assets
    // Primitives are tokens that have an explicit value based on our primary pricefeed, e.g., Dai
    EnumerableSet.AddressSet private primitives;
    // Derivatives are tokens representing underlying assets, e.g,. cDai
    mapping (address => address) public derivativeToPriceSource;

    // Plugins
    EnumerableSet.AddressSet private fees;
    EnumerableSet.AddressSet private integrationAdapters;
    EnumerableSet.AddressSet private policies;
    mapping (bytes32 => bool) private integrationAdapterIdentifierIsRegistered;
    mapping (bytes32 => bool) private policyIdentifierIsRegistered;

    // Fund Factories
    mapping (address => bool) public fundFactoryIsRegistered;

    // Funds
    address immutable public MLN_TOKEN;
    address immutable public WETH_TOKEN;

    mapping (address => bool) public fundIsRegistered;
    mapping (bytes32 => bool) public fundNameHashIsTaken;
    mapping (address => address[]) public managerToFunds;

    address public engine;
    address public fundFactory;
    uint256 public incentive;
    address public priceSource;
    address public sharesRequestor;
    address public valueInterpreter;

    constructor(
        address _MTC,
        address _MGM,
        address _mlnToken,
        address _wethToken
    )
        public
        MelonCouncilOwnable(_MTC, _MGM)
    {
        incentive = 10 finney;
        MLN_TOKEN = _mlnToken;
        WETH_TOKEN = _wethToken;
    }

    // ASSETS

    /// @notice Remove a primitive from the list of registered primitives
    /// @param _primitive The address of the primitive to remove
    function deregisterPrimitive(address _primitive) external onlyOwner {
        require(
            primitiveIsRegistered(_primitive),
            "deregisterPrimitive: _primitive is not registered"
        );

        EnumerableSet.remove(primitives, _primitive);

        emit PrimitiveRemoved(_primitive);
    }

    /// @notice Get all registered primitives
    /// @return A list of all registered primitive addresses
    function getRegisteredPrimitives() external view returns (address[] memory) {
        return EnumerableSet.enumerate(primitives);
    }

    /// @notice Add a primitive to the Registry
    /// @param _primitive Address of primitive to be registered
    function registerPrimitive(address _primitive) external onlyOwner {
        require(
            !primitiveIsRegistered(_primitive),
            "registerPrimitive: _primitive already registered"
        );

        EnumerableSet.add(primitives, _primitive);

        emit PrimitiveAdded(_primitive);
    }

    /// @notice Add or update a price source for a derivative
    /// @param _derivative The address of the derivative
    /// @param _priceSource The address of the price source
    function registerDerivativePriceSource(address _derivative, address _priceSource)
        external
        onlyOwner
    {
        require(
            derivativeToPriceSource[_derivative] != _priceSource,
            "registerDerivativePriceSource: derivative already set to specified source"
        );
        derivativeToPriceSource[_derivative] = _priceSource;

        emit DerivativePriceSourceUpdated(_derivative, _priceSource);
    }

    /// @notice Check whether a primitive is registered
    /// @param _primitive The address of the primitive to check
    /// @return True if the primitive is registered
    function primitiveIsRegistered(address _primitive) public view returns (bool) {
        return EnumerableSet.contains(primitives, _primitive);
    }

    // FEES

    /// @notice Remove a fee from the list of registered fees
    /// @param _fee The address of the fee to remove
    function deregisterFee(address _fee) external onlyOwner {
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
    function registerFee(address _fee) external onlyOwner {
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
    function deregisterPolicy(address _policy) external onlyOwner {
        require(policyIsRegistered(_policy), "deregisterPolicy: _policy is not registered");

        string memory identifier = IPolicy(_policy).identifier();

        EnumerableSet.remove(policies, _policy);
        policyIdentifierIsRegistered[keccak256(bytes(identifier))] = false;

        emit PolicyRemoved(_policy, identifier);
    }

    /// @notice Get all registered policies
    /// @return A list of all registered policy addresses
    function getRegisteredPolicies() external view returns (address[] memory) {
        return EnumerableSet.enumerate(policies);
    }

    /// @notice Add a policy to the Registry
    /// @param _policy Address of policy to be registered
    function registerPolicy(address _policy) external onlyOwner {
        require(!policyIsRegistered(_policy), "registerPolicy: _policy already registered");

        IPolicy policy = IPolicy(_policy);
        require(
            policy.policyHook() != IPolicyManager.PolicyHook.None,
            "registerPolicy: PolicyHook must be defined in the policy"
        );
        require(
            policy.policyHookExecutionTime() != IPolicyManager.PolicyHookExecutionTime.None,
            "registerPolicy: PolicyHookExecutionTime must be defined in the policy"
        );

        // Plugins should only have their latest version registered
        string memory identifier = policy.identifier();
        require(
            bytes(identifier).length != 0,
            "registerPolicy: Identifier must be defined in the policy"
        );
        bytes32 identifierHash = keccak256(bytes(identifier));
        require(
            !policyIdentifierIsRegistered[identifierHash],
            string(abi.encodePacked("registerPolicy: Policy with identifier exists: ", identifier))
        );

        EnumerableSet.add(policies, _policy);
        policyIdentifierIsRegistered[identifierHash] = true;

        emit PolicyAdded(_policy, identifier);
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
    function deregisterIntegrationAdapter(address _adapter) external onlyOwner {
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
    /// @dev Registered adapters are 1:1 with a particular identifier.
    // There may be different adapters with the same identifier.
    /// @param _adapter Address of integration adapter contract
    function registerIntegrationAdapter(address _adapter) external onlyOwner {
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
    function setFundFactory(address _fundFactory) external onlyOwner {
        fundFactory = _fundFactory;
        fundFactoryIsRegistered[_fundFactory] = true;
        emit FundFactoryChanged(_fundFactory);
    }

    /// @notice Set the incentive storage var
    /// @param _amount The amount to set for incentive (in wei)
    function setIncentive(uint256 _amount) external onlyOwner {
        incentive = _amount;
        emit IncentiveChanged(_amount);
    }

    /// @notice Set the priceSource storage var
    /// @param _priceSource The PriceSource contract to set
    function setPriceSource(address _priceSource) external onlyOwner {
        priceSource = _priceSource;
        emit PriceSourceChanged(_priceSource);
    }

    /// @notice Set the engine storage var
    /// @param _engine The Engine contract to set
    function setEngine(address _engine) external onlyOwner {
        engine = _engine;
        emit EngineChanged(_engine);
    }

    /// @notice Set the sharesRequestor storage var
    /// @param _sharesRequestor The SharesRequestor contract to set
    function setSharesRequestor(address _sharesRequestor) external onlyOwner {
        sharesRequestor = _sharesRequestor;
        emit SharesRequestorChanged(_sharesRequestor);
    }

    /// @notice Set the valueInterpreter storage var
    /// @param _valueInterpreter The ValueInterpreter contract to set
    function setValueInterpreter(address _valueInterpreter) external onlyOwner {
        valueInterpreter = _valueInterpreter;
        emit ValueInterpreterChanged(_valueInterpreter);
    }
}
