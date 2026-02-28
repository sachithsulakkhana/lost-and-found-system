import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

const TOTAL_SLOTS = 20;

const statusColor = (s) => {
  if (s === 'STORED')    return { bg: '#f0fdf4', border: '#86efac', text: '#16a34a' };
  if (s === 'RETRIEVED') return { bg: '#eff6ff', border: '#93c5fd', text: '#2563eb' };
  if (s === 'LOST')      return { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' };
  return { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' };
};

export default function StorageRackPage() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState('ALL'); // ALL | STORED | RETRIEVED | LOST

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stored-items');
      setItems(res.data || []);
    } catch {
      toast.error('Failed to load storage data');
    } finally {
      setLoading(false);
    }
  };

  // Assign slot numbers: item 0 → slot 1, item 1 → slot 2 ...
  const sortedItems = [...items].sort((a, b) => new Date(a.storageDate || a.createdAt) - new Date(b.storageDate || b.createdAt));

  // Build slot map: slotNum → item
  const slotMap = {};
  sortedItems.forEach((item, i) => { slotMap[i + 1] = item; });

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
        <button className="btn btn-light border" onClick={fetchItems} disabled={loading}>
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
                          {item.status?.toUpperCase()}
                        </span>
                      ) : (
                        <span className="badge bg-light text-muted" style={{ fontSize: '0.7rem' }}>EMPTY</span>
                      )}
                    </div>

                    {item ? (
                      <>
                        <div className="fw-semibold text-truncate mb-1" title={item.itemName}>{item.itemName}</div>
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
                      </>
                    ) : (
                      <div className="d-flex flex-column align-items-center justify-content-center py-3">
                        <i className="mdi mdi-inbox" style={{ fontSize: 32, color: '#d1d5db' }} />
                        <div className="text-muted small mt-1">Empty</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

