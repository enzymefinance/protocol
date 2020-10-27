// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../../extensions/IExtension.sol";
import "../../../../infrastructure/price-feeds/primitives/IPrimitivePriceFeed.sol";
import "../../../fund-deployer/IFundDeployer.sol";
import "../../vault/IVault.sol";
import "../utils/ComptrollerEvents.sol";
import "../utils/ComptrollerStorage.sol";
import "./IFundLifecycleLib.sol";

/// @title FundLifecycleLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A library for fund lifecycle actions
/// @dev Ordered function calls for stages in a fund lifecycle:
/// 1. init() - called on deployment of ComptrollerProxy
/// 2. activate() - called upon linking a VaultProxy to activate the fund
/// 3. destruct() - called upon migrating to another release
contract FundLifecycleLib is IFundLifecycleLib, ComptrollerStorage, ComptrollerEvents {
    using EnumerableSet for EnumerableSet.AddressSet;

    address private immutable FEE_MANAGER;
    address private immutable FUND_DEPLOYER;
    address private immutable INTEGRATION_MANAGER;
    address private immutable POLICY_MANAGER;
    address private immutable PRIMITIVE_PRICE_FEED;

    modifier allowsPermissionedVaultAction {
        require(!permissionedVaultActionAllowed, "Vault action re-entrance");
        permissionedVaultActionAllowed = true;
        _;
        permissionedVaultActionAllowed = false;
    }

    modifier onlyNotPaused() {
        require(
            IFundDeployer(FUND_DEPLOYER).getReleaseStatus() !=
                IFundDeployer.ReleaseStatus.Paused ||
                overridePause,
            "Fund is paused"
        );
        _;
    }

    modifier onlyFundDeployer() {
        require(msg.sender == FUND_DEPLOYER, "Only FundDeployer callable");
        _;
    }

    constructor(
        address _fundDeployer,
        address _primitivePriceFeed,
        address _feeManager,
        address _integrationManager,
        address _policyManager
    ) public {
        FEE_MANAGER = _feeManager;
        INTEGRATION_MANAGER = _integrationManager;
        POLICY_MANAGER = _policyManager;
        FUND_DEPLOYER = _fundDeployer;
        PRIMITIVE_PRICE_FEED = _primitivePriceFeed;
        isLib = true;
    }

    /// @notice Initializes a fund with config for its core and extensions
    /// @param _denominationAsset The asset in which the fund's value should be denominated
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @param _feeManagerConfigData Encoded config for fees to enable
    /// @param _policyManagerConfigData Encoded config for policies to enable
    /// @dev Pseudo-constructor per proxy.
    /// No need to assert access because this is called atomically on deployment,
    /// and once it's called, it cannot be called again.
    function init(
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        address[] calldata _allowedBuySharesCallers,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external override {
        require(!isLib, "init: Only delegate callable");
        require(denominationAsset == address(0), "init: Already initialized");

        // Configure core
        require(
            IPrimitivePriceFeed(PRIMITIVE_PRICE_FEED).isSupportedAsset(_denominationAsset),
            "init: Bad denomination asset"
        );
        denominationAsset = _denominationAsset;
        sharesActionTimelock = _sharesActionTimelock;
        for (uint256 i; i < _allowedBuySharesCallers.length; i++) {
            require(
                i == 0 || !allowedBuySharesCallers.contains(_allowedBuySharesCallers[i]),
                "init: buy shares caller already allowed"
            );

            allowedBuySharesCallers.add(_allowedBuySharesCallers[i]);

            emit AllowedBuySharesCallerAdded(_allowedBuySharesCallers[i]);
        }

        // Configure extensions
        if (_feeManagerConfigData.length > 0) {
            IExtension(FEE_MANAGER).setConfigForFund(_feeManagerConfigData);
        }
        if (_policyManagerConfigData.length > 0) {
            IExtension(POLICY_MANAGER).setConfigForFund(_policyManagerConfigData);
        }
    }

    /// @notice Activates the fund after running pre-activation logic
    /// @param _vaultProxy The VaultProxy to attach to the fund
    /// @param _isMigration True if a migrated fund is being activated
    /// @dev No need to assert anything beyond FundDeployer access.
    function activate(address _vaultProxy, bool _isMigration) external override onlyFundDeployer {
        vaultProxy = _vaultProxy;

        emit VaultProxySet(_vaultProxy);

        if (_isMigration) {
            // Distribute any shares in the VaultProxy to the fund owner.
            // This is a mechanism to ensure that even in the edge case of a fund being unable
            // to payout fee shares owed during migration, these shares are not lost.
            uint256 sharesDue = IERC20(_vaultProxy).balanceOf(_vaultProxy);
            if (sharesDue > 0) {
                IVault(_vaultProxy).transferShares(
                    _vaultProxy,
                    IVault(_vaultProxy).getOwner(),
                    sharesDue
                );

                emit MigratedSharesDuePaid(sharesDue);
            }
        }

        // Activate extensions
        IExtension(FEE_MANAGER).activateForFund(_isMigration);
        IExtension(INTEGRATION_MANAGER).activateForFund(_isMigration);
        IExtension(POLICY_MANAGER).activateForFund(_isMigration);
    }

    /// @notice Remove the config for a fund
    /// @dev No need to assert anything beyond FundDeployer access.
    /// Calling onlyNotPaused here rather than in the FundDeployer allows
    /// the owner to potentially override the pause and rescue unpaid fees.
    function destruct()
        external
        override
        onlyFundDeployer
        onlyNotPaused
        allowsPermissionedVaultAction
    {
        // Deactivate the extensions
        IExtension(FEE_MANAGER).deactivateForFund();
        IExtension(INTEGRATION_MANAGER).deactivateForFund();
        IExtension(POLICY_MANAGER).deactivateForFund();

        // Delete storage of ComptrollerProxy
        // There should never be ETH in this contract, but if there is,
        // we can send to the VaultProxy.
        selfdestruct(payable(vaultProxy));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the routes for the various contracts used by all funds
    /// @return feeManager_ The `FEE_MANAGER` variable value
    /// @return fundDeployer_ The `FUND_DEPLOYER` variable value
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    /// @return policyManager_ The `POLICY_MANAGER` variable value
    /// @return primitivePriceFeed_ The `PRIMITIVE_PRICE_FEED` variable value
    function getLibRoutes()
        external
        view
        returns (
            address feeManager_,
            address fundDeployer_,
            address integrationManager_,
            address policyManager_,
            address primitivePriceFeed_
        )
    {
        return (
            FEE_MANAGER,
            FUND_DEPLOYER,
            INTEGRATION_MANAGER,
            POLICY_MANAGER,
            PRIMITIVE_PRICE_FEED
        );
    }
}
