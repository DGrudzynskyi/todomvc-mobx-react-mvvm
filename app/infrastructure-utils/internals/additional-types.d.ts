import { ClassicComponentClass, ComponentClass, ForwardRefExoticComponent, FunctionComponent } from "react";

export type ReactComponent<P> = ComponentClass<P, any> | ClassicComponentClass<P> |  FunctionComponent<P> | ForwardRefExoticComponent<P>;