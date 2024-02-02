// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {DeploymentUtils} from "tests/utils/core/deployment/DeploymentUtils.sol";
import {AdapterUtils} from "tests/utils/core/AdapterUtils.sol";
import {AssetUniverseUtils} from "tests/utils/core/AssetUniverseUtils.sol";
import {ExternalPositionUtils} from "tests/utils/core/ExternalPositionUtils.sol";
import {FeeUtils} from "tests/utils/core/FeeUtils.sol";
import {PolicyUtils} from "tests/utils/core/PolicyUtils.sol";
import {VaultUtils} from "tests/utils/core/VaultUtils.sol";

abstract contract CoreUtils is
    DeploymentUtils,
    AdapterUtils,
    AssetUniverseUtils,
    ExternalPositionUtils,
    FeeUtils,
    PolicyUtils,
    VaultUtils
{}
