// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ErrorUtils} from "tests/utils/common/ErrorUtils.sol";
import {EventUtils} from "tests/utils/common/EventUtils.sol";
import {TokenUtils} from "tests/utils/common/TokenUtils.sol";

abstract contract CommonUtils is TokenUtils, EventUtils, ErrorUtils {
    address internal alice = makeAddr("Alice");
    address internal bob = makeAddr("Bob");

    uint256 internal constant ONE_HUNDRED_PERCENT = 10_000;
    uint256 internal constant ONE_PERCENT = ONE_HUNDRED_PERCENT / 100;
}
