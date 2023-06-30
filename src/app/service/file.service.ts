import { Injectable } from "@angular/core";

@Injectable()
export class FileService {
    fs: any;
    constructor() {
        // or this.fs = <any>window.fs
        this.fs = (window as any).fs;
    }
}