window.USB_PHASE2_SAMPLE_FILES = [
  {
    "name": "phase2-windows-events.csv",
    "content": "Date and Time,Source,Event ID,Channel,Computer,DeviceId,EventRecordID\n2026-01-15T10:00:00.123456789Z,Microsoft-Windows-Security-Auditing,6416,Security,LAB-PC-01,USBSTOR\\Disk&Ven_Demo&Prod_Storage\\DEMO001,42\n2026-01-15T10:08:00Z,Microsoft-Windows-Security-Auditing,6416,Security,LAB-PC-01,USBSTOR\\Disk&Ven_Demo&Prod_Storage\\DEMO001,43\n"
  },
  {
    "name": "phase2-setupapi.log",
    "content": ">>>  [Device Install (Hardware initiated) - USBSTOR\\Disk&Ven_Demo&Prod_Storage\\DEMO001]\n>>>  Section start 2026/01/15 10:04:00.000\n     dvi:      {DIF_INSTALLDEVICE}\n<<<  Section end 2026/01/15 10:04:01.000\n<<<  [Exit status: SUCCESS]\n"
  },
  {
    "name": "phase2-usbstor.reg",
    "content": "Windows Registry Editor Version 5.00\n\n[HKEY_LOCAL_MACHINE\\SYSTEM\\ControlSet001\\Enum\\USBSTOR\\Disk&Ven_Demo&Prod_Storage\\DEMO001]\n\"FriendlyName\"=\"Fictional demonstration drive\"\n"
  }
];
