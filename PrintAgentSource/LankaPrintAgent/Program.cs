using System.Windows.Forms;

System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);
Application.Run(new LunaPOSPrintAgent.TrayApp());
