import { ClassicComponentClass, ComponentClass, ForwardRefExoticComponent, FunctionComponent, MemoExoticComponent } from "react";

export type ReactComponent<P> = ComponentClass<P, any> | ClassicComponentClass<P> |  FunctionComponent<P> | ForwardRefExoticComponent<P>;