// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {AdapterUtils} from "tests/utils/core/AdapterUtils.sol";
import {AssetUniverseUtils} from "tests/utils/core/AssetUniverseUtils.sol";
import {DeploymentUtils, ICoreDeployment} from "tests/utils/core/DeploymentUtils.sol";
import {ExternalPositionUtils} from "tests/utils/core/ExternalPositionUtils.sol";
import {PolicyUtils} from "tests/utils/core/PolicyUtils.sol";
import {VaultUtils} from "tests/utils/core/VaultUtils.sol";

abstract contract CoreUtils is
    AdapterUtils,
    PolicyUtils,
    AssetUniverseUtils,
    DeploymentUtils,
    ExternalPositionUtils,
    VaultUtils
{}
