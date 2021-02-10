import * as React from 'react';
import * as mobxReact from 'mobx-react';
import { ReactComponent } from './internals/additional-types';

type ConnectType<TContextData> = <TContextProps, TOwnProps = {}>(
    ComponnetToConnect: ReactComponent<TContextProps & TOwnProps>,
    mapContextToProps: (contextData: TContextData, ownProps?: TOwnProps) => TContextProps) => ReactComponent<TOwnProps>

/**
 * build connect function, which takes properties from the viewmodel, set into context of provided type
 * @param context - if not passed - create new react context and return in alongside the connect function
 */
const createConnect = <TContextData,>(
    context: React.Context<TContextData> = null,
) : [ConnectType<TContextData>, React.Context<TContextData>] => {
    if(context == null) {
        context = React.createContext<TContextData>(null);
    }


    // merge properties derived from context with own properties of compoent
    const connectFn = <TContextProps, TOwnProps = {}>(
        ComponnetToConnect: ReactComponent<TContextProps & TOwnProps>,
        mapContextToProps: (contextData: TContextData, ownProps?: TOwnProps) => TContextProps) => {

        return (ownProps: TOwnProps) => (
            <context.Consumer>
                {contextData => {
                    return <mobxReact.Observer>{() => {
                        const contextProps = mapContextToProps(contextData, ownProps);

                        const fullProps = {
                            ...ownProps,
                            ...contextProps,
                        }

                        return <ComponnetToConnect {...fullProps} />;
                    }}
                    </mobxReact.Observer>
                }}
            </context.Consumer>
        );
    }

    return [connectFn, context];
}

export { createConnect };