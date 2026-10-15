import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
// Fixed script: no path or webpage input is evaluated as PowerShell code.
const script=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FolderPickerDesktop {
  [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint threadId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder text, int count, out int needed);
  static string Name(IntPtr handle) { var text=new StringBuilder(256); int needed; return GetUserObjectInformation(handle,2,text,512,out needed)?text.ToString():""; }
  public static bool CanShow() {
    var input=OpenInputDesktop(0,false,1); if(input==IntPtr.Zero)return false;
    try { var current=Name(GetThreadDesktop(GetCurrentThreadId())); return current.Length>0&&current==Name(input); }
    finally { CloseDesktop(input); }
  }
}
// IModalWindow + IFileDialog vtable, in native declaration order.
[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFolderFileDialog {
  [PreserveSig] int Show(IntPtr owner);
  void SetFileTypes(uint count, IntPtr filters);
  void SetFileTypeIndex(uint index);
  void GetFileTypeIndex(out uint index);
  void Advise(IntPtr events, out uint cookie);
  void Unadvise(uint cookie);
  void SetOptions(uint options);
  void GetOptions(out uint options);
  void SetDefaultFolder(IntPtr item);
  void SetFolder(IntPtr item);
  void GetFolder(out IntPtr item);
  void GetCurrentSelection(out IntPtr item);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
  void GetFileName(out IntPtr name);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
  void GetResult(out IFolderShellItem item);
  void AddPlace(IntPtr item, uint location);
  void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
  void Close(int result);
  void SetClientGuid(ref Guid guid);
  void ClearClientData();
  void SetFilter(IntPtr filter);
}
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFolderShellItem {
  void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
  void GetParent(out IFolderShellItem parent);
  void GetDisplayName(uint kind, out IntPtr name);
  void GetAttributes(uint mask, out uint attributes);
  void Compare(IFolderShellItem other, uint hint, out int order);
}
public class ModernFolderPicker {
  public static string Pick(IntPtr owner) {
    var dialog=(IFolderFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
    IFolderShellItem item=null; IntPtr name=IntPtr.Zero;
    try {
      uint options; dialog.GetOptions(out options);
      // PICKFOLDERS | FORCEFILESYSTEM | PATHMUSTEXIST | NOCHANGEDIR | DONTADDTORECENT
      dialog.SetOptions(options | 0x20u | 0x40u | 0x800u | 0x8u | 0x02000000u);
      dialog.SetTitle("选择项目文件夹（可在地址栏粘贴路径）");
      dialog.SetOkButtonLabel("选择文件夹");
      int result=dialog.Show(owner);
      if(result==unchecked((int)0x800704C7))return null; // User cancelled.
      Marshal.ThrowExceptionForHR(result);
      dialog.GetResult(out item);
      item.GetDisplayName(0x80058000u,out name); // SIGDN_FILESYSPATH
      return Marshal.PtrToStringUni(name);
    } finally {
      if(name!=IntPtr.Zero)Marshal.FreeCoTaskMem(name);
      if(item!=null)Marshal.FinalReleaseComObject(item);
      Marshal.FinalReleaseComObject(dialog);
    }
  }
}
'@
if(-not [FolderPickerDesktop]::CanShow()){throw 'Interactive desktop unavailable'}
Add-Type -AssemblyName System.Windows.Forms
$owner=New-Object System.Windows.Forms.Form
$owner.TopMost=$true
$owner.ShowInTaskbar=$false
$owner.StartPosition='CenterScreen'
$owner.Opacity=0
try {
  $owner.Show()
  $owner.Activate()
  $selected=[ModernFolderPicker]::Pick($owner.Handle)
  if($selected) { [Console]::Write($selected) }
} finally { $owner.Dispose() }`;
export async function pickProjectDirectory(signal?:AbortSignal):Promise<string|null>{
  if(process.platform!=='win32')throw new Error('FOLDER_PICKER_UNAVAILABLE');
  try{const result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{signal,windowsHide:true,timeout:120000,maxBuffer:32768,encoding:'utf8'});return result.stdout.trim()||null;}
  catch{if(signal?.aborted)return null;throw new Error('FOLDER_PICKER_UNAVAILABLE');}
}
