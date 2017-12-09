pragma solidity ^0.4.19;

import '../assets/Asset.sol';

/// @title Premined asset Contract for testing
/// @author Melonport AG <team@melonport.com>
/// @notice Do not use on main net
contract PreminedAsset is Asset {

    // FIELDS

    totalSupply = 10 ** uint256(28);
}
