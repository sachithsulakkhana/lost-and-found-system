import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

const CATEGORIES = ['Electronics', 'Personal', 'Documents', 'Keys', 'Bags', 'Other'];
const TOTAL_SLOTS = 20;

const catIcon = (cat) => {
  if (cat === 'Electronics') return 'mdi-laptop';
  if (cat === 'Personal')    return 'mdi-account-box';
  if (cat === 'Documents')   return 'mdi-file-document';
  if (cat === 'Keys')        return 'mdi-key';
  if (cat === 'Bags')        return 'mdi-bag-personal';
  return 'mdi-package-variant';
};

const statusColor = (s) => {
  if (s === 'STORED')    return { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' };
  if (s === 'RETRIEVED') return { bg: '#eff6ff', border: '#93c5fd', text: '#2563eb' };
  if (s === 'LOST')      return { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' };
  return { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' };
};

export default function StorageRackPage() {
  const [items,   setItems]   = useState([]);
  const [zones,   setZones]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSlot, setAddSlot] = useState(null);
  const [form,    setForm]    = useState({ itemName: '', category: 'Electronics', description: '', zoneId: '' });
  const [saving,  setSaving]  = useState(false);
  const [filter,  setFilter]  = useState('ALL'); // ALL | STORED | RETRIEVED | LOST

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [itemsRes, zonesRes] = await Promise.all([
        api.get('/stored-items'),
        api.get('/risk/zones'),
      ]);
      setItems(itemsRes.data || []);
      setZones(zonesRes.data || []);
      if ((zonesRes.data || []).length > 0 && !form.zoneId) {
        setForm(p => ({ ...p, zoneId: zonesRes.data[0].zoneId }));
      }
    } catch {
      toast.error('Failed to load storage data');
    } finally {
      setLoading(false);
    }
  };

  // Assign slot numbers: item 0 → slot 1, item 1 → slot 2 ...
  // Sort by storageDate ascending so slot numbers are stable
  const sortedItems = [...items].sort((a, b) => new Date(a.storageDate || a.createdAt) - new Date(b.storageDate || b.createdAt));

  // Build slot map: slotNum → item
  const slotMap = {};
  sortedItems.forEach((item, i) => { slotMap[i + 1] = item; });

  const handleOpenAdd = (slotNum) => {
    setAddSlot(slotNum);
    setForm({ itemName: '', category: 'Electronics', description: '', zoneId: zones[0]?.zoneId || '' });
    setAddOpen(true);
  };

  const handleStore = async () => {
    if (!form.itemName || !form.zoneId) { toast.error('Item name and zone required'); return; }
    setSaving(true);
    try {
      await api.post('/stored-items', form);
      toast.success(`Stored in Storage ${addSlot}`);
      setAddOpen(false);
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to store item');
    } finally { setSaving(false); }
  };

  const handleRetrieve = async (id, slotNum) => {
    if (!window.confirm(`Retrieve item from Storage ${slotNum}?`)) return;
    try {
      await api.put(`/stored-items/${id}/retrieve`);
      toast.success('Item retrieved');
      fetchAll();
    } catch { toast.error('Failed to retrieve'); }
  };

  const handleDelete = async (id, slotNum) => {
    if (!window.confirm(`Remove item from Storage ${slotNum}?`)) return;
    try {
      await api.delete(`/stored-items/${id}`);
      toast.success('Item removed');
      fetchAll();
    } catch { toast.error('Failed to remove'); }
  };

  const occupied  = sortedItems.filter(i => i.status === 'STORED').length;
  const retrieved = sortedItems.filter(i => i.status === 'RETRIEVED').length;
  const lost      = sortedItems.filter(i => i.status === 'LOST').length;

  const filteredSlots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i + 1).filter(slot => {
    const item = slotMap[slot];
    if (filter === 'EMPTY') return !item;
    if (filter === 'STORED')    return item?.status === 'STORED';
    if (filter === 'RETRIEVED') return item?.status === 'RETRIEVED';
    if (filter === 'LOST')      return item?.status === 'LOST';
    return true;
  });

  return (
    <div className="container-fluid">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-locker-multiple text-primary" /> Storage Rack
          </h2>
          <div className="text-muted small">
            {TOTAL_SLOTS} slots · {occupied} occupied · {TOTAL_SLOTS - sortedItems.length} free
          </div>
        </div>
        <button className="btn btn-light border" onClick={fetchAll} disabled={loading}>
          <i className={`mdi mdi-refresh ${loading ? 'mdi-spin' : ''}`} />
        </button>
      </div>

      {/* Stat strip */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Slots',  value: TOTAL_SLOTS,                     icon: 'mdi-locker',          color: '#4e64ff' },
          { label: 'Occupied',     value: occupied,                         icon: 'mdi-package-variant', color: '#16a34a' },
          { label: 'Free',         value: TOTAL_SLOTS - sortedItems.length, icon: 'mdi-lock-open-outline',color: '#6b7280' },
          { label: 'Lost Items',   value: lost,                             icon: 'mdi-alert-circle',    color: '#dc2626' },
        ].map(c => (
          <div key={c.label} className="col-6 col-md-3">
            <div className="card">
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div style={{ fontSize: 26, color: c.color }}><i className={`mdi ${c.icon}`} /></div>
                <div>
                  <div className="text-muted small">{c.label}</div>
                  <div className="fw-bold fs-5">{c.value}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {['ALL', 'STORED', 'RETRIEVED', 'LOST', 'EMPTY'].map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-cp' : 'btn-outline-secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'All Slots' : f === 'EMPTY' ? 'Free Slots' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Storage grid */}
      {loading ? (
        <div className="text-center py-5 text-muted">
          <span className="spinner-border spinner-border-sm me-2" /> Loading…
        </div>
      ) : (
        <div className="row g-3">
          {filteredSlots.map(slot => {
            const item = slotMap[slot];
            const col  = item ? statusColor(item.status) : { bg: '#f9fafb', border: '#e5e7eb', text: '#9ca3af' };
            return (
              <div key={slot} className="col-6 col-md-4 col-lg-3">
                <div
                  className="card h-100"
                  style={{ border: `2px solid ${col.border}`, background: col.bg, transition: 'all .2s' }}
                >
                  <div className="card-body p-3">
                    {/* Slot header */}
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="fw-bold" style={{ fontSize: '1.1rem', color: '#374151' }}>
                        Storage {slot}
                      </div>
                      {item ? (
                        <span className="badge" style={{ background: col.text + '20', color: col.text, fontSize: '0.7rem' }}>
                          {item.status}
                        </span>
                      ) : (
                        <span className="badge bg-light text-muted" style={{ fontSize: '0.7rem' }}>EMPTY</span>
                      )}
                    </div>

                    {item ? (
                      <>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <i className={`mdi ${catIcon(item.category)}`} style={{ color: col.text, fontSize: 18 }} />
                          <span className="fw-semibold text-truncate" title={item.itemName}>{item.itemName}</span>
                        </div>
                        <div className="text-muted small mb-1">{item.category}</div>
                        {item.description && (
                          <div className="text-muted small text-truncate mb-2" title={item.description}>
                            {item.description}
                          </div>
                        )}
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                          <i className="mdi mdi-calendar me-1" />
                          {new Date(item.storageDate || item.createdAt).toLocaleDateString()}
                        </div>
                        {item.zoneId?.name && (
                          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            <i className="mdi mdi-map-marker me-1" />{item.zoneId.name}
                          </div>
                        )}

                        {/* Actions */}
                        {item.status === 'STORED' && (
                          <div className="d-flex gap-1 mt-2">
                            <button
                              className="btn btn-sm btn-success flex-fill"
                              style={{ fontSize: '0.72rem', padding: '3px 6px' }}
                              onClick={() => handleRetrieve(item._id, slot)}
                            >
                              <i className="mdi mdi-check me-1" />Retrieve
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              style={{ fontSize: '0.72rem', padding: '3px 6px' }}
                              onClick={() => handleDelete(item._id, slot)}
                            >
                              <i className="mdi mdi-delete" />
                            </button>
                          </div>
                        )}
                        {item.status !== 'STORED' && (
                          <button
                            className="btn btn-sm btn-outline-secondary w-100 mt-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={() => handleDelete(item._id, slot)}
                          >
                            <i className="mdi mdi-delete me-1" />Remove
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="d-flex flex-column align-items-center justify-content-center py-3">
                        <i className="mdi mdi-plus-circle-outline" style={{ fontSize: 32, color: '#d1d5db' }} />
                        <div className="text-muted small mt-1">Empty</div>
                        <button
                          className="btn btn-sm btn-cp mt-2"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => handleOpenAdd(slot)}
                        >
                          Store Item
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add item modal */}
      {addOpen && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,.5)' }} onClick={e => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="mdi mdi-package-variant me-2 text-primary" />
                  Store Item — Storage {addSlot}
                </h5>
                <button className="btn-close" onClick={() => setAddOpen(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-semibold">Item Name *</label>
                  <input className="form-control" placeholder="e.g. iPhone 14" value={form.itemName}
                    onChange={e => setForm(p => ({ ...p, itemName: e.target.value }))} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Category</label>
                  <select className="form-select" value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Description</label>
                  <textarea className="form-control" rows={2} placeholder="Optional notes…" value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Zone / Location *</label>
                  <select className="form-select" value={form.zoneId}
                    onChange={e => setForm(p => ({ ...p, zoneId: e.target.value }))}>
                    <option value="">— Select zone —</option>
                    {zones.map(z => <option key={z.zoneId} value={z.zoneId}>{z.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
                <button className="btn btn-cp" onClick={handleStore} disabled={saving}>
                  {saving
                    ? <><span className="spinner-border spinner-border-sm me-1" />Storing…</>
                    : <><i className="mdi mdi-content-save me-1" />Store in Slot {addSlot}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
