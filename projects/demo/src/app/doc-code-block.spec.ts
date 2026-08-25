import { TestBed } from '@angular/core/testing';
import { DocCodeBlock } from './doc-code-block';

describe('DocCodeBlock', () => {
  it('renders the code text', () => {
    TestBed.configureTestingModule({ imports: [DocCodeBlock] });
    const fixture = TestBed.createComponent(DocCodeBlock);
    fixture.componentRef.setInput('code', `const x = 1;`);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('code').textContent).toBe('const x = 1;');
  });

  it('omits the header row when no label is given', () => {
    TestBed.configureTestingModule({ imports: [DocCodeBlock] });
    const fixture = TestBed.createComponent(DocCodeBlock);
    fixture.componentRef.setInput('code', 'foo();');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.doc-code-block-header')).toBeNull();
    expect(fixture.nativeElement.querySelector('.doc-code-block-copy')).not.toBeNull();
  });

  it('shows the label in a header row when provided', () => {
    TestBed.configureTestingModule({ imports: [DocCodeBlock] });
    const fixture = TestBed.createComponent(DocCodeBlock);
    fixture.componentRef.setInput('code', 'foo();');
    fixture.componentRef.setInput('label', 'app.config.ts');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.doc-code-block-label')?.textContent).toBe('app.config.ts');
  });

  it('copies the code to the clipboard and transiently shows "copied"', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    TestBed.configureTestingModule({ imports: [DocCodeBlock] });
    const fixture = TestBed.createComponent(DocCodeBlock);
    fixture.componentRef.setInput('code', 'const x = 1;');
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.doc-code-block-copy');
    expect(button.textContent).toBe('copy');

    button.click();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('const x = 1;');
    expect(button.textContent).toBe('copied');

    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(button.textContent).toBe('copy');

    vi.useRealTimers();
  });
});
