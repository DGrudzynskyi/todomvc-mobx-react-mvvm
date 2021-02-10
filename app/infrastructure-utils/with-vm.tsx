import { default as React, useEffect } from 'react';
import { useStateSafe } from './internals/use-state-safe';
import { ReactComponent } from './internals/additional-types';
import { IViewModel, IVMConstructor } from './wm-types';
import { contextRegistry } from './create-connect';


/**
 * make function, which bind the viewmodel to the component
 * Wraps react component by passing prepared viewmodel into it as a separate prop
 * Should be used if vmFactory is overriden in order to unilize IoC container for viewmodel instances creation
 * Otherwise - use default 'withVM' function
 * @param vmFactory - factory, used for creation of the viewmodel from it's constructor and initial props passed to the component
 */
const makeWithVM = (
    vmFactory: <TFactoryProps, TFactoryVM extends IViewModel<TFactoryProps>>(props: TFactoryProps, VMConstructor: IVMConstructor<TFactoryProps, TFactoryVM>) => TFactoryVM
) => <TVM extends IViewModel<TProps>, TFullProps extends Record<TVMPropName,TVM> & TProps,TVMPropName extends string = never,  TProps = Record<string, unknown>>(
    Component: ReactComponent<TFullProps>,
    VMConstructor: IVMConstructor<TProps, TVM>,
    vmPropName?: TVMPropName,
    depsSelector?: (props: TProps) => any[],
) => {
    return ((props: TProps) => {
        const [viewModel, setViewModel] = useStateSafe<TVM>(null);

        useEffect(() => {
            if(viewModel && viewModel.onPropsChanged) {
                viewModel.onPropsChanged(props);
            }
        });

        let isComponentRemoved = false;
        useEffect(() => {
            const vm = vmFactory(props, VMConstructor);
            const initializeResult = vm.initialize ? vm.initialize() : null;
            
            // if initialize return promise - await it first, then set viewmodel into component's state
            if (initializeResult instanceof Promise) {
                initializeResult.then(() => {
                    if(!isComponentRemoved) {
                        setViewModel(vm);
                        // todo: doublecheck whether cleanup should be enforced here, likely it shouldn't as it is supposed to be cleaned up in 
                        // effect's return function 
                        // vm && vm.cleanup && vm.cleanup()
                    }

                    // let expection be propagated (if any). Exceptions, thrown within the lifecicle methods, is not a subject for handling within this hook
                });
            } else {
                // if initialize return something other than promise or not exists - set viewmodel right away
                setViewModel(vm);
            }

            return () => {
                if(vm && vm.cleanup){
                    vm.cleanup();
                }

                isComponentRemoved = true;
            };
        }, depsSelector ? depsSelector(props) : []);

        if (viewModel) {
            const propsWithVM = {
                ...props,
            } as TFullProps;

            // if property is suppsed to be injected into the component, hosting the viewmodel - pass it as a new prop
            if(vmPropName) {
                // todo: investigate why "Type 'IViewModel<TProps>' is not assignable to type 'TFullProps[TVMPropName]'
                propsWithVM[vmPropName] = viewModel as any;
            }

            const ContextInstance = contextRegistry[VMConstructor.name];

            return (
                <ContextInstance.Provider value={viewModel}>
                    <Component {...propsWithVM}/>
                </ContextInstance.Provider>
            );
        } else {
            return null;
        }
    // that's tricky: TProps can not be casted to Omit<TFullProps, TVMPropName> because typescript think that there might be no overlap
    // but TFullProps extends from TProps so there should be an overlap
    }) as unknown as React.FunctionComponent<Omit<TFullProps, TVMPropName>>;
};


/**
 * Create persistent viewmodel from react props.
 * Wraps react component into the context, which provide the instance of viewmodel
 * if 'vmPropName' parameter is present - pass viewmodel as a property to the Component
 * @param Component - component, which receive viewmodel in a prop named after 'vmPropName' argument if 'vmPropName' is provided
 * @param VMConstructor - constructor of the viewmodel. Viewmodel will be created using 'new' operator with this constructor
 *  and passing component's props as a first argument of the constructor
 * @param depsSelector - if returns an array - this array is passed to 'deps' argument of react's useEffect hook 
 *  to let viewmodel be rebuilt if needed on specific props change. If does not return anything - empty array is passed to the useEffect,
 *  so single viemodel instance is active throught the whole lifetime of component instance.
 * @param vmPropName - name of the prop, used for viewmodel injection.
 */
const withVM = makeWithVM((props, Constructor) => new Constructor(props));

export { withVM, makeWithVM, IViewModel };