// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ICurveGaugeController {
    function change_gauge_weight(address _gauge, uint256 _weight) external;

    function get_gauge_weight(address _gauge) external view returns (uint256 weight_);

    function get_total_weight() external view returns (uint256 totalWeight_);
}
