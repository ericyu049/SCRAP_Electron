import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app-routing.module';
import { RunnerComponent } from './component/runner/runner.component';
import { HomeComponent } from './component/home/home.component';
import { MaterialModule } from './material.module';
import { ParamStateService } from './service/param-state.service';
import { FileService } from './service/file.service';
import { ChildProcessService } from 'ngx-childprocess';

@NgModule({
	declarations: [
		AppComponent,
		HomeComponent,
		RunnerComponent
	],
	imports: [
		BrowserModule,
		BrowserAnimationsModule,
		AppRoutingModule,
		MaterialModule
	],
	providers: [
		ParamStateService,
		FileService,
		ChildProcessService
	],
	bootstrap: [AppComponent]
})
export class AppModule { }
