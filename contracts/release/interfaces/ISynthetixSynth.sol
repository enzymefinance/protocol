// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title ISynthetixSynth Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface ISynthetixSynth {
    function currencyKey() external view returns (bytes32);
}
