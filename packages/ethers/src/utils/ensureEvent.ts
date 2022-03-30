import type { Fragment, Interface, JsonFragment } from '@ethersproject/abi';
import { EventFragment } from '@ethersproject/abi';

export type PossibleEvent = Fragment | JsonFragment | string;
export function ensureEvent(event: PossibleEvent | string, abi?: Interface) {
  if (EventFragment.isEventFragment(event)) {
    return event;
  }

  if (typeof event === 'string') {
    if (event.includes('(')) {
      return EventFragment.from(event);
    }

    const fragment = abi?.getEvent(event);

    // eslint-disable-next-line eqeqeq
    if (fragment != null) {
      return fragment;
    }
  }

  throw new Error('Failed to resolve event');
}
