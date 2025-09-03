// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

// TODO: move file to `contracts/release/extensions/integration-manager/integrations/adapters/interfaces/`

/// @title IMyAdapter interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IMyAdapter {
    enum Action {
        Foo,
        Bar
    }

    struct FooActionArgs {
        address baz;
    }

    struct BarActionArgs {
        address qux;
    }
}
