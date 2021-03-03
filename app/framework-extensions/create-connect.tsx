import * as React from 'react';
import * as mobxReact from 'mobx-react';
import { ReactComponent } from './additional-types';
import { IVMConstructor } from './wm-types';

const contextRegistry: {[key: string]: React.Context<any>} = {};

/**
 * build connect function, which takes properties from the viewmodel, set into context of provided type
 * @param context - if not passed - create new react context and return in alongside the connect function
 */
const createConnect = <TVMData,>(
    constructorType: IVMConstructor<any, TVMData>,
)=> {
    if(contextRegistry[constructorType.name]) {
        throw new Error(`unable to create context for constructor '${constructorType.name}'. Context has been already created`);
    }
    
    const context = React.createContext<TVMData>(null);
    // todo: instead of using bold 'name' add some seed to the constructor dynamically on first createConnect call
    contextRegistry[constructorType.name] = context;

    // merge properties derived from context with own properties of compoent
    return <TAllProps extends TVMProps & TOwnProps, TVMProps, TOwnProps = {}>(
        ComponnetToConnect: ReactComponent<TAllProps>,
        mapVMToProps: (contextData: TVMData, ownProps?: TOwnProps) => TVMProps) => {

        const wrappedHOC = (ownProps: TOwnProps) => {
            const ctxData = React.useContext(context);
            // utilize useObserver instead of <Observer> in order to make react devtools more useful
            const ObserverComponent = mobxReact.useObserver(() => {
                const contextProps = mapVMToProps(ctxData, ownProps);

                const fullProps = {
                    ...ownProps,
                    ...contextProps,
                } as TAllProps;

                return <ComponnetToConnect {...fullProps} />;
            });
            return ObserverComponent;
        }

        // for react devtools, sik. todo: don't apply in dev env
        wrappedHOC.displayName = (ComponnetToConnect.displayName || ComponnetToConnect.name) + '_connected_' + constructorType.name;
        return wrappedHOC;
    }
}

export { createConnect, contextRegistry };