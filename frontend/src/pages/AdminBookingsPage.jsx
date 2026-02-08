import { useEffect, useState } from 'react';
import { Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Button, Chip } from '@mui/material';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState([]);

  const load = async () => {
    try {
      const { data } = await api.get('/bookings/admin');
      setBookings(data);
    } catch (e) {
      toast.error('Failed to load bookings');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id) => {
    try {
      await api.put(`/bookings/admin/${id}/approve`);
      toast.success('Booking approved');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to approve');
    }
  };

  const reject = async (id) => {
    try {
      await api.put(`/bookings/admin/${id}/reject`);
      toast.success('Booking rejected');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to reject');
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Admin - Bookings</Typography>

      <Card>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>Item</strong></TableCell>
                <TableCell><strong>Student</strong></TableCell>
                <TableCell><strong>Start</strong></TableCell>
                <TableCell><strong>End</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.map((b) => (
                <TableRow key={b._id} hover>
                  <TableCell>{b.itemId?.itemName || '—'}</TableCell>
                  <TableCell>{b.userId?.name || '—'}<br /><small>{b.userId?.email || ''}</small></TableCell>
                  <TableCell>{new Date(b.start).toLocaleString()}</TableCell>
                  <TableCell>{new Date(b.end).toLocaleString()}</TableCell>
                  <TableCell><Chip size="small" label={b.status} /></TableCell>
                  <TableCell>
                    {b.status === 'PENDING' ? (
                      <>
                        <Button size="small" variant="contained" onClick={() => approve(b._id)} sx={{ mr: 1 }}>Approve</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => reject(b._id)}>Reject</Button>
                      </>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary" py={4}>No bookings</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
