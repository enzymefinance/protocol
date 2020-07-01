// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "../fund/fees/IFeeManager.sol";
import "../fund/hub/Hub.sol";
import "../fund/policies/IPolicyManager.sol";
import "../fund/shares/IShares.sol";
import "../fund/vault/IVault.sol";
import "../engine/AmguConsumer.sol";
import "../registry/IRegistry.sol";

/// @title FundFactory Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Creates fund routes and links them together
contract FundFactory is AmguConsumer {
     // TODO: Add PendingFundSettings if we keep them
    event FundSetupBegun(address indexed manager, address hub);

    event FundSetupCompleted(address indexed manager, address indexed hub);

    event HubCreated(address indexed manager, address hub);

    event FeeManagerCreated(address indexed manager, address indexed hub, address feeManager);

    event PolicyManagerCreated(
        address indexed manager,
        address indexed hub,
        address policyManager
    );

    event SharesCreated(address indexed manager, address indexed hub, address shares);

    event VaultCreated(address indexed manager, address indexed hub, address vault);

    event FundNameTaken(address indexed manager, string name);

    IFeeManagerFactory public feeManagerFactory;
    IPolicyManagerFactory public policyManagerFactory;
    ISharesFactory public sharesFactory;
    IVaultFactory public vaultFactory;

    // A manager can only have one pending fund
    mapping (address => address) public managerToPendingFundHub;
    mapping (address => PendingFundSettings) public managerToPendingFundSettings;

    // Parameters stored when beginning setup
    struct PendingFundSettings {
        address[] adapters;
        address denominationAsset;
        address[] fees;
        uint256[] feeRates;
        uint256[] feePeriods;
        address[] policies;
        bytes[] policySettings;
    }

    constructor(
        address _feeManagerFactory,
        address _sharesFactory,
        address _vaultFactory,
        address _policyManagerFactory,
        address _registry
    )
        AmguConsumer(_registry)
        public
    {
        feeManagerFactory = IFeeManagerFactory(_feeManagerFactory);
        sharesFactory = ISharesFactory(_sharesFactory);
        vaultFactory = IVaultFactory(_vaultFactory);
        policyManagerFactory = IPolicyManagerFactory(_policyManagerFactory);
    }

    modifier onlyHasPendingFund(address _manager) {
        require(__hasPendingFund(_manager), "No pending fund for manager");
        _;
    }

    // EXTERNAL FUNCTIONS

    // TODO: fees and policies likely to be set up by directly calling the mandate component with encoded data
    /// @notice The first action in setting up a fund, where the parameters of a fund are defined
    /// @param _name The fund's name
    /// @param _fees The Fee contract addresses to use in the fund
    /// @param _feeRates The rates to use with each Fee contracts
    /// @param _feePeriods The period to use in each Fee contracts
    /// @param _adapters The integration adapters to use to interact with external protocols
    /// @param _denominationAsset The asset in which to denominate share price and measure fund performance
    function beginFundSetup(
        string memory _name,
        address[] memory _fees,
        uint256[] memory _feeRates, // encode?
        uint256[] memory _feePeriods, // encode?
        address[] memory _policies,
        bytes[] memory _policySettings,
        address[] memory _adapters,
        address _denominationAsset
    )
        public // TODO: change to `external` in future solidity version (calldata fails on stack error)
    {
        require(!__hasPendingFund(msg.sender), "beginFundSetup: Sender has another fund pending");
        require(
            REGISTRY.primitiveIsRegistered(_denominationAsset),
            "beginFundSetup: Denomination asset must be registered"
        );
        require(isValidFundName(_name), "beginSetup: Fund name is not valid");
        bytes32 hashedName = keccak256(bytes(_name));
        require(!REGISTRY.fundNameHashIsTaken(hashedName), "beginSetup: Fund name is taken");

        // Create Hub
        address hubAddress = address(new Hub(address(REGISTRY), address(this), msg.sender, _name));
        emit HubCreated(msg.sender, hubAddress);

        // Add Pending Fund
        managerToPendingFundHub[msg.sender] = hubAddress;
        REGISTRY.registerFund(hubAddress, msg.sender, hashedName);
        emit FundSetupBegun(msg.sender, hubAddress);

        // Store settings for the remaining steps
        managerToPendingFundSettings[msg.sender] = PendingFundSettings(
            _adapters,
            _denominationAsset,
            _fees,
            _feeRates,
            _feePeriods,
            _policies,
            _policySettings
        );
    }

    /// @notice Creates a FeeManager component for a particular fund manager's fund
    /// @param _manager The fund manager for whom the component should be created
    function createFeeManagerFor(address _manager) external amguPayable payable {
        __createFeeManagerFor(_manager);
    }

    /// @notice Creates a FeeManager component for the sender's fund
    function createFeeManager() external amguPayable payable {
        __createFeeManagerFor(msg.sender);
    }

    /// @notice Creates a PolicyManager component for a particular fund manager's fund
    /// @param _manager The fund manager for whom the component should be created
    function createPolicyManagerFor(address _manager) external amguPayable payable {
        __createPolicyManagerFor(_manager);
    }

    /// @notice Creates a PolicyManager component for the sender's fund
    function createPolicyManager() external amguPayable payable {
        __createPolicyManagerFor(msg.sender);
    }

    /// @notice Creates a Shares component for a particular fund manager's fund
    /// @param _manager The fund manager for whom the component should be created
    function createSharesFor(address _manager) external amguPayable payable {
        __createSharesFor(_manager);
    }

    /// @notice Creates a Shares component for the sender's fund
    function createShares() external amguPayable payable {
        __createSharesFor(msg.sender);
    }

    /// @notice Creates a Vault component for a particular fund manager's fund
    /// @param _manager The fund manager for whom the component should be created
    function createVaultFor(address _manager) external amguPayable payable {
        __createVaultFor(_manager);
    }

    /// @notice Creates a Vault component for the sender's fund
    function createVault() external amguPayable payable {
        __createVaultFor(msg.sender);
    }

    /// @notice Complete setup for a particular fund manager's fund
    /// @param _manager The fund manager for whom the fund setup should be completed
    function completeFundSetupFor(address _manager) external amguPayable payable {
        __completeFundSetupFor(_manager);
    }

    /// @notice Complete setup for the sender's fund
    function completeFundSetup() external amguPayable payable {
        __completeFundSetupFor(msg.sender);
    }

    // PUBLIC FUNCTIONS

    /// @notice Check whether a string has only valid characters for use in a fund name
    /// @param _name The fund name string to check
    /// @return True if the name is valid for use in a fund
    /// @dev Needed to provide clean url slugs for the frontend
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

    // PRIVATE FUNCTIONS

    /// @notice Helper to complete a fund's setup (activate the fund)
    function __completeFundSetupFor(address _manager) private onlyHasPendingFund(_manager) {
        Hub hub = Hub(managerToPendingFundHub[_manager]);

        // Assert all components have been created
        require(
            hub.feeManager() != address(0),
            "__completeFundSetup: feeManager has not been created"
        );
        require(
            hub.policyManager() != address(0),
            "__completeFundSetup: policyManager has not been created"
        );
        require(
            hub.shares() != address(0),
            "__completeFundSetup: shares has not been created"
        );
        require(
            hub.vault() != address(0),
            "__completeFundSetup: vault has not been created"
        );

        // Initialize fund
        hub.initializeFund();
        emit FundSetupCompleted(_manager, address(hub));

        // Clear storage for manager's next fund
        delete managerToPendingFundHub[_manager];
        delete managerToPendingFundSettings[_manager];
    }

    /// @notice Helper to create a FeeManger component for a specified manager
    function __createFeeManagerFor(address _manager)
        private
        onlyHasPendingFund(_manager)
    {
        Hub hub = Hub(managerToPendingFundHub[_manager]);
        require(hub.feeManager() == address(0), "__createFeeManagerFor: feeManager already set");

        // Deploy
        address feeManager = feeManagerFactory.createInstance(
            address(hub),
            managerToPendingFundSettings[_manager].denominationAsset,
            managerToPendingFundSettings[_manager].fees,
            managerToPendingFundSettings[_manager].feeRates,
            managerToPendingFundSettings[_manager].feePeriods
        );
        emit FeeManagerCreated(msg.sender, address(hub), feeManager);

        // Add to Hub
        hub.setFeeManager(feeManager);
    }

    /// @notice Helper to create a PolicyManger component for a specified manager
    function __createPolicyManagerFor(address _manager)
        private
        onlyHasPendingFund(_manager)
    {
        Hub hub = Hub(managerToPendingFundHub[_manager]);
        require(
            hub.policyManager() == address(0),
            "__createPolicyManagerFor: policyManager already set"
        );

        // Deploy
        address policyManager = policyManagerFactory.createInstance(address(hub));
        emit PolicyManagerCreated(msg.sender, address(hub), policyManager);

        // Add to Hub
        hub.setPolicyManager(policyManager);

        // Add config
        address[] memory policies = managerToPendingFundSettings[_manager].policies;
        if (policies.length > 0) {
            IPolicyManager(policyManager).enablePolicies(
                policies,
                managerToPendingFundSettings[_manager].policySettings
            );
        }
    }

    /// @notice Helper to create a Shares component for a specified manager
    function __createSharesFor(address _manager)
        private
        onlyHasPendingFund(_manager)
    {
        Hub hub = Hub(managerToPendingFundHub[_manager]);
        require(
            hub.shares() == address(0),
            "__createSharesFor: shares already set"
        );

        // Deploy
        address shares = sharesFactory.createInstance(
            address(hub),
            managerToPendingFundSettings[_manager].denominationAsset,
            hub.NAME()
        );
        emit SharesCreated(msg.sender, address(hub), shares);

        // Add to Hub
        hub.setShares(shares);
    }

    function __createVaultFor(address _manager)
        private
        onlyHasPendingFund(_manager)
    {
        Hub hub = Hub(managerToPendingFundHub[_manager]);
        require(
            hub.vault() == address(0),
            "__createVaultFor: vault already set"
        );

        // Deploy
        address vault = vaultFactory.createInstance(
            address(hub),
            managerToPendingFundSettings[_manager].adapters
        );
        emit VaultCreated(msg.sender, address(hub), vault);

        // Add to Hub
        hub.setVault(vault);
    }

    /// @notice Helper to confirm if a manager has a pending fund
    function __hasPendingFund(address _manager) private view returns (bool) {
        return managerToPendingFundHub[_manager] != address(0);
    }
}
