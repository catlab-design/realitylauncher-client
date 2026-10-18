import { useCallback, useLayoutEffect, useRef } from 'react';

// Same identity for the component's lifetime, always calls the latest closure.
// Lets handlers be passed to memoized children without listing their deps.
export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
    const ref = useRef(fn);
    useLayoutEffect(() => {
        ref.current = fn;
    });
    return useCallback((...args: Args) => ref.current(...args), []);
}
