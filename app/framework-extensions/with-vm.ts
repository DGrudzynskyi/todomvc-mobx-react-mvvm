import { IViewModel, IVMConstructor } from './wm-types';
import * as mobx from 'mobx';
import { onDestroy, setContext, afterUpdate } from 'svelte';

/**
 * make function, which bind the viewmodel to the component
 * Wraps react component by passing prepared viewmodel into it as a separate prop
 * Should be used if vmFactory is overriden if we want to utilize IoC container for viewmodel instances creation
 * Otherwise - use default 'withVM' function
 * @param vmFactory - factory, used for creation of the viewmodel from it's constructor and initial props passed to the component
 */
const makeWithVM = (
    vmFactory: <TFactoryProps, TFactoryVM extends IViewModel<TFactoryProps>>(props: TFactoryProps, VMConstructor: IVMConstructor<TFactoryProps, TFactoryVM>) => TFactoryVM
) => <TVM extends IViewModel<TProps>, TProps = Record<string, unknown>, TDeps = Partial<TProps>>(
    VMConstructor: IVMConstructor<TProps, TVM>,
    currentProps: () => TProps,
    depsSelector?: () => TDeps,
) => {
    let depsValues = depsSelector ? depsSelector() : {};

    let viewModel = vmFactory(currentProps(), VMConstructor);

    // todo: require support for async initialization logic, so far ignore promises returned from 'initialize' method
    viewModel.initialize && viewModel.initialize();

    setContext(VMConstructor.name, viewModel);    

    afterUpdate(() => {
        let newDepsValues = depsSelector ? depsSelector() : {};

        if(!mobx.comparer.shallow(depsValues, newDepsValues)){
            viewModel.cleanup && viewModel.cleanup();

            viewModel = vmFactory(currentProps(), VMConstructor);

            // todo: require support for async initialization logic
            viewModel.initialize && viewModel.initialize();

            setContext(VMConstructor.name, viewModel);
        } else {
            viewModel.onPropsChanged && viewModel.onPropsChanged(currentProps());
        }
    });

    onDestroy(() => {
        viewModel && viewModel.cleanup && viewModel.cleanup();
    });
};

/**
 * Create persistent viewmodel from received props
 * sets the context of 'VMConstructor' type
 * @param Component - component, which receive viewmodel in a prop named after 'vmPropName' argument if 'vmPropName' is provided
 * @param VMConstructor - constructor of the viewmodel. Viewmodel will be created using 'new' operator with this constructor
 *  and passing component's props as a first argument of the constructor
 * @param depsSelector - if returns an array - check this array for shallow equality with the array, returned using the previous props
 * If values does not match previous values - re-create the viewmodel and reset new instance into the context
 */
const withVM = makeWithVM((props, Constructor) => mobx.makeObservable(new Constructor(props)));

export { withVM, makeWithVM, IViewModel };