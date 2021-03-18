import * as mobx from "mobx";
import { beforeUpdate, getContext, onDestroy } from "svelte";
import { IVMConstructor } from "./wm-types";

const createConnect = <TViewModel>(constructorType: IVMConstructor<any, TViewModel>) => {
    return (slicingFunction: (vm: TViewModel) => void) => {
        const contextKey = constructorType.name;
        
        const ctx = getContext<TViewModel>(contextKey);
        
        let reactionReference = mobx.autorun(() => {
            slicingFunction(ctx);
        });
    
        onDestroy(() => {
            reactionReference && reactionReference();
        });

        beforeUpdate(() => {
            slicingFunction(ctx);
        });
    }
};

export { createConnect };