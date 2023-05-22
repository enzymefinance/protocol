// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../../external-interfaces/ISynthetix.sol";
import "../../../../../../external-interfaces/ISynthetixProxyERC20.sol";
import "../../../../../../external-interfaces/ISynthetixRedeemer.sol";
import "../../../../../../external-interfaces/ISynthetixSynth.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title SynthetixActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Synthetix exchange functions
abstract contract SynthetixActionsMixin is AssetHelpers {
    address private immutable SYNTHETIX;
    address private immutable SYNTHETIX_ORIGINATOR;
    address private immutable SYNTHETIX_REDEEMER;
    bytes32 private immutable SYNTHETIX_TRACKING_CODE;

    constructor(
        address _originator,
        address _redeemer,
        address _synthetix,
        bytes32 _trackingCode
    ) public {
        SYNTHETIX_ORIGINATOR = _originator;
        SYNTHETIX_REDEEMER = _redeemer;
        SYNTHETIX = _synthetix;
        SYNTHETIX_TRACKING_CODE = _trackingCode;
    }

    /// @dev Helper to get the currency key for a Synthetix synth
    function __synthetixGetCurrencyKey(address _synth)
        internal
        view
        returns (bytes32 currencyKey_)
    {
        return ISynthetixSynth(ISynthetixProxyERC20(_synth).target()).currencyKey();
    }

    /// @dev Helper to execute takeOrder
    function __synthetixTakeOrder(
        address _recipient,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset
    ) internal {
        ISynthetix(SYNTHETIX).exchangeOnBehalfWithTracking(
            _recipient,
            __synthetixGetCurrencyKey(_outgoingAsset),
            _outgoingAssetAmount,
            __synthetixGetCurrencyKey(_incomingAsset),
            SYNTHETIX_ORIGINATOR,
            SYNTHETIX_TRACKING_CODE
        );
    }

    /// @dev Helper to execute redeem
    function __synthetixRedeem(address[] memory _synths) internal {
        ISynthetixRedeemer(SYNTHETIX_REDEEMER).redeemAll(_synths);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `SYNTHETIX` variable
    /// @return synthetix_ The `SYNTHETIX` variable value
    function getSynthetix() public view returns (address synthetix_) {
        return SYNTHETIX;
    }

    /// @notice Gets the `SYNTHETIX_ORIGINATOR` variable
    /// @return synthetixOriginator_ The `SYNTHETIX_ORIGINATOR` variable value
    function getSynthetixOriginator() public view returns (address synthetixOriginator_) {
        return SYNTHETIX_ORIGINATOR;
    }

    /// @notice Gets the `SYNTHETIX_REDEEMER` variable
    /// @return synthetixRedeemer_ The `SYNTHETIX_REDEEMER` variable value
    function getSynthetixRedeemer() public view returns (address synthetixRedeemer_) {
        return SYNTHETIX_REDEEMER;
    }

    /// @notice Gets the `SYNTHETIX_TRACKING_CODE` variable
    /// @return synthetixTrackingCode_ The `SYNTHETIX_TRACKING_CODE` variable value
    function getSynthetixTrackingCode() public view returns (bytes32 synthetixTrackingCode_) {
        return SYNTHETIX_TRACKING_CODE;
    }
}
