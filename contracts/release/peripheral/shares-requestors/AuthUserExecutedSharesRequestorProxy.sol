// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../utils/Proxy.sol";

contract AuthUserExecutedSharesRequestorProxy is Proxy {
    constructor(bytes memory _constructData, address _authUserExecutedSharesRequestorLib)
        public
        Proxy(_constructData, _authUserExecutedSharesRequestorLib)
    {}
}
