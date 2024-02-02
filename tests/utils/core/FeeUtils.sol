// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFee} from "tests/interfaces/internal/IFee.sol";
import {IFeeManager} from "tests/interfaces/internal/IFeeManager.sol";
import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

// Not a production type
enum Actions {
    InvokeContinuousFeeHook
}

abstract contract FeeUtils is CoreUtilsBase {
    function invokeContinuousFeeHook(IFeeManager _feeManager, IComptrollerLib _comptrollerProxy) internal {
        _comptrollerProxy.callOnExtension({
            _extension: address(_feeManager),
            _actionId: uint256(Actions.InvokeContinuousFeeHook),
            _callArgs: ""
        });
    }
}

/// @dev Complete IFee implementation without logic; simply returns all default values
contract MockDefaultFee is IFee {
    function activateForFund(address _comptrollerProxy, address _vaultProxy) external {}

    function addFundSettings(address _comptrollerProxy, bytes memory _settingsData) external {}

    function getRecipientForFund(address _comptrollerProxy) external view returns (address recipient_) {}

    /// @dev Legacy. No need to test anything.
    function payout(address _comptrollerProxy, address _vaultProxy) external returns (bool isPayable_) {}

    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) external returns (SettlementType settlementType_, address payer_, uint256 sharesDue_) {}

    function settlesOnHook(FeeHook _hook) external view returns (bool settles_, bool usesGav_) {}

    function updatesOnHook(FeeHook _hook) external view returns (bool updates_, bool usesGav_) {}

    function update(
        address _comptrollerProxy,
        address _vaultProxy,
        FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) external {}
}
