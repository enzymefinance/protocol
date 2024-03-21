// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface IGSNPaymaster {
    function trustedForwarder() external view returns (address trustedForwarder_);
}
