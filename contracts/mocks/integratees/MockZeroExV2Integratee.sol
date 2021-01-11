// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

contract MockZeroExV2Integratee {
    bytes public ZRX_ASSET_DATA;

    constructor(bytes memory _zrxAssetData) public {
        ZRX_ASSET_DATA = _zrxAssetData;
    }
}
