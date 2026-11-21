import React, { useState, useEffect } from 'react';
import { Users, Briefcase, Trash2 } from 'lucide-react';

export default function StaffView({ currentUser }: any) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [newEmp, setNewEmp] = useState({ id: 0, name: '', nic: '', phone: '', basic_salary: 0 });
  const [editMode, setEditMode] = useState(false);
  const [settings, setSettings] = useState<any>({});

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  useEffect(() => { 
    loadEmployees(); 
    // @ts-ignore
    window.ipcRenderer.invoke('get-settings').then(setSettings); 
  }, []);

  const loadEmployees = async () => {
    // @ts-ignore
    setEmployees(await window.ipcRenderer.invoke('get-employees') || []);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmp.name) return;
    if (editMode) {
      // @ts-ignore
      await window.ipcRenderer.invoke('update-employee', newEmp);
    } else {
      // @ts-ignore
      await window.ipcRenderer.invoke('add-employee', newEmp);
    }
    setNewEmp({ id: 0, name: '', nic: '', phone: '', basic_salary: 0 });
    setEditMode(false);
    loadEmployees();
  };

  const handleEdit = (emp: any) => {
    setNewEmp({ id: emp.id, name: emp.name, nic: emp.nic, phone: emp.phone, basic_salary: emp.basic_salary });
    setEditMode(true);
  };

  const handleDelete = async (id: number) => {
    if (!isAdmin) {
      alert('Security Restriction: Only System Administrators can delete records. Managers and other users are not authorized.');
      return;
    }
    if (confirm('Delete this employee?')) {
      // @ts-ignore
      await window.ipcRenderer.invoke('delete-employee', id);
      loadEmployees();
    }
  };

  const [slipStaff, setSlipStaff] = useState<any>(null);
  const [slip, setSlip] = useState({ month: '', basicSalary: '', transport: '', mobile: '', extras: [] as any[], deductions: [] as any[] });
  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col relative h-full overflow-y-auto">
      <h2 className="text-2xl font-black text-brand-dark mb-6 shrink-0">Staff & Payroll</h2>
      
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8 shrink-0">
        <h3 className="font-bold text-lg mb-4 flex items-center"><Briefcase className="mr-2" /> Add New Employee</h3>
        <form onSubmit={handleAdd} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Full Name</label>
            <input type="text" className="w-full border rounded-xl px-4 py-2 outline-none" value={newEmp.name} onChange={e=>setNewEmp({...newEmp, name: e.target.value})} required />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">NIC</label>
            <input type="text" className="w-full border rounded-xl px-4 py-2 outline-none" value={newEmp.nic} onChange={e=>setNewEmp({...newEmp, nic: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Phone</label>
            <input type="text" className="w-full border rounded-xl px-4 py-2 outline-none" value={newEmp.phone} onChange={e=>setNewEmp({...newEmp, phone: e.target.value})} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-1">Basic Salary (Rs)</label>
            <input type="number" className="w-full border rounded-xl px-4 py-2 outline-none" value={newEmp.basic_salary || ''} onChange={e=>setNewEmp({...newEmp, basic_salary: Number(e.target.value)})} />
          </div>
          <button type="submit" className="bg-amber-500 text-white font-bold py-2 px-6 rounded-xl hover:bg-amber-600">{editMode ? 'Update' : 'Add Staff'}</button>
          {editMode && <button type="button" onClick={() => { setEditMode(false); setNewEmp({ id: 0, name: '', nic: '', phone: '', basic_salary: 0 }); }} className="bg-gray-200 text-gray-700 font-bold py-2 px-6 rounded-xl hover:bg-gray-300">Cancel</button>}
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden shrink-0">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-500 text-sm font-bold border-b border-gray-200">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">NIC</th>
              <th className="px-6 py-4">Phone</th>
              <th className="px-6 py-4">Base Salary</th>
              <th className="px-6 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {employees.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-bold">{e.name}</td>
                <td className="px-6 py-4 text-gray-500">{e.nic || '-'}</td>
                <td className="px-6 py-4 text-gray-500">{e.phone || '-'}</td>
                <td className="px-6 py-4 font-bold">Rs. {(e.basic_salary || 0).toLocaleString()}</td>
                <td className="px-6 py-4 text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => { setSlipStaff(e); setSlip({ month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }), basicSalary: String(e.basic_salary || 0), transport: '', mobile: '', extras: [], deductions: [] }); }} className="px-3 py-1 bg-brand-primary text-white text-xs font-bold rounded-lg hover:bg-brand-secondary">Salary Slip</button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(e.id)} title="Delete Employee (Admin Only)" className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No staff members added yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {slipStaff && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-xl mb-4">Generate Salary Slip — {slipStaff.name}</h3>
            <div className="space-y-4 mb-6">
              <div><label className="text-xs font-bold text-gray-500 mb-1 block">Month / Period</label><input type="text" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none font-bold text-sm bg-gray-50" value={slip.month} onChange={e=>setSlip({...slip, month: e.target.value})} placeholder="e.g. October 2026" /></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 space-y-3">
                  <h4 className="font-black text-green-800 text-sm border-b border-green-200 pb-2">Earnings</h4>
                  <div><label className="text-xs font-bold text-gray-600">Basic Salary</label><input type="number" className="w-full border rounded-lg px-3 py-2 outline-none text-sm" value={slip.basicSalary} onChange={e=>setSlip({...slip, basicSalary: e.target.value})} /></div>
                  <div><label className="text-xs font-bold text-gray-600">Transport Allowance</label><input type="number" className="w-full border rounded-lg px-3 py-2 outline-none text-sm" value={slip.transport} onChange={e=>setSlip({...slip, transport: e.target.value})} /></div>
                  <div><label className="text-xs font-bold text-gray-600">Mobile Allowance</label><input type="number" className="w-full border rounded-lg px-3 py-2 outline-none text-sm" value={slip.mobile} onChange={e=>setSlip({...slip, mobile: e.target.value})} /></div>
                  
                  {slip.extras.map((ex, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" placeholder="Name" className="flex-1 border rounded-lg px-2 py-1 text-sm" value={ex.label} onChange={e => { const arr = [...slip.extras]; arr[i].label = e.target.value; setSlip({...slip, extras: arr}); }} />
                      <input type="number" placeholder="Amt" className="w-20 border rounded-lg px-2 py-1 text-sm" value={ex.value} onChange={e => { const arr = [...slip.extras]; arr[i].value = e.target.value; setSlip({...slip, extras: arr}); }} />
                      <button onClick={() => setSlip({...slip, extras: slip.extras.filter((_, idx) => idx !== i)})} className="text-red-500 font-bold hover:text-red-700">X</button>
                    </div>
                  ))}
                  <button onClick={() => setSlip({...slip, extras: [...slip.extras, {label:'', value:''}]})} className="text-xs font-bold text-green-600 hover:underline">+ Add Earning</button>
                </div>

                <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-3">
                  <h4 className="font-black text-red-800 text-sm border-b border-red-200 pb-2">Deductions</h4>
                  {slip.deductions.map((d, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" placeholder="Name" className="flex-1 border rounded-lg px-2 py-1 text-sm" value={d.label} onChange={e => { const arr = [...slip.deductions]; arr[i].label = e.target.value; setSlip({...slip, deductions: arr}); }} />
                      <input type="number" placeholder="Amt" className="w-20 border rounded-lg px-2 py-1 text-sm" value={d.value} onChange={e => { const arr = [...slip.deductions]; arr[i].value = e.target.value; setSlip({...slip, deductions: arr}); }} />
                      <button onClick={() => setSlip({...slip, deductions: slip.deductions.filter((_, idx) => idx !== i)})} className="text-red-500 font-bold hover:text-red-700">X</button>
                    </div>
                  ))}
                  <button onClick={() => setSlip({...slip, deductions: [...slip.deductions, {label:'', value:''}]})} className="text-xs font-bold text-red-600 hover:underline">+ Add Deduction</button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setSlipStaff(null)} className="flex-1 py-3 bg-gray-100 font-bold rounded-xl text-gray-600 hover:bg-gray-200">Cancel</button>
              <button onClick={() => {
                const earnings = [
                  { label: 'Basic Salary', value: parseFloat(slip.basicSalary) || 0 },
                  { label: 'Transport Allowance', value: parseFloat(slip.transport) || 0 },
                  { label: 'Mobile Allowance', value: parseFloat(slip.mobile) || 0 },
                  ...slip.extras.map((e) => ({ label: e.label, value: parseFloat(e.value) || 0 })),
                ];
                const deductions = slip.deductions.map((d) => ({ label: d.label, value: parseFloat(d.value) || 0 }));
                const totalEarnings = earnings.reduce((s, e) => s + e.value, 0);
                const totalDeductions = deductions.reduce((s, d) => s + d.value, 0);
                const netPay = totalEarnings - totalDeductions;
                const fmt = (v: number) => v.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const rows = Math.max(earnings.length, deductions.length);
              
                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Salary Slip</title>
                <style>body{font-family:Arial,sans-serif;color:#333;margin:0;padding:15mm}
                table{width:100%;border-collapse:collapse;border:1px solid #000}
                th{background:#0d7d72;color:#fff;border:1px solid #000;padding:8px;font-size:11pt;text-align:left}
                td{border:1px solid #000;padding:6px 12px;font-size:10pt}
                .right{text-align:right}.center{text-align:center}
                .green{background:#0d7d72;color:#fff}.light{background:#d4ebe8}
                @media print{@page{size:A4;margin:15mm}}</style></head><body>
                <table>
                  <tr>
                    <td class="green center" style="width:25%;padding:20px 10px;font-weight:bold;font-size:11pt">
                      ${settings?.invoiceLogo ? `<img src="${settings.invoiceLogo}" style="height:40px;display:block;margin:0 auto 6px;object-fit:contain">` : ''}
                      ${settings?.storeName ?? 'Company'}
                    </td>
                    <td class="center" style="width:50%;padding:10px">
                      <div style="font-size:24pt;font-weight:bold;letter-spacing:2px">SALARY SLIP</div>
                      <div style="font-size:10pt;border-top:1px solid #000;padding-top:5px;margin-top:5px">${slip.month}</div>
                    </td>
                    <td class="light center" style="width:25%;font-weight:bold;font-size:18pt;padding:20px 10px">CONFIDENTIAL</td>
                  </tr>
                  <tr><td colspan="3" style="padding:0">
                    <table style="width:100%;border-collapse:collapse">
                      <tr>
                        <td style="border:1px solid #000;padding:8px 12px;width:15%">Name</td>
                        <td style="border:1px solid #000;padding:8px 12px;width:35%">: ${slipStaff.name}</td>
                        <td style="border:1px solid #000;padding:8px 12px;width:15%">Title</td>
                        <td style="border:1px solid #000;padding:8px 12px;width:35%">: Staff</td>
                      </tr>
                      <tr>
                        <td style="border:1px solid #000;padding:8px 12px">NIC</td>
                        <td style="border:1px solid #000;padding:8px 12px">: ${slipStaff.nic || '—'}</td>
                        <td style="border:1px solid #000;padding:8px 12px">Period</td>
                        <td style="border:1px solid #000;padding:8px 12px">: ${slip.month}</td>
                      </tr>
                    </table>
                  </td></tr>
                  <tr><td colspan="3" style="padding:0">
                    <table style="width:100%;border-collapse:collapse">
                      <thead><tr>
                        <th style="width:50%">Description</th>
                        <th class="right" style="width:25%">Earnings</th>
                        <th class="center" style="width:25%">Deductions</th>
                      </tr></thead>
                      <tbody>
                        ${Array.from({ length: rows }).map((_, i) => `<tr>
                          <td>${earnings[i]?.label || '&nbsp;'}</td>
                          <td class="right">${earnings[i] ? fmt(earnings[i].value) : ''}</td>
                          <td class="center">${deductions[i] ? `${deductions[i].label}: ${fmt(deductions[i].value)}` : ''}</td>
                        </tr>`).join('')}
                        <tr style="font-weight:bold;background:#f9f9f9">
                          <td>Total</td>
                          <td class="right">${fmt(totalEarnings)}</td>
                          <td class="center">${totalDeductions > 0 ? fmt(totalDeductions) : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td></tr>
                  <tr><td colspan="3" style="padding:0">
                    <table style="width:100%;border-collapse:collapse">
                      <tr>
                        <td style="border:1px solid #000;padding:10px;width:50%;vertical-align:top">
                          <div><strong>Payment Date</strong> : ${new Date().toLocaleDateString()}</div>
                        </td>
                        <td style="border:1px solid #000;padding:10px;width:50%;vertical-align:top">
                          <div style="font-size:12pt;margin-bottom:5px"><strong>Net Salary: ${fmt(netPay)}</strong></div>
                          <div style="font-size:10pt;color:#555">( ${fmt(totalEarnings)} - ${fmt(totalDeductions)} )</div>
                        </td>
                      </tr>
                    </table>
                  </td></tr>
                </table>
                <div style="margin-top:50px;display:flex;justify-content:space-between">
                  <div style="border-top:1px solid #000;padding-top:5px;width:200px;text-align:center">Employer Signature</div>
                  <div style="border-top:1px solid #000;padding-top:5px;width:200px;text-align:center">Employee Signature</div>
                </div>
                <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
                </body></html>`;

                const win = window.open('', '_blank');
                if (win) {
                  win.document.write(html);
                  win.document.close();
                }
              }} className="flex-[2] py-3 bg-brand-primary text-white font-bold rounded-xl shadow-lg hover:bg-brand-secondary">Print PDF Slip (A4)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
