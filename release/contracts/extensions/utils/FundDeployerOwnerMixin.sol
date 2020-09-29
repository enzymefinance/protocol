// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../core/fund-deployer/IFundDeployer.sol";

/// @title FundDeployerOwnerMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract that defers ownership to the owner of FundDeployer
abstract contract FundDeployerOwnerMixin {
    address internal immutable FUND_DEPLOYER;

    modifier onlyFundDeployerOwner() {
        require(
            msg.sender == getOwner(),
            "onlyFundDeployerOwner: Only the FundDeployer owner can call this function"
        );
        _;
    }

    constructor(address _fundDeployer) public {
        FUND_DEPLOYER = _fundDeployer;
    }

    function getOwner() public view returns (address) {
        return IFundDeployer(FUND_DEPLOYER).getOwner();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getFundDeployer() external view returns (address) {
        return FUND_DEPLOYER;
    }
}
