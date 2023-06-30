import { Component, OnInit } from "@angular/core";
import { firstValueFrom, tap } from "rxjs";
import { FileService } from "src/app/service/file.service";
import { ParamStateService } from "src/app/service/param-state.service";
import * as path from "path";
import { ChildProcessService } from "ngx-childprocess";

@Component({
    selector: 'runner-comp',
    templateUrl: './runner.component.html',
    styleUrls: ['./runner.component.scss']
})
export class RunnerComponent implements OnInit {
    params !: any;
    samples !: any[];
    fs: any;
    steps = [
        { name: "Quality Control (FastQC)", status: "completed" },
        { name: "Quality Control (MultiQC)", status: "pending" },
        { name: "Combine Paired-End Reads (FLASH)", status: "pending" },

    ];
    constructor(private paramStateService: ParamStateService, private fileService: FileService, private childProcessService: ChildProcessService) {
        this.fs = this.fileService.fs
    }
    ngOnInit(): void {
        this.runPipeline();
    }
    async runPipeline() {
        await firstValueFrom(this.paramStateService.getParameters().pipe(
            tap(data => this.params = data)
        ));
        await this.readAdapterFile();
        // await this.fastqc();
        // await this.multiqc();
        // this.setupSummaryFile();
        Promise.all(this.samples.map(sample => this.sampleWorker(sample))).then();
    }
    checkDirectoryExists(directory: any) {
        if (!this.fs.existsSync(directory)) {
            this.fs.mkdirSync(directory);
            console.log('Directory created successfully');
        }
        else {
            console.log('Directory already exists');
        }
    }
    async readAdapterFile() {
        return new Promise(async (resolve, reject) => {
            try {
                const path = this.params.adapterFile;
                const fileContent = await this.fs.promises.readFile(path, 'utf-8');
                const list = fileContent.split("\n").filter((item: any) => item !== "").map((item: any) => {
                    const columns = item.split("\t");
                    return {
                        sampleId: columns[0],
                        fivePrimeAdapter: columns[1],
                        threePrimeAdapter: columns[2],
                        fivePrimeBarcode: columns[3],
                        threePrimeBarcode: columns[4]
                    }
                });
                list.shift();
                this.samples = list;
                resolve(true);
                console.log(this.samples);
            }
            catch (error) {
                console.error(error);
                reject();
            }
        });
    }
    runCommand(command: any) {
        return new Promise(async (resolve, reject) => {
            this.childProcessService.childProcess.exec(command, [], (err: any, stdout: any, stderr: any) => {
                if (stdout) {
                    resolve(true);
                }
                else reject();
            });
        })
    }
    fastqc() {
        return new Promise(async (resolve, reject) => {
            const fastqcPath = path.join(this.params.directory, 'FastQC_Reports');
            this.checkDirectoryExists(fastqcPath);
            const commandList = [];
            for (let sample of this.samples.map(items => items.sampleId)) {
                const fileNames = await this.fs.promises.readdir(`${this.params.directory}/${sample}`);
                const files = fileNames.filter((file: any) => file.includes('.fastq.'))
                    .map((file: any) => path.join(this.params.directory, sample, file))
                    .join(' ');
                const command = `fastqc ${files} -o ${fastqcPath} -t 2`;
                commandList.push(command);
            }
            Promise.all(commandList.map(command => this.runCommand(command))).then((result) => {
                this.steps[0].status = 'completed';
                resolve(true);
            });
        })

    }
    multiqc() {
        return new Promise(async (resolve, reject) => {
            const fastqcPath = path.join(this.params.directory, 'FastQC_Reports');
            const multiqcPath = path.join(this.params.directory, 'MultiQC_Report');
            this.checkDirectoryExists(multiqcPath);
            // 'multiqc', fastqc_report_folder,  '-o', multiqc_report_folder]
            const command = `multiqc ${fastqcPath} -o ${multiqcPath}`;
            console.log("command: ", command);
            this.childProcessService.childProcess.exec(command, [], (err: any, stdout: any, stderr: any) => {
                if (stdout) {
                    resolve(true);
                }
                else reject();
            });

        });
    }
    async setupSummaryFile() {
        for (let sample of this.samples) {
            const summaryTxtPath = path.join(this.params.directory, sample.sampleId, sample.sampleId + '.summary.txt');
            if (this.fs.existsSync(summaryTxtPath)) {
                await this.fs.promises.rm(summaryTxtPath)
            }
            const line1 = `${sample.sampleId}\n`;
            const line2 = `5'-${sample.fivePrimeAdapter}${sample.fivePrimeBarcode}...sncRNA-targetRNA...${sample.threePrimeAdapter}${sample.threePrimeBarcode}\n`;
            const line3 = `miRBase Species Abbreviation: ${this.params.miRBase_species_abbr}\n`;
            const line4 = `Genome Species Abbreviation: ${this.params.genome_species_abbr}\n`;
            const line5 = `Start: ${new Date()}\n`;
            this.fs.promises.writeFile(summaryTxtPath, [line1, line2, line3, line4, line5].join(''));
        }
    }
    sampleWorker(sample: any) {
        return new Promise(async (resolve, reject) => {
            await this.countReads(sample);
        })
    }
    countReads(sample: any) {
        return new Promise(async (resolve, reject) => {
            const fileNames = await this.fs.promises.readdir(`${this.params.directory}/${sample}`);
            const files = fileNames.filter((file: any) => file.includes('.fastq.'));
            Promise.all(files.map((file: any) => this.countReadsHelper(file))).then(result => resolve(true));
        })
    }
    countReadsHelper(zipfile: any) {
        return new Promise(async (resolve, reject) => {
     
        });
    }
}