// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IBebopBlend as IBebopBlendProd} from "contracts/external-interfaces/IBebopBlend.sol";

interface IBebopBlend is IBebopBlendProd {
    function hashSingleOrder(
        Single memory order,
        uint64 partnerId,
        uint256 updatedMakerAmount,
        uint256 updatedMakerNonce
    ) external view returns (bytes32);
}
