import { IProvider, Injector, Provider, createSingletonProviderClass } from "@tandem/common";
// import { ModuleHistory } from "./history";

export const HistorySingletonProvider = createSingletonProviderClass<any>("moduleHistory");