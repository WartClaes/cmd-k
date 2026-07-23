import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);
}
