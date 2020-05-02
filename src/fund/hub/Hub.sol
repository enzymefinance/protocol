// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../registry/IRegistry.sol";
import "./Spoke.sol";
import "./IHub.sol";

/// @title Hub Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Router for communication between components
/// @notice Has one or more Spokes
contract Hub is IHub {
    event FeeManagerSet(address feeManager);

    event PolicyManagerSet(address policyManager);

    event SharesSet(address shares);

    event VaultSet(address vault);

    event StatusUpdated(FundStatus indexed status);

    // Fund vars
    address public override MANAGER;
    string public NAME;
    FundStatus public override status;

    // Infrastruture
    address public override FUND_FACTORY;
    address public override REGISTRY;

    // Components
    address public override feeManager;
    address public override policyManager;
    address public override shares;
    address public override vault;

    modifier onlyFundFactory() {
        require(
            msg.sender == FUND_FACTORY,
            "Only FundFactory can make this call"
        );
        _;
    }

    constructor(address _registry, address _fundFactory, address _manager, string memory _name)
        public
    {
        FUND_FACTORY = _fundFactory;
        MANAGER = _manager;
        NAME = _name;
        REGISTRY = _registry;
    }

    /// @notice Initializes a fund (activates it)
    function initializeFund() external onlyFundFactory {
        require(status == FundStatus.Draft, "initializeFund: Fund already initialized");

        status = FundStatus.Active;
        emit StatusUpdated(status);
    }

    /// @notice Sets the feeManager address for the fund
    /// @param _feeManager The FeeManager component for the fund
    function setFeeManager(address _feeManager) external onlyFundFactory {
        require(feeManager == address(0), "setFeeManager: feeMangaer is already set");

        feeManager = _feeManager;
        emit FeeManagerSet(feeManager);
    }

    /// @notice Sets the policyManager address for the fund
    /// @param _policyManager The PolicyManager component for the fund
    function setPolicyManager(address _policyManager) external onlyFundFactory {
        require(policyManager == address(0), "setPolicyManager: policyManager is already set");

        policyManager = _policyManager;
        emit PolicyManagerSet(policyManager);
    }

    /// @notice Sets the shares address for the fund
    /// @param _shares The Shares component for the fund
    function setShares(address _shares) external onlyFundFactory {
        require(shares == address(0), "setShares: shares is already set");

        shares =_shares;
        emit SharesSet(shares);
    }

    /// @notice Sets the vault address for the fund
    /// @param _vault The Vault component for the fund
    function setVault(address _vault) external onlyFundFactory {
        require(vault == address(0), "setVault: vault is already set");

        vault =_vault;
        emit VaultSet(vault);
    }

    /// @notice Shut down the fund
    function shutDownFund() external {
        require(msg.sender == MANAGER, "shutDownFund: Only fund manager can call this function");
        require(status == FundStatus.Active, "shutDownFund: Fund is not active");

        status = FundStatus.Inactive;
        emit StatusUpdated(status);
    }
}
