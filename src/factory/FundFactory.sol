pragma solidity 0.6.4;
pragma experimental ABIEncoderV2;

import "../fund/fees/IFeeManager.sol";
import "../fund/hub/Hub.sol";
import "../fund/policies/IPolicyManager.sol";
import "../fund/shares/IShares.sol";
import "../fund/vault/IVault.sol";
import "../engine/AmguConsumer.sol";
import "../registry/IRegistry.sol";
import "./Factory.sol";

/// @title FundFactory Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Creates fund routes and links them together
contract FundFactory is AmguConsumer, Factory, DSAuth {
    event NewFund(
        address indexed manager,
        address indexed hub,
        address[6] routes
    );

    IFeeManagerFactory public feeManagerFactory;
    IPolicyManagerFactory public policyManagerFactory;
    ISharesFactory public sharesFactory;
    IVaultFactory public vaultFactory;

    mapping (bytes32 => bool) public fundNameHashIsTaken;

    // A manager can only have one pending fund
    mapping (address => address) public managerToHub;
    mapping (address => Hub.Routes) public managerToRoutes;
    mapping (address => Settings) public managerToSettings;

    // Parameters stored when beginning setup
    struct Settings {
        string name;
        address[] adapters;
        address denominationAsset;
        address[] defaultSharesInvestmentAssets;
        address[] fees;
        uint256[] feeRates;
        uint256[] feePeriods;
    }

    constructor(
        address _feeManagerFactory,
        address _sharesFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _registry,
        address _postDeployOwner
    )
        AmguConsumer(_registry)
        public
    {
        setOwner(_postDeployOwner);
        feeManagerFactory = IFeeManagerFactory(_feeManagerFactory);
        sharesFactory = ISharesFactory(_sharesFactory);
        vaultFactory = IVaultFactory(_vaultFactory);
        policyManagerFactory = IPolicyManagerFactory(_policyManagerFactory);
    }

    modifier onlyNonSetComponent(address _component) {
        require(
            !__componentExists(_component),
            "ensureComponentNotSet: Component has already been set"
        );
        _;
    }

    modifier onlySetComponent(address _component) {
        require(
            __componentExists(_component),
            "ensureComponentNotSet: Component has not been set"
        );
        _;
    }

    // TODO: change to external (fails on stack error with all the calldata params currently)
    // TODO: add policies
    // TODO: fees and policies likely to be set up by directly calling the mandate component with encoded data
    function beginSetup(
        string memory _name,
        address[] memory _fees,
        uint256[] memory _feeRates, // encode?
        uint256[] memory _feePeriods, // encode?
        // address[] calldata _policies,
        // bytes[] calldata _policyData,
        address[] memory _adapters,
        address _denominationAsset,
        address[] memory _defaultSharesInvestmentAssets
    )
        public
        onlyNonSetComponent(managerToHub[msg.sender])
    {
        require(
            REGISTRY.assetIsRegistered(_denominationAsset),
            "beginSetup: Denomination asset must be registered"
        );
        require(isValidFundName(_name), "beginSetup: Fund name is not valid");
        bytes32 nameHash = __hashFundName(_name);
        require(
            !fundNameHashIsTaken[nameHash],
            "beginSetup: Fund name already registered"
        );

        fundNameHashIsTaken[nameHash] = true;
        managerToHub[msg.sender] = address(new Hub(msg.sender, _name));
        managerToSettings[msg.sender] = Settings(
            _name,
            _adapters,
            _denominationAsset,
            _defaultSharesInvestmentAssets,
            _fees,
            _feeRates,
            _feePeriods
        );
        managerToRoutes[msg.sender].registry = address(REGISTRY);
        managerToRoutes[msg.sender].fundFactory = address(this); // TODO: Remove if Registry + FundFactory combined
    }

    function __createFeeManagerFor(address _manager)
        private
        onlySetComponent(managerToHub[_manager])
        onlyNonSetComponent(managerToRoutes[_manager].feeManager)
    {
        managerToRoutes[_manager].feeManager = feeManagerFactory.createInstance(
            managerToHub[_manager],
            managerToSettings[_manager].denominationAsset,
            managerToSettings[_manager].fees,
            managerToSettings[_manager].feeRates,
            managerToSettings[_manager].feePeriods,
            managerToRoutes[_manager].registry
        );
    }

    function createFeeManagerFor(address _manager) external amguPayable payable {
        __createFeeManagerFor(_manager);
    }

    function createFeeManager() external amguPayable payable { __createFeeManagerFor(msg.sender); }

    function __createPolicyManagerFor(address _manager)
        private
        onlySetComponent(managerToHub[_manager])
        onlyNonSetComponent(managerToRoutes[_manager].policyManager)
    {
        managerToRoutes[_manager].policyManager = policyManagerFactory.createInstance(
            managerToHub[_manager]
        );
    }

    function createPolicyManagerFor(address _manager) external amguPayable payable {
        __createPolicyManagerFor(_manager);
    }

    function createPolicyManager() external amguPayable payable {
        __createPolicyManagerFor(msg.sender);
    }

    function __createSharesFor(address _manager)
        private
        onlySetComponent(managerToHub[_manager])
        onlyNonSetComponent(managerToRoutes[_manager].shares)
    {
        managerToRoutes[_manager].shares = sharesFactory.createInstance(
            managerToHub[_manager],
            managerToSettings[_manager].denominationAsset,
            managerToSettings[_manager].defaultSharesInvestmentAssets,
            managerToRoutes[_manager].registry
        );
    }

    function createSharesFor(address _manager) external amguPayable payable {
        __createSharesFor(_manager);
    }

    function createShares() external amguPayable payable { __createSharesFor(msg.sender); }

    function __createVaultFor(address _manager)
        private
        onlySetComponent(managerToHub[_manager])
        onlyNonSetComponent(managerToRoutes[_manager].vault)
    {
        managerToRoutes[_manager].vault = vaultFactory.createInstance(
            managerToHub[_manager],
            managerToSettings[_manager].adapters,
            managerToRoutes[_manager].registry
        );
    }

    function createVaultFor(address _manager) external amguPayable payable {
        __createVaultFor(_manager);
    }

    function createVault() external amguPayable payable { __createVaultFor(msg.sender); }

    function __completeSetupFor(address _manager) private {
        Hub.Routes memory routes = managerToRoutes[_manager];
        Hub hub = Hub(managerToHub[_manager]);
        require(!childExists[address(hub)], "__completeSetupFor: Setup already complete");
        require(
            __componentExists(address(hub)) &&
            __componentExists(routes.feeManager) &&
            __componentExists(routes.policyManager) &&
            __componentExists(routes.shares) &&
            __componentExists(routes.vault),
            "__completeSetupFor: All components must be set before completing setup"
        );
        childExists[address(hub)] = true;
        hub.initializeAndSetPermissions([
            routes.feeManager,
            routes.policyManager,
            routes.shares,
            routes.vault,
            routes.registry,
            routes.fundFactory
        ]);
        REGISTRY.registerFund(address(hub), _manager);

        // Clear storage for manager's next fund
        delete managerToHub[_manager];
        delete managerToRoutes[_manager];
        delete managerToSettings[_manager];

        emit NewFund(
            msg.sender,
            address(hub),
            [
                routes.feeManager,
                routes.policyManager,
                routes.shares,
                routes.vault,
                routes.registry,
                routes.fundFactory
            ]
        );
    }

    function completeSetupFor(address _manager) external amguPayable payable {
        __completeSetupFor(_manager);
    }

    function completeSetup() external amguPayable payable { __completeSetupFor(msg.sender); }

    /// @notice Check whether a string has only valid characters for use in a fund name
    /// @param _name The fund name string to check
    /// @return True if the name is valid for use in a fund
    function isValidFundName(string memory _name) public pure returns (bool) {
        bytes memory b = bytes(_name);
        for (uint256 i; i < b.length; i++) {
            bytes1 char = b[i];
            if (
                !(char >= 0x30 && char <= 0x39) && // 9-0
                !(char >= 0x41 && char <= 0x5A) && // A-Z
                !(char >= 0x61 && char <= 0x7A) && // a-z
                !(char == 0x20 || char == 0x2D) && // space, dash
                !(char == 0x2E || char == 0x5F) && // period, underscore
                !(char == 0x2A) // *
            ) {
                return false;
            }
        }
        return true;
    }

    function __componentExists(address _component) private pure returns (bool) {
        return _component != address(0);
    }

    /// @notice Helper function to create a bytes32 hash from a fund name string
    function __hashFundName(string memory _name) private pure returns (bytes32) {
        return keccak256(bytes(_name));
    }
}
