import React, { useState, useEffect } from 'react';
import { User, Shield, Key, Trash2, Eye, EyeOff, Lock, CheckSquare, PlusCircle, Edit3, Monitor, Building2, AlertCircle, X } from 'lucide-react';

export default function UsersView({ currentUser }: any) {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  
  // User Form State
  const [newUser, setNewUser] = useState({ 
    id: 0, 
    username: '', 
    pin: '', 
    role: 'Cashier', 
    permissions: ['POS'], 
    branch_id: 'ALL',
    allowed_terminals: 'ALL'
  });
  const [editMode, setEditMode] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Role Form State
  const [newRole, setNewRole] = useState({
    id: 0,
    name: '',
    description: '',
    permissions: ['POS']
  });
  const [roleEditMode, setRoleEditMode] = useState(false);

  // Admin Reset User PIN Modal State
  const [resetPinModalUser, setResetPinModalUser] = useState<any>(null);
  const [adminResetPinInput, setAdminResetPinInput] = useState('');
  const [adminResetPinMsg, setAdminResetPinMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const ALL_SYSTEM_PERMISSIONS = [
    { key: 'POS', label: 'POS Billing', desc: 'Process sales and register billing' },
    { key: 'Custom Items', label: 'Custom Billed Items', desc: 'Create and bill custom priced items on the fly' },
    { key: 'View Invoices', label: 'View Invoices', desc: 'Browse sales records and past invoices' },
    { key: 'Edit Invoices', label: 'Edit Invoices', desc: 'Modify invoice details (Supervisor/Admin)' },
    { key: 'Delete Invoice', label: 'Void / Delete Bill', desc: 'Cancel and delete processed invoices (Admin Only)' },
    { key: 'Refunds', label: 'Issue Refunds', desc: 'Authorize return and exchange transactions' },
    { key: 'Discounts', label: 'Manual Bill Discount', desc: 'Apply custom price reductions on cart' },
    { key: 'Inventory', label: 'Inventory & Stock', desc: 'Products, catalog, and stock adjustments' },
    { key: 'GRN', label: 'GRN & Purchase', desc: 'Receive stock and approve goods received notes' },
    { key: 'Reports', label: 'Sales Reports', desc: 'View financial statements and analytics' },
    { key: 'Customers', label: 'Customers & Credit', desc: 'Manage customer accounts and loyalty' },
    { key: 'Suppliers', label: 'Supplier Management', desc: 'Manage suppliers and purchase orders' },
    { key: 'Vouchers', label: 'Gift Vouchers', desc: 'Issue and redeem promotional vouchers' },
    { key: 'Promotions', label: 'Discounts & Promos', desc: 'Set up marketing promotions and rules' },
    { key: 'Expenses', label: 'Expense Logging', desc: 'Record shop utility and operating expenses' },
    { key: 'Branches', label: 'Multi-Branch & Terminals', desc: 'Configure cloud branches and POS terminals' },
    { key: 'Backup Hub', label: 'Master Server & Backups', desc: 'Configure automatic snapshots and offline backup server' },
    { key: 'Settings', label: 'System Settings', desc: 'Printers, barcodes, and business profile' },
    { key: 'Users', label: 'User & Role Access', desc: 'Manage user credentials and permission policies' }
  ];

  useEffect(() => { 
    loadAllData();
    const handleSync = () => {
      loadAllData();
    };
    // @ts-ignore
    window.ipcRenderer?.on?.('sync-completed', handleSync);
    // @ts-ignore
    window.ipcRenderer?.on?.('sync-data-updated', handleSync);
    return () => {
      // @ts-ignore
      window.ipcRenderer?.off?.('sync-completed', handleSync);
      // @ts-ignore
      window.ipcRenderer?.off?.('sync-data-updated', handleSync);
    };
  }, []);

  const loadAllData = async () => {
    try {
      // @ts-ignore
      const u = await window.ipcRenderer.invoke('get-users') || [];
      setUsers(u);

      // @ts-ignore
      if (window.db?.getBranches) {
        // @ts-ignore
        const b = await window.db.getBranches();
        setBranches(b || []);
      }

      // @ts-ignore
      if (window.db?.getTerminals) {
        // @ts-ignore
        const t = await window.db.getTerminals();
        const DEFAULT_PRESET_TERMINALS = [
          { id: 'TERM-01', name: 'Touch Terminal 01 (Billing Counter 1)', branch_id: 'BR-MAIN' },
          { id: 'TERM-02', name: 'Touch Terminal 02 (Billing Counter 2)', branch_id: 'BR-MAIN' },
          { id: 'TERM-03', name: 'Touch Terminal 03 (Express Counter)', branch_id: 'BR-MAIN' },
          { id: 'TERM-BACKOFFICE', name: 'Back Office PC (Manager Desk)', branch_id: 'BR-MAIN' }
        ];
        const map = new Map<string, any>();
        DEFAULT_PRESET_TERMINALS.forEach(pt => map.set(pt.id, pt));
        (t || []).forEach((item: any) => map.set(item.id, { ...map.get(item.id), ...item }));
        setTerminals(Array.from(map.values()));
      }

      // @ts-ignore
      if (window.db?.getUserRoles) {
        // @ts-ignore
        const r = await window.db.getUserRoles();
        if (r && r.length > 0) {
          setRoles(r);
        } else {
          setRoles([
            { id: 1, name: 'Admin', permissions: JSON.stringify(ALL_SYSTEM_PERMISSIONS.map(p => p.key)), description: 'Full system administrator access' },
            { id: 2, name: 'Manager', permissions: JSON.stringify(['POS', 'Inventory', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Refunds', 'Discounts']), description: 'Branch management and reports' },
            { id: 3, name: 'Supervisor', permissions: JSON.stringify(['POS', 'Reports', 'Customers', 'Vouchers', 'Promotions', 'Refunds', 'Discounts']), description: 'Shift supervisor with discount/refund approval' },
            { id: 4, name: 'Cashier', permissions: JSON.stringify(['POS']), description: 'Front-desk cashier limited to billing' },
            { id: 5, name: 'Inventory Clerk', permissions: JSON.stringify(['Inventory', 'Suppliers', 'GRN']), description: 'Stock keeper handling GRN and inventory' }
          ]);
        }
      }
    } catch (e) {
      console.error('Error loading users/roles:', e);
    }
  };

  const handleRoleChange = (roleName: string) => {
    const matchedRole = roles.find(r => r.name === roleName);
    let perms: string[] = ['POS'];
    if (matchedRole) {
      try {
        perms = typeof matchedRole.permissions === 'string' ? JSON.parse(matchedRole.permissions) : matchedRole.permissions;
      } catch (e) {}
    } else if (roleName === 'Admin') {
      perms = ALL_SYSTEM_PERMISSIONS.map(p => p.key);
    }
    setNewUser({
      ...newUser,
      role: roleName,
      permissions: perms
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Security Alert: Only administrators can create or edit users.');
      return;
    }
    if (!newUser.username || !newUser.pin) return;

    try {
      if (editMode) {
        // @ts-ignore
        await window.ipcRenderer.invoke('update-user', newUser);
        alert(`Staff account "${newUser.username}" updated successfully!`);
      } else {
        // @ts-ignore
        await window.ipcRenderer.invoke('add-user', newUser);
        alert(`Staff account "${newUser.username}" created successfully!`);
      }
      setNewUser({ id: 0, username: '', pin: '', role: 'Cashier', permissions: ['POS'], branch_id: 'ALL', allowed_terminals: 'ALL' });
      setEditMode(false);
      loadAllData();
    } catch (err: any) {
      alert('Error saving staff account: ' + (err.message || err));
    }
  };

  const handleEditUser = (u: any) => {
    if (!isAdmin) {
      alert('Security Alert: Only administrators can modify user accounts.');
      return;
    }
    setNewUser({ 
      id: u.id, 
      username: u.username, 
      pin: u.pin, 
      role: u.role, 
      permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || ['POS']),
      branch_id: u.branch_id || 'ALL',
      allowed_terminals: u.allowed_terminals || 'ALL'
    });
    setEditMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete staff accounts. Managers and Supervisors are not authorized to delete users.');
      return;
    }
    if (username.toLowerCase() === 'admin') {
      alert('The root Administrator account cannot be deleted.');
      return;
    }
    if (confirm(`Are you sure you want to permanently delete user "${username}"?`)) {
      // @ts-ignore
      await window.ipcRenderer.invoke('delete-user', id);
      loadAllData();
    }
  };

  const handleAdminResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can reset staff PINs.');
      return;
    }
    if (!adminResetPinInput || adminResetPinInput.length < 3) {
      setAdminResetPinMsg({ type: 'error', text: 'PIN must be at least 3 digits or characters.' });
      return;
    }

    try {
      // @ts-ignore
      const res = await window.db.adminResetUserPin({
        targetUserId: resetPinModalUser.id,
        newPin: adminResetPinInput
      });
      if (res?.success) {
        setAdminResetPinMsg({ type: 'success', text: `PIN for "${resetPinModalUser.username}" successfully reset!` });
        setTimeout(() => {
          setResetPinModalUser(null);
          setAdminResetPinInput('');
          setAdminResetPinMsg(null);
          loadAllData();
        }, 1200);
      } else {
        setAdminResetPinMsg({ type: 'error', text: res?.error || 'Failed to reset PIN.' });
      }
    } catch (err: any) {
      setAdminResetPinMsg({ type: 'error', text: err?.message || 'Error resetting PIN.' });
    }
  };

  // Role Management Handlers
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Security Alert: Only administrators can manage roles.');
      return;
    }
    if (!newRole.name.trim()) return;

    if (roleEditMode) {
      // @ts-ignore
      await window.db.updateUserRole(newRole);
    } else {
      // @ts-ignore
      await window.db.addUserRole(newRole);
    }

    setNewRole({ id: 0, name: '', description: '', permissions: ['POS'] });
    setRoleEditMode(false);
    loadAllData();
  };

  const handleEditRole = (r: any) => {
    if (!isAdmin) {
      alert('Security Alert: Only administrators can edit roles.');
      return;
    }
    const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || []);
    setNewRole({
      id: r.id,
      name: r.name,
      description: r.description || '',
      permissions: perms
    });
    setRoleEditMode(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRole = async (id: number, roleName: string) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete custom roles. Managers and Supervisors are not authorized.');
      return;
    }
    if (roleName.toLowerCase() === 'admin') {
      alert('The default Admin role cannot be deleted.');
      return;
    }
    if (confirm(`Delete the role "${roleName}"? Users assigned to this role will remain but should be re-assigned.`)) {
      // @ts-ignore
      await window.db.deleteUserRole(id);
      loadAllData();
    }
  };

  // Terminals available for currently selected branch
  const availableTerminalsForBranch = newUser.branch_id === 'ALL'
    ? terminals
    : terminals.filter(t => t.branch_id === newUser.branch_id);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-3xl font-black text-brand-dark tracking-tight flex items-center gap-2">
            <Shield className="text-brand-primary" size={28} />
            User Roles & Terminal Permissions
          </h2>
          <p className="text-sm font-medium text-gray-500 mt-1">
            Configure staff credentials, assign branch and terminal hardware authorization, and define custom role permission policies.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'users'
                ? 'bg-white text-brand-dark shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <User size={16} /> Staff Accounts ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'roles'
                ? 'bg-white text-brand-dark shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Shield size={16} /> Custom Roles ({roles.length})
          </button>
        </div>
      </div>

      {/* Non-Admin Security Notice Banner */}
      {!isAdmin && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
          <AlertCircle className="shrink-0 mt-0.5 text-amber-600" size={20} />
          <div>
            <h4 className="font-black text-sm">Security Restriction Notice</h4>
            <p className="text-xs font-medium text-amber-800 mt-0.5">
              You are currently logged in with role <span className="font-bold underline">{currentUser?.role || 'Non-Admin'}</span>. 
              Only <strong>System Administrators</strong> possess authorization to create, edit, or delete staff accounts, assign branch/terminal access, or modify role permissions. You are viewing this page in read-only mode.
            </p>
          </div>
        </div>
      )}

      {/* TAB 1: USERS & TERMINAL ACCESS */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          
          {/* Admin User Creation / Edit Card */}
          {isAdmin && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-black text-lg text-brand-dark flex items-center gap-2">
                  <User className="text-brand-primary" size={20} />
                  {editMode ? `Editing User: ${newUser.username}` : 'Create New User Account'}
                </h3>
                {editMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false);
                      setNewUser({ id: 0, username: '', pin: '', role: 'Cashier', permissions: ['POS'], branch_id: 'ALL', allowed_terminals: 'ALL' });
                    }}
                    className="text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-xl"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveUser} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Username */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Username *</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="e.g. cashier1"
                      value={newUser.username}
                      onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                      required
                    />
                  </div>

                  {/* Password / PIN */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Login Password / PIN *</label>
                    <div className="relative">
                      <input
                        type={showPin ? "text" : "password"}
                        placeholder="PIN or Password"
                        className="w-full border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 outline-none font-bold text-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                        value={newUser.pin}
                        onChange={e => setNewUser({ ...newUser, pin: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">User Role *</label>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm bg-white focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                      value={newUser.role}
                      onChange={e => handleRoleChange(e.target.value)}
                    >
                      {roles.map(r => (
                        <option key={r.id || r.name} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Branch Assignment */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Allowed Branch *</label>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm bg-white focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                      value={newUser.branch_id || 'ALL'}
                      onChange={e => setNewUser({ ...newUser, branch_id: e.target.value })}
                    >
                      <option value="ALL">🏢 ALL Branches (Any Branch)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Allowed Terminal Authorization */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <Monitor size={16} className="text-emerald-700" />
                      Allowed POS Terminal Hardware (Hardware Lock)
                    </label>
                    <span className="text-[11px] font-semibold text-emerald-700">
                      Restricts user from logging in on any unauthorized POS machine
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <select
                        className="w-full border border-emerald-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm bg-white focus:border-brand-primary"
                        value={newUser.allowed_terminals || 'ALL'}
                        onChange={e => setNewUser({ ...newUser, allowed_terminals: e.target.value })}
                      >
                        <option value="ALL">🟢 ALL Terminals (No Machine Restriction)</option>
                        {availableTerminalsForBranch.map(t => (
                          <option key={t.id} value={t.id}>
                            🖥️ {t.name} ({t.id}) {t.branch_id ? `[${t.branch_id}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="flex-1 border border-emerald-200 rounded-xl px-4 py-2.5 outline-none font-medium text-xs bg-white"
                        placeholder="Or comma-separated IDs (e.g. TERM-01, TERM-02)"
                        value={newUser.allowed_terminals}
                        onChange={e => setNewUser({ ...newUser, allowed_terminals: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setNewUser({ ...newUser, allowed_terminals: 'ALL' })}
                        className="px-3 py-2 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-xl hover:bg-emerald-200 shrink-0"
                      >
                        Set to ALL
                      </button>
                    </div>
                  </div>

                  {/* Quick-Select Terminal Chips */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-emerald-100">
                    <span className="text-[11px] font-bold text-emerald-800 mr-1">Quick Terminals:</span>
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, allowed_terminals: 'ALL' })}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        newUser.allowed_terminals === 'ALL'
                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                          : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      🟢 Any Terminal (ALL)
                    </button>
                    {availableTerminalsForBranch.map(t => {
                      const currentList = (newUser.allowed_terminals || 'ALL').split(',').map(s => s.trim());
                      const isSelected = newUser.allowed_terminals !== 'ALL' && currentList.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (newUser.allowed_terminals === 'ALL') {
                              setNewUser({ ...newUser, allowed_terminals: t.id });
                            } else {
                              const exists = currentList.includes(t.id);
                              let nextList = exists ? currentList.filter(id => id !== t.id) : [...currentList, t.id];
                              if (nextList.length === 0) {
                                setNewUser({ ...newUser, allowed_terminals: 'ALL' });
                              } else {
                                setNewUser({ ...newUser, allowed_terminals: nextList.join(', ') });
                              }
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>🖥️ {t.name}</span>
                          <span className="font-mono text-[10px] opacity-75">[{t.id}]</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Granular Permissions Checklist */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckSquare size={16} className="text-brand-primary" />
                      Granular Module Permissions ({newUser.permissions.length} active)
                    </label>
                    {newUser.role === 'Admin' ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                        Admin role has unrestricted full system access
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const allP = ALL_SYSTEM_PERMISSIONS.map(p => p.key);
                          setNewUser({ ...newUser, permissions: newUser.permissions.length === allP.length ? ['POS'] : allP });
                        }}
                        className="text-xs font-bold text-brand-primary hover:underline"
                      >
                        {newUser.permissions.length === ALL_SYSTEM_PERMISSIONS.length ? 'Clear to POS Only' : 'Select All Permissions'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {ALL_SYSTEM_PERMISSIONS.map(perm => {
                      const isChecked = newUser.role === 'Admin' || newUser.permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 font-bold'
                              : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                            checked={isChecked}
                            disabled={newUser.role === 'Admin'}
                            onChange={e => {
                              if (e.target.checked) {
                                setNewUser({ ...newUser, permissions: [...newUser.permissions, perm.key] });
                              } else {
                                setNewUser({ ...newUser, permissions: newUser.permissions.filter(p => p !== perm.key) });
                              }
                            }}
                          />
                          <div>
                            <div className="font-bold">{perm.label}</div>
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5 line-clamp-1">{perm.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="bg-brand-primary hover:bg-brand-secondary text-white font-black py-3 px-8 rounded-2xl shadow-lg shadow-brand-primary/20 transition-all text-sm"
                  >
                    {editMode ? '💾 Update Staff Account' : '✨ Register New Staff Account'}
                  </button>
                  {editMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setNewUser({ id: 0, username: '', pin: '', role: 'Cashier', permissions: ['POS'], branch_id: 'ALL', allowed_terminals: 'ALL' });
                      }}
                      className="bg-gray-100 text-gray-700 font-bold py-3 px-6 rounded-2xl hover:bg-gray-200 transition-all text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* User Accounts List Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-lg text-brand-dark flex items-center gap-2">
                <User size={20} className="text-brand-primary" />
                Registered POS Staff Accounts ({users.length})
              </h3>
              <span className="text-xs font-bold text-gray-400">
                Live accounts stored locally & synced to cloud
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F8FAF9] text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Assigned Branch</th>
                    <th className="px-6 py-4">Allowed Terminal(s)</th>
                    <th className="px-6 py-4">Module Permissions</th>
                    <th className="px-6 py-4">Security PIN</th>
                    {isAdmin && <th className="px-6 py-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {users.map(u => {
                    const perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions || '[]') : (u.permissions || []);
                    const branchName = u.branch_id === 'ALL' || !u.branch_id
                      ? 'ALL Branches'
                      : (branches.find(b => b.id === u.branch_id)?.name || u.branch_id);
                    const terminalText = u.allowed_terminals === 'ALL' || !u.allowed_terminals
                      ? 'ALL Terminals'
                      : u.allowed_terminals.split(',').map((tid: string) => {
                          const trimmed = tid.trim();
                          const found = terminals.find(t => t.id === trimmed);
                          return found ? `${found.name} [${trimmed}]` : trimmed;
                        }).join(', ');

                    return (
                      <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-black text-brand-dark flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black text-xs">
                              {u.username.substring(0, 2).toUpperCase()}
                            </span>
                            {u.username}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-black ${
                            u.role === 'Admin'
                              ? 'bg-purple-100 text-purple-700'
                              : u.role === 'Manager'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg inline-flex items-center gap-1.5">
                            <Building2 size={13} className="text-slate-500" />
                            {branchName}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-bold px-3 py-1 rounded-lg inline-flex items-center gap-1.5 ${
                            terminalText === 'ALL Terminals'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}>
                            <Monitor size={13} />
                            {terminalText}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {u.role === 'Admin' ? (
                              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                                Unrestricted Access
                              </span>
                            ) : (
                              perms.map((p: string) => (
                                <span key={p} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {p}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-400 text-xs">
                          ••••
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditUser(u)}
                                className="px-2.5 py-1.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 text-xs transition-colors flex items-center gap-1"
                              >
                                <Edit3 size={13} /> Edit
                              </button>
                              <button
                                onClick={() => {
                                  setResetPinModalUser(u);
                                  setAdminResetPinInput('');
                                  setAdminResetPinMsg(null);
                                }}
                                className="px-2.5 py-1.5 bg-amber-50 text-amber-900 border border-amber-200 font-bold rounded-xl hover:bg-amber-100 text-xs transition-colors flex items-center gap-1"
                                title="Reset user PIN"
                              >
                                <Key size={13} className="text-amber-700" /> Reset PIN
                              </button>
                              {u.username.toLowerCase() !== 'admin' && (
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.username)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                  title="Delete user"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOM ROLES & PERMISSION MANAGEMENT */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          
          {/* Admin Role Creation / Edit Form */}
          {isAdmin && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-black text-lg text-brand-dark flex items-center gap-2">
                  <Shield className="text-brand-primary" size={20} />
                  {roleEditMode ? `Editing Role: ${newRole.name}` : 'Create New Custom Role'}
                </h3>
                {roleEditMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setRoleEditMode(false);
                      setNewRole({ id: 0, name: '', description: '', permissions: ['POS'] });
                    }}
                    className="text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-xl"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveRole} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Role Name *</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-brand-primary"
                      placeholder="e.g. Lead Cashier, Shift Supervisor, Store Auditor"
                      value={newRole.name}
                      onChange={e => setNewRole({ ...newRole, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Description</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-medium text-sm focus:border-brand-primary"
                      placeholder="Brief summary of duties and permissions granted"
                      value={newRole.description}
                      onChange={e => setNewRole({ ...newRole, description: e.target.value })}
                    />
                  </div>
                </div>

                {/* Permissions for this role */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckSquare size={16} className="text-brand-primary" />
                      Role Module Permissions ({newRole.permissions.length} granted)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const allP = ALL_SYSTEM_PERMISSIONS.map(p => p.key);
                        setNewRole({ ...newRole, permissions: newRole.permissions.length === allP.length ? ['POS'] : allP });
                      }}
                      className="text-xs font-bold text-brand-primary hover:underline"
                    >
                      {newRole.permissions.length === ALL_SYSTEM_PERMISSIONS.length ? 'Clear to POS Only' : 'Select All'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {ALL_SYSTEM_PERMISSIONS.map(perm => {
                      const isChecked = newRole.permissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 font-bold'
                              : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                            checked={isChecked}
                            onChange={e => {
                              if (e.target.checked) {
                                setNewRole({ ...newRole, permissions: [...newRole.permissions, perm.key] });
                              } else {
                                setNewRole({ ...newRole, permissions: newRole.permissions.filter(p => p !== perm.key) });
                              }
                            }}
                          />
                          <div>
                            <div className="font-bold">{perm.label}</div>
                            <div className="text-[10px] text-gray-400 font-normal mt-0.5 line-clamp-1">{perm.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="bg-brand-primary hover:bg-brand-secondary text-white font-black py-3 px-8 rounded-2xl shadow-lg shadow-brand-primary/20 transition-all text-sm"
                  >
                    {roleEditMode ? '💾 Save Role Changes' : '✨ Create Custom Role'}
                  </button>
                  {roleEditMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setRoleEditMode(false);
                        setNewRole({ id: 0, name: '', description: '', permissions: ['POS'] });
                      }}
                      className="bg-gray-100 text-gray-700 font-bold py-3 px-6 rounded-2xl hover:bg-gray-200 transition-all text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Roles Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-lg text-brand-dark flex items-center gap-2">
                <Shield size={20} className="text-brand-primary" />
                Available System Roles ({roles.length})
              </h3>
              <span className="text-xs font-bold text-gray-400">
                Determines operational access rights when assigned to staff
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F8FAF9] text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Role Name</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Granted Permissions</th>
                    {isAdmin && <th className="px-6 py-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {roles.map(r => {
                    const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions || '[]') : (r.permissions || []);
                    const isSystemAdminRole = r.name.toLowerCase() === 'admin';

                    return (
                      <tr key={r.id || r.name} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1.5 rounded-xl text-xs font-black inline-block ${
                            isSystemAdminRole
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {r.name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-600 max-w-sm">
                          {r.description || 'Custom staff role'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {isSystemAdminRole ? (
                              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                                Full System Permissions (All Modules)
                              </span>
                            ) : (
                              perms.map((p: string) => (
                                <span key={p} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {p}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditRole(r)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 text-xs transition-colors flex items-center gap-1"
                              >
                                <Edit3 size={13} /> Edit
                              </button>
                              {!isSystemAdminRole && (
                                <button
                                  onClick={() => handleDeleteRole(r.id, r.name)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                  title="Delete role"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Admin Reset PIN Modal */}
      {resetPinModalUser && (
        <div className="fixed inset-0 bg-brand-dark/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Key size={18} />
                </div>
                <div>
                  <h3 className="font-black text-brand-dark text-base">Reset User PIN</h3>
                  <p className="text-[11px] text-gray-500 font-medium">{resetPinModalUser.username} • {resetPinModalUser.role}</p>
                </div>
              </div>
              <button
                onClick={() => setResetPinModalUser(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            {adminResetPinMsg && (
              <div className={`p-3 rounded-xl text-xs font-bold mb-4 flex items-center gap-2 ${
                adminResetPinMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                <span>{adminResetPinMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleAdminResetPin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">New PIN / Password *</label>
                <input
                  type="password"
                  placeholder="Enter new PIN (min 3 digits)"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 outline-none font-bold text-sm focus:border-brand-primary"
                  value={adminResetPinInput}
                  onChange={e => setAdminResetPinInput(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-[10px] text-gray-400 font-medium mt-1">
                  The user will immediately use this new PIN to sign in on their assigned terminals.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPinModalUser(null)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-md shadow-amber-500/30"
                >
                  Save New PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
