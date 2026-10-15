import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
test('folder picker uses native Explorer dialog with fixed script and cancellation',async()=>{
 const text=await readFile('apps/host/src/projects/folder-picker.ts','utf8');
 assert.ok(text.includes('DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7'));
 assert.ok(text.includes('0x20u | 0x40u | 0x800u'));
 assert.ok(text.includes('0x800704C7'));
 assert.ok(text.includes('SIGDN_FILESYSPATH'));
 assert.ok(text.includes('Marshal.FreeCoTaskMem'));
 assert.ok(text.includes('FolderPickerDesktop]::CanShow()'));
 assert.ok(text.includes("'-STA','-EncodedCommand'"));
 assert.ok(!text.includes('FolderBrowserDialog'));
 assert.ok(!text.includes('${'));
});
test('copied Windows directory paths normalize without evaluating shell text',async()=>{
 const source=await readFile('apps/ui/src/projectDirectory.ts','utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 const {normalizeProjectDirectory:n}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 assert.equal(n('  "C:\\项目 文件夹\\app"  '),'C:\\项目 文件夹\\app');
 assert.equal(n('C:\\site'),'C:\\site');
 assert.equal(n('"\\\\server\\share\\app"'),'\\\\server\\share\\app');
 assert.equal(n('$(do-not-execute)'),'$(do-not-execute)');
});
