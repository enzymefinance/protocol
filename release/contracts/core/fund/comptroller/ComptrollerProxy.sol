// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/persistent/contracts/utils/Proxy.sol";

contract ComptrollerProxy is Proxy {
    constructor(bytes memory _constructData, address _contractLogic)
        public
        Proxy(_constructData, _contractLogic)
    {}
}
