// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./../interfaces/ISynthetixProxyERC20.sol";
import "./../interfaces/ISynthetixSynth.sol";

/// @title SynthetixHelper Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Helpers function for common Synthetix operations
abstract contract SynthetixHelper {
    /// @notice Gets the currencyKey for the specified proxy
    /// @param _proxy The synth proxy
    /// @return currencyKey_ The currency key associated to synth
    function getCurrencyKey(address _proxy) internal view returns (bytes32 currencyKey_) {
        try ISynthetixProxyERC20(_proxy).target() returns (address target) {
            if (target == address(0)) {
                return 0;
            }

            try ISynthetixSynth(target).currencyKey() returns (bytes32 _currencyKey) {
                currencyKey_ = _currencyKey;
                return currencyKey_;
            } catch {
                return 0;
            }
        } catch {
            return 0;
        }
    }
}
