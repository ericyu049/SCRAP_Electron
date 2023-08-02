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
    checkDirectoryExists(directory: any) {
        if (!this.fs.existsSync(directory)) {
            this.fs.mkdirSync(directory);
            console.log('Directory created successfully');
        }
        else {
            console.log('Directory already exists');
        }
    }
    readAdapterFile() {
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
                    resolve(stdout);
                }
                else {
                    console.log(stderr);
                    reject()
                }
            });
        })
    }
    fastqc() {
        return new Promise(async (resolve, reject) => {
            const fastqcPath = path.join(this.params.directory, 'FastQC_Reports');
            this.checkDirectoryExists(fastqcPath);
            const commandList = [];
            for (let sample of this.samples.map(items => items.sampleId)) {
                const fileNames = await this.fs.promises.readdir(`${this.params.directory}/${sample.sampleId}`);
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
    countInitialReads(sample: any) {
        return new Promise(async (resolve, reject) => {
            const fileNames = await this.fs.promises.readdir(`${this.params.directory}/${sample.sampleId}`);
            const files = fileNames.filter((file: any) => file.includes('.fastq.'));
            Promise.all(files.map((file: any) => this.countReadsHelper(sample, file, 4, `${file} raw reads:`, true))).then(result => {
                resolve(true)
            });
        })
    }
    countReadsHelper(sample: any, file: any, num: any, message: any, isZip: boolean) {
        return new Promise(async (resolve, reject) => {
            const filePath = path.join(this.params.directory, sample.sampleId, file);
            const command = isZip ? `python3 ${this.params.referenceDir}bin/countReadsZip.py ${filePath} ${num}` : `python3 ${this.params.referenceDir}bin/countReads.py ${filePath} ${num}`;
            const num_reads = await this.runCommand(command);
            const summaryTxtPath = path.join(this.params.directory, sample.sampleId, sample.sampleId + '.summary.txt');
            this.fs.promises.appendFile(summaryTxtPath, `${message} ${num_reads}`);
            resolve(true);
        });
    }

    combinePairedEndReads(sample: any) {
        return new Promise(async (resolve, reject) => {
            const flash_path = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}_FLASH`)
            this.checkDirectoryExists(flash_path);

            const r1 = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}_R1.fastq.gz`);
            const r2 = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}_R2.fastq.gz`);
            const command = ['flash', '-O', '-d', flash_path, '-o', sample, '-M', '150', '-m', '6', '-z', r1, r2].join(' ')
            this.childProcessService.childProcess.exec(command, [], async (err: any, stdout: any, stderr: any) => {
                if (stdout) {
                    const flashLogPath = path.join(flash_path, `FLASH_${sample.sampleId}.log`)
                    if (this.fs.existsSync(flashLogPath)) {
                        await this.fs.promises.rm(flashLogPath)
                    }
                    this.fs.promises.writeFile(flashLogPath, stdout);

                    this.fs.promises.rename(path.join(flash_path, `${sample.sampleId}.extendedFrags.fasq.gz`),
                        path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.fastq.gz`));
                    resolve(true);
                }
                else reject();
            });
        })
    }
    primeAdapterFilter(sample: any, flag: any) {
        return new Promise(async (resolve, reject) => {
            const output = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.fastq.gz`);
            const json = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.${flag}adapter.json`);
            const tmp = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.tmp.fastq.gz`);
            const command = `cutadapt -g ${flag === 5 ? sample.fivePrimeAdapter : sample.threePrimeAdapter} -q 30 -m 30 -n 2 -o ${output} --json ${json} ${tmp}`;
            await this.runCommand(command);
            resolve(true);
        })

    }
    primeBarcodeFilter(sample: any, flag: any) {
        return new Promise(async (resolve, reject) => {
            const output = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.barcoded.fasta`);
            const json = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.${flag}barcode.json`);
            const tmp = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.fasta`);
            const command = `cutadapt -g ${flag === 5 ? sample.fivePrimeBarcode : sample.threePrimeBarcode} -m 30 -o ${output} --json=${json} ${tmp}`;
            await this.runCommand(command);
            resolve(true);
        })

    }
    removeDuplicateReads(sample: any) {
        return new Promise(async (resolve, reject) => {
            const input_file = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.fastq.gz`);
            const output_file = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.fastq`);
            const command = `python3 ${this.params.referenceDir}bin/removeDuplicateReads.py ${input_file} ${output_file}`
            await this.runCommand(command);
            resolve(true);
        });
    }
    blast(sample: any) {
        return new Promise(async (resolve, reject) => {
            const db = path.join(this.params.reference_directory, 'fasta', this.params.miRBase_species_abbr, `sncRNA_${this.params.miRBase_species_abbr}.fasta`);
            const query = path.join(this.params.directory, sample, `${sample}.cutadapt.deduped.barcoded.fasta`);
            const out = path.join(this.params.directory, sample, `${sample}.cutadapt.deduped.barcoded.blast`);
            const command = `blastn -db ${db} -query ${query} -out ${out} -word_size 11 -outfmt 6 -num_threads 8 -strand plus`;
            await this.runCommand(command);
            resolve(true);
        })
    }
    async runPipeline() {
        await firstValueFrom(this.paramStateService.getParameters().pipe(
            tap(data => this.params = data)
        ));
        await this.readAdapterFile();
        // await this.fastqc();
        // await this.multiqc();
        this.setupSummaryFile();
        Promise.all(this.samples.map(sample => this.sampleWorker(sample))).then();
    }
    filterBlast(sample: any) {
        return new Promise(async (resolve, reject) => {
            const input_file = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.barcoded.blast`);
            const output_file = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.sncrnaidentified.blast`);
            const command = `python3 ${this.params.referenceDir}bin/filterBlast.py ${input_file} ${output_file}`
            await this.runCommand(command);
            await this.fs.promises.unlink(input_file);

            resolve(true);
        });
    }
    makeTabular(sample: any) {
        return new Promise(async(resolve, reject) => {
            const inputFile = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.barcoded.fasta`);
            const outputFile = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.barcoded.tab`);
            try {
                const data = await this.fs.promises.readFile(inputFile, 'utf8');
                const lines = data.trim().split('>');
                const outputData = lines
                    .slice(1)
                    .map((line: any) => {
                        const [seqId, sequence] = line.split('\n', 2);
                        return [seqId, sequence.replace(/\n/g, '')].join('\t');
                    })
                    .join('\n');
        
                await this.fs.promises.writeFile(outputFile, outputData, 'utf8');
                await this.fs.promises.unlink(inputFile);
                resolve(true);
            } catch (err) {
                console.error('Error:', err);
                reject();
            }
        })
    }
    sampleWorker(sample: any) {
        return new Promise(async (resolve, reject) => {
            await this.countInitialReads(sample);
            if (this.params.pairedEnd) {
                await this.combinePairedEndReads(sample);
                // count reads again.
                await this.countReadsHelper(sample, path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.fastq.gz`), 4, `${sample.sampleId} combined paired-end reads:`, true);
                this.fs.promises.copyFile(path.join(this.params.directory, sample.sampleid, `${sample.sampleId}.fastq.gz`),
                    path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.tmp.fastq.gz`));
            }
            if (sample.fivePrimeAdapter) {
                await this.primeAdapterFilter(sample, 5);
            }
            if (sample.threePrimeAdapter) {
                await this.primeAdapterFilter(sample, 3);
            }

            const adapterSrc = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.fastq.gz`);
            const adapterDest = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.tmp.fastq.gz`);
            await this.fs.promises.rename(adapterSrc, adapterDest);

            await this.countReadsHelper(sample, path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.fastq`), 4, `${sample.sampleId} reads following unbarcoded adapter removal: `, false);

            await this.removeDuplicateReads(sample);

            await this.countReadsHelper(sample, path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.fasta`), 2, `${sample.sampleId} reads following unbarcoded adapter removal: `, false);

            if (sample.fivePrimeBarcode) {
                await this.primeBarcodeFilter(sample, 5);
            }
            if (sample.threePrimeBarcode) {
                await this.primeBarcodeFilter(sample, 3);
            }
            const barcodeSrc = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.barcoded.fasta`);
            const barcodeDest = path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.fasta`);
            await this.fs.promises.rename(barcodeSrc, barcodeDest);

            await this.countReadsHelper(sample, path.join(this.params.directory, sample.sampleId, `${sample.sampleId}.cutadapt.deduped.barcoded.fasta`), 2, `${sample.sampleId} reads following barcode removal: `, false);

            await this.filterBlast(sample);

        })
    }
}