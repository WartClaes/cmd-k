import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NgxCmdk } from './ngx-cmdk';

describe('NgxCmdk', () => {
  let component: NgxCmdk;
  let fixture: ComponentFixture<NgxCmdk>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgxCmdk],
    }).compileComponents();

    fixture = TestBed.createComponent(NgxCmdk);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
