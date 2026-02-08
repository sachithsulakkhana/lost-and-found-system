import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  CircularProgress
} from '@mui/material';
import { CheckCircle, Cancel, People } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/users?status=${status}`);
      setUsers(data);
    } catch (e) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/admin/users/${id}/approve`);
      toast.success('User approved successfully');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/admin/users/${id}/reject`);
      toast.success('User rejected');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'PENDING_APPROVAL':
        return 'warning';
      case 'REJECTED':
        return 'error';
      case 'PENDING_OTP':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <People sx={{ fontSize: 40, color: '#667eea' }} />
          <Typography variant="h4" fontWeight="bold">
            User Management
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {['PENDING_APPROVAL', 'ACTIVE', 'REJECTED'].map((s) => (
            <Button
              key={s}
              variant={status === s ? 'contained' : 'outlined'}
              onClick={() => setStatus(s)}
              sx={{
                borderRadius: 2,
                ...(status === s && {
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5568d3, #66408b)'
                  }
                })
              }}
            >
              {s.replace('_', ' ')}
            </Button>
          ))}
        </Box>
      </Box>

      <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Email</strong></TableCell>
                  <TableCell><strong>Phone</strong></TableCell>
                  <TableCell><strong>Language</strong></TableCell>
                  <TableCell><strong>Role</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u._id} hover sx={{ '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.05)' } }}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.phone || '—'}</TableCell>
                    <TableCell>{u.preferredLanguage?.toUpperCase() || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={u.role}
                        size="small"
                        sx={{
                          bgcolor: u.role === 'admin' ? '#667eea' : '#e0e0e0',
                          color: u.role === 'admin' ? '#fff' : '#000'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={u.status.replace('_', ' ')} color={getStatusColor(u.status)} />
                    </TableCell>
                    <TableCell>
                      {u.status === 'PENDING_APPROVAL' && (
                        <>
                          <Button
                            size="small"
                            onClick={() => approve(u._id)}
                            disabled={actionLoading === u._id}
                            sx={{ mr: 1 }}
                            variant="contained"
                            startIcon={actionLoading === u._id ? <CircularProgress size={16} /> : <CheckCircle />}
                            color="success"
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            onClick={() => reject(u._id)}
                            disabled={actionLoading === u._id}
                            color="error"
                            variant="outlined"
                            startIcon={<Cancel />}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {u.status !== 'PENDING_APPROVAL' && (
                        <Typography variant="caption" color="text.secondary">
                          No actions available
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>
                        No users with status: {status.replace('_', ' ')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Box>
  );
}
