import * as React from 'react';
import * as mobxReact from 'mobx-react';
import { ReactComponent } from './internals/additional-types';

/**
 * build connect function, which takes properties from the viewmodel, set into context of provided type
 * @param context
 */
const createConnect = <TContextData,>(
    context: React.Context<TContextData>,
) => {
    // merge properties derived from context with own properties of compoent
    return <TContextProps, TOwnProps = {}>(
        ComponnetToConnect: ReactComponent<TContextProps & TOwnProps>,
        mapContextToProps: (contextData: TContextData, ownProps?: TOwnProps) => TContextProps) => {

        // todo: doublecheck if memo is needed and is not automatically applied by 'consumer'
        return React.memo((ownProps: TOwnProps) => (
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
        ));
    }
}

export { createConnect };