import { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  MenuItem,
  CircularProgress,
  Box,
  Typography
} from '@mui/material';
import {
  Add,
  Notifications,
  Sms,
  Phone,
  AccessTime,
  CheckCircle,
  Error,
  Schedule
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

const languages = [
  { code: 'en', label: 'English' },
  { code: 'si', label: 'Sinhala (සිංහල)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' }
];

export default function RemindersPage() {
  const [reminders, setReminders] = useState({ sms: [], ivr: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('sms');
  const [form, setForm] = useState({
    message: '',
    scheduledFor: '',
    language: 'en'
  });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setIsAdmin(user.role === 'admin');
      } catch (error) {
        console.error('Invalid user data');
      }
    }
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const [smsRes, ivrRes] = await Promise.all([
        api.get('/reminders/sms').catch(() => ({ data: [] })),
        api.get('/reminders/ivr/calls').catch(() => ({ data: [] }))
      ]);
      setReminders({
        sms: smsRes.data,
        ivr: ivrRes.data
      });
    } catch (error) {
      console.error('Failed to load reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (type === 'sms') {
        await api.post('/reminders/sms', {
          message: form.message,
          scheduledFor: new Date(form.scheduledFor).toISOString()
        });
        toast.success('SMS reminder scheduled successfully');
      } else {
        await api.post('/reminders/ivr/call', {
          scheduledFor: new Date(form.scheduledFor).toISOString(),
          language: form.language,
          message: form.message
        });
        toast.success('IVR call reminder scheduled successfully');
      }

      setOpen(false);
      fetchReminders();
      setForm({ message: '', scheduledFor: '', language: 'en' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to schedule reminder');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'SENT':
      case 'COMPLETED':
      case 'ANSWERED':
        return 'success';
      case 'PENDING':
      case 'INITIATED':
        return 'warning';
      case 'FAILED':
      case 'BUSY':
      case 'NO_ANSWER':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'SENT':
      case 'COMPLETED':
      case 'ANSWERED':
        return <CheckCircle sx={{ fontSize: 16 }} />;
      case 'PENDING':
      case 'INITIATED':
        return <Schedule sx={{ fontSize: 16 }} />;
      case 'FAILED':
      case 'BUSY':
      case 'NO_ANSWER':
        return <Error sx={{ fontSize: 16 }} />;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="fw-bold mb-1">
            {isAdmin ? 'All Student Reminders' : 'Reminders & Notifications'}
          </h2>
          <div className="text-muted">
            {isAdmin ? 'View all reminders from all students' : 'SMS and IVR call reminders for item retrievals and bookings.'}
          </div>
        </div>
        {!isAdmin && (
          <span className="badge cp-badge-soft">
            Schedule from Stored Items
          </span>
        )}
      </div>

      <Grid container spacing={3}>
        {/* SMS Reminders */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ borderRadius: 3, boxShadow: 3, height: '100%' }}>
            <Box
              sx={{
                p: 2,
                background: 'linear-gradient(135deg, #26c6da, #00acc1)',
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              <Sms sx={{ fontSize: 32, color: 'white' }} />
              <Box>
                <Typography variant="h6" fontWeight="bold" color="white">
                  SMS Reminders
                </Typography>
                <Typography variant="caption" color="rgba(255,255,255,0.9)">
                  {reminders.sms.length} scheduled
                </Typography>
              </Box>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {isAdmin && <TableCell><strong>Student</strong></TableCell>}
                    <TableCell><strong>Message</strong></TableCell>
                    <TableCell><strong>Scheduled</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 4 : 3} align="center">
                        <CircularProgress size={24} sx={{ my: 2 }} />
                      </TableCell>
                    </TableRow>
                  ) : reminders.sms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 4 : 3} align="center">
                        <Box sx={{ py: 4 }}>
                          <Sms sx={{ fontSize: 48, color: '#e0e0e0', mb: 1 }} />
                          <Typography variant="body2" color="text.secondary">
                            No SMS reminders scheduled
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reminders.sms.map((sms) => (
                      <TableRow key={sms._id} hover>
                        {isAdmin && (
                          <TableCell>
                            <Typography variant="caption" fontWeight="medium">
                              {sms.userId?.name || 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                            {sms.message}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption">
                              {new Date(sms.scheduledFor).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={getStatusIcon(sms.status)}
                            label={sms.status}
                            size="small"
                            color={getStatusColor(sms.status)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>

        {/* IVR Call Reminders */}
        <Grid item xs={12} lg={6}>
          <Card sx={{ borderRadius: 3, boxShadow: 3, height: '100%' }}>
            <Box
              sx={{
                p: 2,
                background: 'linear-gradient(135deg, #66bb6a, #43a047)',
                display: 'flex',
                alignItems: 'center',
                gap: 2
              }}
            >
              <Phone sx={{ fontSize: 32, color: 'white' }} />
              <Box>
                <Typography variant="h6" fontWeight="bold" color="white">
                  IVR Call Reminders
                </Typography>
                <Typography variant="caption" color="rgba(255,255,255,0.9)">
                  {reminders.ivr.length} scheduled • Multi-language support
                </Typography>
              </Box>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {isAdmin && <TableCell><strong>Student</strong></TableCell>}
                    <TableCell><strong>Language</strong></TableCell>
                    <TableCell><strong>Scheduled</strong></TableCell>
                    <TableCell><strong>Duration</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 5 : 4} align="center">
                        <CircularProgress size={24} sx={{ my: 2 }} />
                      </TableCell>
                    </TableRow>
                  ) : reminders.ivr.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 5 : 4} align="center">
                        <Box sx={{ py: 4 }}>
                          <Phone sx={{ fontSize: 48, color: '#e0e0e0', mb: 1 }} />
                          <Typography variant="body2" color="text.secondary">
                            No IVR call reminders scheduled
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reminders.ivr.map((call) => (
                      <TableRow key={call._id} hover>
                        {isAdmin && (
                          <TableCell>
                            <Typography variant="caption" fontWeight="medium">
                              {call.userId?.name || 'Unknown'}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Chip
                            label={call.language?.toUpperCase() || 'EN'}
                            size="small"
                            sx={{ bgcolor: '#66bb6a20', color: '#43a047' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption">
                              {new Date(call.scheduledFor).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {call.duration ? `${call.duration}s` : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={getStatusIcon(call.status)}
                            label={call.status}
                            size="small"
                            color={getStatusColor(call.status)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Info Cards */}
      <Grid container spacing={3} mt={1}>
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              p: 3,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #667eea15, #764ba215)',
              border: '1px solid #667eea30'
            }}
          >
            <Typography variant="h6" fontWeight="bold" color="#667eea" gutterBottom>
              <Sms sx={{ fontSize: 24, verticalAlign: 'middle', mr: 1 }} />
              About SMS Reminders
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Schedule text message notifications for item retrievals, bookings, and alerts.
              SMS reminders are sent automatically at the scheduled time.
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card
            sx={{
              p: 3,
              borderRadius: 3,
              background: 'linear-gradient(135deg, #66bb6a15, #43a04715)',
              border: '1px solid #66bb6a30'
            }}
          >
            <Typography variant="h6" fontWeight="bold" color="#43a047" gutterBottom>
              <Phone sx={{ fontSize: 24, verticalAlign: 'middle', mr: 1 }} />
              About IVR Calls
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Automated voice call reminders in your preferred language (English, Sinhala, or Tamil).
              Calls are auto-dialed at the scheduled time with customizable messages.
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Schedule Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Notifications sx={{ color: '#667eea' }} />
            <Typography variant="h6">Schedule Reminder</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Reminder Type
            </Typography>
            <ToggleButtonGroup
              value={type}
              exclusive
              onChange={(e, newType) => newType && setType(newType)}
              fullWidth
              sx={{ mb: 3 }}
            >
              <ToggleButton value="sms">
                <Sms sx={{ mr: 1 }} /> SMS
              </ToggleButton>
              <ToggleButton value="ivr">
                <Phone sx={{ mr: 1 }} /> IVR Call
              </ToggleButton>
            </ToggleButtonGroup>

            <Grid container spacing={2}>
              {type === 'ivr' && (
                <Grid item xs={12}>
                  <TextField
                    select
                    fullWidth
                    label="Language *"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    helperText="Select language for voice call"
                  >
                    {languages.map((lang) => (
                      <MenuItem key={lang.code} value={lang.code}>
                        {lang.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Message *"
                  multiline
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder={
                    type === 'sms'
                      ? 'Enter SMS message...'
                      : 'Enter message to be spoken in the call...'
                  }
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Scheduled Time *"
                  type="datetime-local"
                  value={form.scheduledFor}
                  onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="When should this reminder be sent?"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!form.message || !form.scheduledFor}
            sx={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5568d3, #66408b)'
              }
            }}
          >
            Schedule
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
