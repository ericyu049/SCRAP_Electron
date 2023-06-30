import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

@Injectable()
export class ParamStateService {
    private parametersSubject !: BehaviorSubject<any>;
    private parameters$ !: Observable<any>;

    constructor() {
        this.parametersSubject = new BehaviorSubject(null);
        this.parameters$ = this.parametersSubject.asObservable();
    }
    getParameters() {
        return this.parameters$;
    }
    setParameters(state: any) {
        this.parametersSubject.next(state);
    }

}