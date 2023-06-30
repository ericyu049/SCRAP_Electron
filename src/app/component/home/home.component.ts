import { Component } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { ParamStateService } from "src/app/service/param-state.service";

@Component({
    selector: 'home-comp',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent {
    paramForm !: FormGroup;

    get isValid() { return this.paramForm.valid }

    constructor(private fb: FormBuilder, private paramState: ParamStateService, private router: Router) {

    }
    // python SCRAP/SCRAP.py -d ~/Documents/experiments -a ~/Documents/experiments/CIMERA-seq_NPCS_Adapters.txt -p yes -f yes -r SCRAP/ -m mmu -g mm10
    ngOnInit(): void {
        this.paramForm = this.fb.group({
            directory: ['/Users/user/Documents/experiments/', Validators.required],
            adapterFile: ['/Users/user/Documents/experiments/CIMERA-seq_NPCS_Adapters.txt', Validators.required],
            pairedEnd: [true, Validators.required],
            preFiltered: [true, Validators.required],
            referenceDir: ['/Users/user/Desktop/Project/SCRAP/', Validators.required],
            miRBase_species_abbr: ['mmu', Validators.required],
            genome_species_abbr: ['mm10', Validators.required]
        });
    }
    submit() {
        this.paramState.setParameters(this.paramForm.value);
        this.router.navigateByUrl("/runner")
    }
    onFileSelected(event: any) {
        const file: any = event.target.files[0];
        const path = file ? file.path : '';
        this.paramForm.patchValue({ adapterFile: path });
    }
}