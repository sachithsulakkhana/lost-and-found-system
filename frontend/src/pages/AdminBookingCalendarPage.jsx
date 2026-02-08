import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Divider
} from '@mui/material';
import { ChevronLeft, ChevronRight, Add } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfCalendar = (monthStart) => {
  const s = new Date(monthStart);
  s.setDate(s.getDate() - s.getDay()); // Sunday start
  s.setHours(0, 0, 0, 0);
  return s;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const statusColor = (status) => {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'error';
  if (status === 'CANCELLED') return 'default';
  return 'warning';
};

export default function AdminBookingCalendarPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [bookings, setBookings] = useState([]);
  const [closures, setClosures] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    try {
      const [b, c] = await Promise.all([
        api.get('/bookings/admin'),
        api.get('/calendar/events')
      ]);
      setBookings(b.data || []);
      setClosures(c.data || []);
    } catch (e) {
      toast.error('Failed to load booking/calendar data');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id) => {
    try {
      await api.put(`/bookings/admin/${id}/approve`);
      toast.success('Booking approved');
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to approve');
    }
  };

  const reject = async (id) => {
    try {
      await api.put(`/bookings/admin/${id}/reject`);
      toast.success('Booking rejected');
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to reject');
    }
  };

  const monthDays = useMemo(() => {
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const calStart = startOfCalendar(mStart);
    const totalCells = 42; // 6 weeks * 7
    const days = Array.from({ length: totalCells }, (_, i) => addDays(calStart, i));
    return { mStart, mEnd, days };
  }, [month]);

  const itemsForDay = (day) => {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const dayBookings = bookings.filter((b) => {
      const bs = new Date(b.start);
      return bs >= start && bs <= end;
    });
    const dayClosures = closures.filter((c) => {
      // show closure if it intersects this day
      const cs = new Date(c.start);
      const ce = new Date(c.end);
      return cs <= end && ce >= start;
    });
    return { dayBookings, dayClosures };
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4" fontWeight="bold">Admin Calendar (Bookings)</Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/admin/calendar')}
            sx={{
              background: 'linear-gradient(195deg, #667eea, #764ba2)',
              '&:hover': {
                background: 'linear-gradient(195deg, #5568d3, #66408b)'
              }
            }}
          >
            CREATE EVENT
          </Button>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" size="small" onClick={() => setMonth((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)))} startIcon={<ChevronLeft />}>Prev</Button>
            <Typography variant="body1" fontWeight="bold" sx={{ minWidth: 170, textAlign: 'center' }}>
              {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </Typography>
            <Button variant="outlined" size="small" onClick={() => setMonth((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1)))} endIcon={<ChevronRight />}>Next</Button>
          </Stack>
        </Stack>
      </Box>

      <Typography variant="body2" color="text.secondary" mb={2}>
        Click a booking chip to review and approve/reject. Closures are displayed as blue chips. Click "CREATE EVENT" to add new calendar events.
      </Typography>

      <Card sx={{ p: 2 }}>
        {/* Weekday header */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, mb: 1 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <Box key={d} sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary' }}>{d}</Box>
          ))}
        </Box>

        {/* Month grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
          {monthDays.days.map((day) => {
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = sameDay(day, new Date());
            const { dayBookings, dayClosures } = itemsForDay(day);

            return (
              <Box
                key={day.toISOString()}
                sx={{
                  minHeight: 110,
                  border: '1px solid #eee',
                  borderRadius: 2,
                  p: 1,
                  bgcolor: inMonth ? '#fff' : '#fafafa',
                  outline: isToday ? '2px solid rgba(102,126,234,0.6)' : 'none'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" color={inMonth ? 'text.primary' : 'text.secondary'} fontWeight={700}>
                    {day.getDate()}
                  </Typography>
                  {(dayBookings.length + dayClosures.length) > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {dayBookings.length + dayClosures.length}
                    </Typography>
                  )}
                </Box>

                <Stack spacing={0.5}>
                  {dayClosures.slice(0, 2).map((c) => (
                    <Chip
                      key={c._id}
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`Closure: ${c.title}`}
                    />
                  ))}

                  {dayBookings.slice(0, 3).map((b) => (
                    <Chip
                      key={b._id}
                      size="small"
                      color={statusColor(b.status)}
                      label={`${b.itemId?.itemName || 'Item'} (${b.status})`}
                      onClick={() => setSelected(b)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}

                  {(dayBookings.length > 3 || dayClosures.length > 2) && (
                    <Typography variant="caption" color="text.secondary">
                      +{Math.max(0, dayBookings.length - 3) + Math.max(0, dayClosures.length - 2)} more
                    </Typography>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Card>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white' }}>
          Review Booking
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {selected && (
            <>
              <Typography variant="body1" fontWeight={700}>{selected.itemId?.itemName || 'Item'}</Typography>
              <Typography variant="body2" color="text.secondary">
                Student: {selected.userId?.name || '—'} ({selected.userId?.email || '—'})
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2"><strong>Start:</strong> {new Date(selected.start).toLocaleString()}</Typography>
              <Typography variant="body2"><strong>End:</strong> {new Date(selected.end).toLocaleString()}</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Status:</strong> <Chip size="small" label={selected.status} color={statusColor(selected.status)} sx={{ ml: 1 }} />
              </Typography>
              {selected.notes && (
                <Typography variant="body2" sx={{ mt: 1 }}><strong>Notes:</strong> {selected.notes}</Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setSelected(null)}>Close</Button>
          {selected?.status === 'PENDING' && (
            <>
              <Button variant="outlined" color="error" onClick={() => reject(selected._id)}>Reject</Button>
              <Button variant="contained" onClick={() => approve(selected._id)} sx={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>Approve</Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
