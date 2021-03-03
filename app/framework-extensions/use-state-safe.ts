import { useRef, useEffect } from 'react';
import { Dispatch, SetStateAction, useState } from 'react';

/**
 * let subscribe to mount status
 */
const useIsMount = (): React.RefObject<boolean> => {
    const isMountRef = useRef(true);
    useEffect(() => {
        isMountRef.current = true;
        return () => {
            isMountRef.current = false;
        };
    });
    return isMountRef;
};
/**
 * similar to useState, but setState is being invoked only if component is not yet unmounted
 */
const useStateSafe = <S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>] => {
    const mountStatus = useIsMount();
    const useStateResult = useState(initialState);

    const setStateUnsafe = useStateResult[1];
    const setStateSafe = (value: SetStateAction<S>) => {
        // prevent calling setState on unmounted components
        if (mountStatus.current) {
            setStateUnsafe(value);
        }
    };

    useStateResult[1] = setStateSafe;
    return useStateResult;
};

export { useStateSafe };
