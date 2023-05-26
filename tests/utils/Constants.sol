// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

abstract contract Constants {
    // Percentages
    uint256 internal constant BPS_ONE_HUNDRED_PERCENT = 10_000;
    uint256 internal constant BPS_ONE_PERCENT = BPS_ONE_HUNDRED_PERCENT / 100;

    uint256 internal constant WEI_ONE_HUNDRED_PERCENT = 10 ** 18;
    uint256 internal constant WEI_ONE_PERCENT = WEI_ONE_HUNDRED_PERCENT / 100;

    // Network blocks (for fork tests)
    // Some tests may require specific blocks to guarantee a required setup,
    // expected exchange rates, etc.
    // `ETHEREUM_BLOCK_LATEST` can be increased as-needed, and should be used in all tests
    // that should generally continue to pass regardless of block.
    uint256 internal constant ETHEREUM_BLOCK_LATEST = 17345000; // May 26, 2023

    uint256 internal constant POLYGON_BLOCK_LATEST = 43179000; // May 26, 2023
}
