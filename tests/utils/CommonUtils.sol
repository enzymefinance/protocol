// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AssetBalanceUtils} from "tests/utils/common/AssetBalanceUtils.sol";
import {ErrorUtils} from "tests/utils/common/ErrorUtils.sol";
import {EventUtils} from "tests/utils/common/EventUtils.sol";
import {SignatureUtils} from "tests/utils/common/SignatureUtils.sol";
import {StorageUtils} from "tests/utils/common/StorageUtils.sol";
import {TokenUtils} from "tests/utils/common/TokenUtils.sol";
import {TypeUtils} from "tests/utils/common/TypeUtils.sol";

abstract contract CommonUtils is
    AssetBalanceUtils,
    ErrorUtils,
    EventUtils,
    SignatureUtils,
    StorageUtils,
    TokenUtils,
    TypeUtils
{}
