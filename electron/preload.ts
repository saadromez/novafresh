import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  sendSync(channel: string, ...args: any[]) {
    return ipcRenderer.sendSync(channel, ...args)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('db', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  getProducts: () => ipcRenderer.invoke('get-products'),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  addProduct: (product: any) => ipcRenderer.invoke('add-product', product),
  checkout: (data: any) => ipcRenderer.invoke('checkout', data),
  getActiveSession: (terminalId?: string) => ipcRenderer.invoke('get-active-session', terminalId),
  openSession: (payload: any) => ipcRenderer.invoke('open-session', payload),
  closeSession: (data: any) => ipcRenderer.invoke('close-session', data),
  getSuppliers: () => ipcRenderer.invoke('get-suppliers'),
  addSupplier: (supplier: any) => ipcRenderer.invoke('add-supplier', supplier),
  getPOs: () => ipcRenderer.invoke('get-pos'),
  createPO: (supplierId: number) => ipcRenderer.invoke('create-po', supplierId),
  getPromotions: () => ipcRenderer.invoke('get-promotions'),
  addPromotion: (promo: any) => ipcRenderer.invoke('add-promotion', promo),
  getInvoices: () => ipcRenderer.invoke('get-invoices'),
  getVariants: (productId: number) => ipcRenderer.invoke('get-variants', productId),
  addVariant: (variant: any) => ipcRenderer.invoke('add-variant', variant),
  updateVariantStock: (data: any) => ipcRenderer.invoke('update-variant-stock', data),
  getCustomers: () => ipcRenderer.invoke('get-customers'),
  addCustomer: (customer: any) => ipcRenderer.invoke('add-customer', customer),
  getBatches: () => ipcRenderer.invoke('get-batches'),
  addBatch: (batch: any) => ipcRenderer.invoke('add-batch', batch),
  login: (credentials: any) => ipcRenderer.invoke('login', credentials),
  getUsers: () => ipcRenderer.invoke('get-users'),
  addUser: (user: any) => ipcRenderer.invoke('add-user', user),
  updateUser: (user: any) => ipcRenderer.invoke('update-user', user),
  deleteUser: (id: number) => ipcRenderer.invoke('delete-user', id),
  getAllSessions: () => ipcRenderer.invoke('get-all-sessions'),
  deleteSession: (id: number) => ipcRenderer.invoke('delete-session', id),
  deletePO: (id: number) => ipcRenderer.invoke('delete-po', id),
  getGRNs: () => ipcRenderer.invoke('get-grns'),
  deleteGRN: (id: number) => ipcRenderer.invoke('delete-grn', id),
  updatePOStatus: (data: any) => ipcRenderer.invoke('update-po-status', data),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  getSyncLogs: () => ipcRenderer.invoke('get-sync-logs'),
  getTerminalConfig: () => ipcRenderer.invoke('get-terminal-config'),
  setTerminalConfig: (data: any) => ipcRenderer.invoke('set-terminal-config', data),
  getBranches: () => ipcRenderer.invoke('get-branches'),
  createBranch: (branch: any) => ipcRenderer.invoke('create-branch', branch),
  getTerminals: (branchId?: string) => ipcRenderer.invoke('get-terminals', branchId),
  createTerminal: (term: any) => ipcRenderer.invoke('create-terminal', term),
  updateTerminal: (term: any) => ipcRenderer.invoke('update-terminal', term),
  deleteTerminal: (terminalId: string) => ipcRenderer.invoke('delete-terminal', terminalId),
  getBackofficeOverview: () => ipcRenderer.invoke('get-backoffice-overview'),
  logTerminalActivity: (data: any) => ipcRenderer.invoke('log-terminal-activity', data),
  holdBill: (data: any) => ipcRenderer.invoke('hold-bill', data),
  getHeldBills: () => ipcRenderer.invoke('get-held-bills'),
  deleteHeldBill: (id: any) => ipcRenderer.invoke('delete-held-bill', id),
  clearAllHeldBills: () => ipcRenderer.invoke('clear-all-held-bills'),
  getUserRoles: () => ipcRenderer.invoke('get-user-roles'),
  addUserRole: (role: any) => ipcRenderer.invoke('add-user-role', role),
  updateUserRole: (role: any) => ipcRenderer.invoke('update-user-role', role),
  deleteUserRole: (id: number) => ipcRenderer.invoke('delete-user-role', id),
  getBackupHubInfo: () => ipcRenderer.invoke('get-backup-hub-info'),
  createLocalBackup: (options?: any) => ipcRenderer.invoke('create-local-backup', options),
  getLocalBackups: () => ipcRenderer.invoke('get-local-backups'),
  restoreLocalBackup: (backupPath: string) => ipcRenderer.invoke('restore-local-backup', backupPath),
  deleteLocalBackup: (backupPath: string) => ipcRenderer.invoke('delete-local-backup', backupPath),
  chooseBackupDirectory: () => ipcRenderer.invoke('choose-backup-directory'),
  chooseBackupFileToRestore: () => ipcRenderer.invoke('choose-backup-file-to-restore'),
  getCustomBillItems: () => ipcRenderer.invoke('get-custom-bill-items'),
  getTerminalDetails: (terminalId: string) => ipcRenderer.invoke('get-terminal-details', terminalId),
  getTerminalInvoices: (filter?: any) => ipcRenderer.invoke('get-terminal-invoices', filter),
  verifyPin: (data?: any) => ipcRenderer.invoke('verify-pin', data),
  recordShiftHandover: (data: any) => ipcRenderer.invoke('record-shift-handover', data),
  getShiftHandovers: (filter?: any) => ipcRenderer.invoke('get-shift-handovers', filter),
  getCashierShiftSummary: (data: any) => ipcRenderer.invoke('get-cashier-shift-summary', data),
  getAutoBackupConfig: () => ipcRenderer.invoke('get-auto-backup-config'),
  setAutoBackupConfig: (cfg: any) => ipcRenderer.invoke('set-auto-backup-config', cfg),
  changeOwnPin: (data: any) => ipcRenderer.invoke('change-own-pin', data),
  adminResetUserPin: (data: any) => ipcRenderer.invoke('admin-reset-user-pin', data),
  updateInvoice: (data: any) => ipcRenderer.invoke('update-invoice', data),
  deleteInvoice: (payload: any) => ipcRenderer.invoke('delete-invoice', payload),
  getDeviceMode: () => ipcRenderer.invoke('get-device-mode'),
  setDeviceMode: (mode: string) => ipcRenderer.invoke('set-device-mode', mode),
  getServerStats: () => ipcRenderer.invoke('get-server-stats'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdateNow: () => ipcRenderer.invoke('install-update-now'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  verifyAdminAuth: (data: any) => ipcRenderer.invoke('verify-admin-auth', data),
  auditShiftActualCash: (data: any) => ipcRenderer.invoke('audit-shift-actual-cash', data)
})

