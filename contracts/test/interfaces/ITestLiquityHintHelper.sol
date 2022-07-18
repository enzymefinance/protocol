// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestLiquityHintHelper Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestLiquityHintHelper {
    function getApproxHint(
        uint256 _CR,
        uint256 _numTrials,
        uint256 _inputRandomSeed
    )
        external
        returns (
            address hintAddress_,
            uint256 diff_,
            uint256 latestRandomSeed_
        );
}
