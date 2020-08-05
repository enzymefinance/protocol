// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

contract MockChaiPriceSource {
    uint256 public chi;
    uint256 public rho;
    uint256 public drip;

    constructor(uint256 _chi, uint256 _rho, uint256 _drip)
        public
    {
        chi = _chi;
        rho = _rho;
        drip = _drip;
    }

    function setChi(uint256 _chi) external {
        chi = _chi;
    }

    function setRho(uint256 _rho) external {
        rho = _rho;
    }

    function setDrip(uint256 _drip) external {
        drip = _drip;
    }
}
