import * as React from 'react';
import * as mobxReact from 'mobx-react';
import { ReactComponent } from './internals/additional-types';
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
    const connectFn = <TAllProps extends TVMProps & TOwnProps, TVMProps, TOwnProps = {}>(
        ComponnetToConnect: ReactComponent<TAllProps>,
        mapVMToProps: (contextData: TVMData, ownProps?: TOwnProps) => TVMProps) => {

        return (ownProps: TOwnProps) => (
            <context.Consumer>
                {contextData => {
                    return <mobxReact.Observer>{() => {
                        const contextProps = mapVMToProps(contextData, ownProps);

                        const fullProps = {
                            ...ownProps,
                            ...contextProps,
                        } as TAllProps;

                        return <ComponnetToConnect {...fullProps} />;
                    }}
                    </mobxReact.Observer>
                }}
            </context.Consumer>
        );
    }

    return connectFn;
}

export { createConnect, contextRegistry };