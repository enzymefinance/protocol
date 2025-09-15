// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IBebopBlend} from "contracts/external-interfaces/IBebopBlend.sol";

/// @title IBebopBlendAdapter interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IBebopBlendAdapter {
    enum Action {
        SwapSingle
    }

    /// @param order Single order payload, passed-through to Bebop
    /// @param makerSignature MakerSignature payload, passed-through to Bebop
    struct SwapSingleActionArgs {
        IBebopBlend.Single order;
        IBebopBlend.MakerSignature makerSignature;
    }

    function isAllowedMaker(address _who) external view returns (bool isAllowedMaker_);
}
