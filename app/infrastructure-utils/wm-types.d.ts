export interface IViewModel<IProps = Record<string, unknown>> {
    initialize?: () => Promise<void> | void;
    cleanup?: () => void;
    onPropsChanged?: (props: IProps) => void;
}

export interface IVMConstructor<TProps, TVM extends IViewModel<TProps>> {
    new (props: TProps, ...dependencies: any[]) : TVM;
}