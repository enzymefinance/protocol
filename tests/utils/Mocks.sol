// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IExtension} from "tests/interfaces/internal/IExtension.sol";
import {IFee} from "tests/interfaces/internal/IFee.sol";
import {IFundValueCalculator} from "tests/interfaces/internal/IFundValueCalculator.sol";
import {IMigrationHookHandler} from "tests/interfaces/internal/IMigrationHookHandler.sol";
import {IPolicy} from "tests/interfaces/internal/IPolicy.sol";

// MOCK DEFAULT CONTRACTS
// Complete interface implementation without logic; simply returns all default values

contract MockDefaultExtension is IExtension {
    function activateForFund() external virtual override {}

    function deactivateForFund() external virtual override {}

    function receiveCallFromComptroller(address _caller, uint256 _actionId, bytes calldata _callArgs)
        external
        virtual
        override
    {}

    function setConfigForFund(bytes calldata _configData) external virtual override {}
}

contract MockDefaultFee is IFee {
    function activateForFund(address _comptrollerProxy, address _vaultProxy) external virtual override {}

    function addFundSettings(address _comptrollerProxy, bytes memory _settingsData) external virtual override {}

    function getRecipientForFund(address _comptrollerProxy)
        external
        view
        virtual
        override
        returns (address recipient_)
    {}

    /// @dev Legacy. No need to test anything.
    function payout(address _comptrollerProxy, address _vaultProxy)
        external
        virtual
        override
        returns (bool isPayable_)
    {}

    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) external virtual override returns (SettlementType settlementType_, address payer_, uint256 sharesDue_) {}

    function settlesOnHook(FeeHook _hook) external view virtual override returns (bool settles_, bool usesGav_) {}

    function updatesOnHook(FeeHook _hook) external view virtual override returns (bool updates_, bool usesGav_) {}

    function update(
        address _comptrollerProxy,
        address _vaultProxy,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) external virtual override {}
}

contract MockDefaultMigrationHookHandler is IMigrationHookHandler {
    function invokeMigrationInCancelHook(
        address _vaultProxy,
        address _prevFundDeployer,
        address _nextVaultAccessor,
        address _nextVaultLib
    ) external override {}

    function invokeMigrationOutHook(
        MigrationOutHook _hook,
        address _vaultProxy,
        address _nextFundDeployer,
        address _nextVaultAccessor,
        address _nextVaultLib
    ) external override {}
}

contract MockDefaultFundValueCalculator is IFundValueCalculator {
    function calcGav(address _vaultProxy)
        external
        virtual
        override
        returns (address denominationAsset_, uint256 gav_)
    {}

    function calcGavInAsset(address _vaultProxy, address _quoteAsset)
        external
        virtual
        override
        returns (uint256 gav_)
    {}

    function calcGrossShareValue(address _vaultProxy)
        external
        virtual
        override
        returns (address denominationAsset_, uint256 grossShareValue_)
    {}

    function calcGrossShareValueInAsset(address _vaultProxy, address _quoteAsset)
        external
        virtual
        override
        returns (uint256 grossShareValue_)
    {}

    function calcNav(address _vaultProxy)
        external
        virtual
        override
        returns (address denominationAsset_, uint256 nav_)
    {}

    function calcNavInAsset(address _vaultProxy, address _quoteAsset)
        external
        virtual
        override
        returns (uint256 nav_)
    {}

    function calcNetShareValue(address _vaultProxy)
        external
        virtual
        override
        returns (address denominationAsset_, uint256 netShareValue_)
    {}

    function calcNetShareValueInAsset(address _vaultProxy, address _quoteAsset)
        external
        virtual
        override
        returns (uint256 netShareValue_)
    {}

    function calcNetValueForSharesHolder(address _vaultProxy, address _sharesHolder)
        external
        virtual
        override
        returns (address denominationAsset_, uint256 netValue_)
    {}

    function calcNetValueForSharesHolderInAsset(address _vaultProxy, address _sharesHolder, address _quoteAsset)
        external
        virtual
        override
        returns (uint256 netValue_)
    {}
}

contract MockDefaultPolicy is IPolicy {
    function activateForFund(address _comptrollerProxy) external virtual override {}

    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings) external virtual override {}

    function canDisable() external pure virtual override returns (bool canDisable_) {}

    function identifier() external pure virtual override returns (string memory identifier_) {}

    function implementedHooks()
        external
        pure
        virtual
        override
        returns (IPolicy.PolicyHook[] memory implementedHooks_)
    {}

    function updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings) external virtual override {}

    function validateRule(address _comptrollerProxy, IPolicy.PolicyHook _hook, bytes calldata _encodedArgs)
        external
        virtual
        override
        returns (bool isValid_)
    {}
}
