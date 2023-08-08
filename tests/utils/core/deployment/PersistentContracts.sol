// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {IDispatcher} from "tests/interfaces/internal/IDispatcher.sol";
import {IExternalPositionFactory} from "tests/interfaces/internal/IExternalPositionFactory.sol";
import {IGlobalConfigLib} from "tests/interfaces/internal/IGlobalConfigLib.sol";
import {IProtocolFeeReserveLib} from "tests/interfaces/internal/IProtocolFeeReserveLib.sol";
import {IUintListRegistry} from "tests/interfaces/internal/IUintListRegistry.sol";

struct Contracts {
    IAddressListRegistry addressListRegistry;
    IDispatcher dispatcher;
    IExternalPositionFactory externalPositionFactory;
    IGlobalConfigLib globalConfigProxy;
    IProtocolFeeReserveLib protocolFeeReserveProxy;
    IUintListRegistry uintListRegistry;
}

function getMainnetDeployment() pure returns (Contracts memory) {
    return Contracts({
        addressListRegistry: IAddressListRegistry(0x4eb4c7Babfb5d54ab4857265B482Fb6512d22DFF),
        dispatcher: IDispatcher(0xC3DC853dD716bd5754f421ef94fdCbac3902ab32),
        externalPositionFactory: IExternalPositionFactory(0x0AAcb782205dde9eFf4862ACe9849DcE1ca3409f),
        globalConfigProxy: IGlobalConfigLib(0x5611dF74A77EfD198De5Fc7f83A482DcFE0c7A7A),
        protocolFeeReserveProxy: IProtocolFeeReserveLib(0xB7460593BD222E24a2bF4393aa6416bD373995E0),
        uintListRegistry: IUintListRegistry(0x6FfD6fC068E7b365AF18dA4fdC39D3289159407B)
    });
}

function getPolygonDeployment() pure returns (Contracts memory) {
    return Contracts({
        addressListRegistry: IAddressListRegistry(0x5AE15bF655a8f42b9C7D93E64f4476ec1DA248f8),
        dispatcher: IDispatcher(0x2e25271297537B8124b8f883a92fFd95C4032733),
        externalPositionFactory: IExternalPositionFactory(0x067eEEa753aba0DDeCCa0b80BBB8b7572bf6580D),
        globalConfigProxy: IGlobalConfigLib(0xcbbD50255Cf49797BaDB28cE625a4ea217C67A64),
        protocolFeeReserveProxy: IProtocolFeeReserveLib(0xF0BFEE2A93B0A1F9C5f6C1d731a6cf1308d68b2D),
        uintListRegistry: IUintListRegistry(0x6DdD871C1607348eBb5BE250F882255390166519)
    });
}
