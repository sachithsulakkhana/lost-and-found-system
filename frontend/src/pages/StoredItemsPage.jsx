import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  Radio,
  RadioGroup,
  IconButton,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  Add,
  Sms,
  Phone,
  Delete,
  EventAvailable,
  Inventory as InventoryIcon,
  ReportProblem,
  CheckCircle,
  GetApp
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function StoredItemsPage() {
  const [items, setItems] = useState([]);
  const [zones, setZones] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [reminderDialog, setReminderDialog] = useState(false);
  const [bookingDialog, setBookingDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [reminderStatus, setReminderStatus] = useState({});
  const [form, setForm] = useState({
    itemName: '',
    category: 'Electronics',
    description: '',
    zoneId: '',
    deviceId: '',
    setReminder: false,
    reminderType: 'SMS',
    reminderDate: '',
    reminderTime: '14:00'
  });

  const [booking, setBooking] = useState({
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    notes: ''
  });

  const categories = ['Electronics', 'Personal', 'Documents', 'Keys', 'Bags', 'Other'];
  const timeSlots = Array.from({ length: 13 }, (_, i) => {
    const hour = i + 8;
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  useEffect(() => {
    fetchItems();
    fetchZones();
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const { data } = await api.get('/devices');
      setDevices(data || []);
    } catch (e) {
      // non-blocking
    }
  };

  const fetchZones = async () => {
    try {
      const { data } = await api.get('/risk/zones');
      setZones(data || []);
      if (!form.zoneId && (data || []).length > 0) {
        setForm((prev) => ({ ...prev, zoneId: data[0].zoneId }));
      }
    } catch (e) {
      // non-blocking
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/stored-items');
      setItems(data);
      // Check reminder status for each item
      await checkReminderStatus(data);
    } catch (error) {
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const checkReminderStatus = async (itemsList) => {
    try {
      const statusMap = {};
      await Promise.all(
        itemsList.map(async (item) => {
          try {
            const { data } = await api.get(`/reminders/check/${item._id}`);
            statusMap[item._id] = data;
          } catch (e) {
            // If check fails, allow reminder creation
            statusMap[item._id] = { hasSmsReminder: false, hasIvrReminder: false };
          }
        })
      );
      setReminderStatus(statusMap);
    } catch (error) {
      console.error('Failed to check reminder status:', error);
    }
  };

  const handleRetrieve = async (id) => {
    if (window.confirm('Mark this item as retrieved?')) {
      try {
        await api.put(`/stored-items/${id}/retrieve`);
        toast.success('Item marked as retrieved');
        fetchItems();
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to retrieve item');
      }
    }
  };

  const handleReportLost = async (id) => {
    if (window.confirm('Report this item as lost? This will create an alert.')) {
      try {
        await api.put(`/stored-items/${id}/report-lost`);
        toast.success('Item reported as lost. Alert created.');
        fetchItems();
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to report item');
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'STORED':
        return 'success';
      case 'RESERVED':
        return 'warning';
      case 'RETRIEVED':
        return 'info';
      case 'LOST':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'STORED':
        return <InventoryIcon sx={{ fontSize: 16 }} />;
      case 'RESERVED':
        return <EventAvailable sx={{ fontSize: 16 }} />;
      case 'RETRIEVED':
        return <CheckCircle sx={{ fontSize: 16 }} />;
      case 'LOST':
        return <ReportProblem sx={{ fontSize: 16 }} />;
      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    try {
      const itemData = {
        itemName: form.itemName,
        category: form.category,
        description: form.description,
        zoneId: form.zoneId,
        ...(form.deviceId && { deviceId: form.deviceId })
      };

      const { data } = await api.post('/stored-items', itemData);

      // Schedule reminder if requested
      if (form.setReminder && form.reminderDate && form.reminderTime) {
        try {
          const reminderData = {
            itemId: data._id,
            type: form.reminderType,
            scheduledDate: form.reminderDate,
            scheduledTime: form.reminderTime
          };
          await api.post('/reminders/schedule', reminderData);
          toast.success(`Item stored and ${form.reminderType} reminder scheduled`);
        } catch (reminderError) {
          // Item was stored successfully, but reminder failed
          toast.warning(`Item stored, but reminder failed: ${reminderError.response?.data?.error || 'Unknown error'}`);
        }
      } else {
        toast.success('Item stored successfully');
      }

      setOpen(false);
      fetchItems();
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to store item');
    }
  };

  const handleQuickReminder = async (item, type) => {
    // Check if reminder already exists
    const status = reminderStatus[item._id];
    if (status) {
      if (type === 'SMS' && status.hasSmsReminder) {
        toast.warning('You already have an SMS reminder set for this item');
        return;
      }
      if (type === 'IVR' && status.hasIvrReminder) {
        toast.warning('You already have an IVR call reminder set for this item');
        return;
      }
    }

    setSelectedItem(item);
    setForm({ ...form, reminderType: type });
    setReminderDialog(true);
  };

  const handleBook = (item) => {
    setSelectedItem(item);
    setBooking({ date: '', startTime: '09:00', endTime: '10:00', notes: '' });
    setBookingDialog(true);
  };

  const handleCreateBooking = async () => {
    try {
      const start = new Date(`${booking.date}T${booking.startTime}:00`).toISOString();
      const end = new Date(`${booking.date}T${booking.endTime}:00`).toISOString();
      await api.post('/bookings', { itemId: selectedItem._id, start, end, notes: booking.notes });
      toast.success('Booking request submitted (pending admin approval)');
      setBookingDialog(false);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create booking');
    }
  };

  const handleScheduleReminder = async () => {
    try {
      const reminderData = {
        itemId: selectedItem._id,
        type: form.reminderType,
        scheduledDate: form.reminderDate,
        scheduledTime: form.reminderTime
      };
      await api.post('/reminders/schedule', reminderData);
      toast.success(`${form.reminderType} reminder scheduled for ${form.reminderDate} at ${form.reminderTime}`);
      setReminderDialog(false);
      resetForm();
      // Refresh reminder status
      await checkReminderStatus(items);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to schedule reminder');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this item?')) {
      try {
        await api.delete(`/stored-items/${id}`);
        toast.success('Item deleted');
        fetchItems();
      } catch (error) {
        toast.error('Failed to delete item');
      }
    }
  };

  const resetForm = () => {
    setForm({
      itemName: '',
      category: 'Electronics',
      description: '',
      zoneId: zones?.[0]?.zoneId || '',
      deviceId: '',
      setReminder: false,
      reminderType: 'SMS',
      reminderDate: '',
      reminderTime: '14:00'
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <InventoryIcon sx={{ fontSize: 40, color: '#667eea' }} />
          <Typography variant="h4" fontWeight="bold">
            Stored Items
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setOpen(true)}
          sx={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5568d3, #66408b)'
            }
          }}
        >
          STORE NEW ITEM
        </Button>
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
                <TableRow sx={{ bgcolor: '#f8f9fa' }}>
                  <TableCell><strong>Item Details</strong></TableCell>
                  <TableCell><strong>Category</strong></TableCell>
                  <TableCell><strong>Zone</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Date Stored</strong></TableCell>
                  <TableCell><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item._id} hover sx={{ '&:hover': { bgcolor: 'rgba(102, 126, 234, 0.05)' } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getStatusIcon(item.status)}
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {item.itemName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.description || 'No description'}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={item.category}
                        size="small"
                        sx={{
                          bgcolor: '#667eea20',
                          color: '#667eea',
                          fontWeight: 'medium'
                        }}
                      />
                    </TableCell>
                    <TableCell>{item.zoneId?.name || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        icon={getStatusIcon(item.status)}
                        label={item.status}
                        size="small"
                        color={getStatusColor(item.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {new Date(item.createdAt || item.storageDate).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {item.status === 'STORED' && (
                          <>
                            <Tooltip title="Retrieve Item">
                              <IconButton
                                size="small"
                                onClick={() => handleRetrieve(item._id)}
                                sx={{ color: '#66bb6a' }}
                              >
                                <GetApp />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Report Lost">
                              <IconButton
                                size="small"
                                onClick={() => handleReportLost(item._id)}
                                sx={{ color: '#ef5350' }}
                              >
                                <ReportProblem />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Request Booking">
                              <IconButton
                                size="small"
                                onClick={() => handleBook(item)}
                                color="secondary"
                              >
                                <EventAvailable />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip title={reminderStatus[item._id]?.hasSmsReminder ? "SMS Reminder Already Set" : "SMS Reminder"}>
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleQuickReminder(item, 'SMS')}
                              disabled={reminderStatus[item._id]?.hasSmsReminder}
                              sx={{
                                opacity: reminderStatus[item._id]?.hasSmsReminder ? 0.5 : 1
                              }}
                            >
                              <Sms />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={reminderStatus[item._id]?.hasIvrReminder ? "IVR Call Reminder Already Set" : "IVR Call"}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleQuickReminder(item, 'IVR')}
                              disabled={reminderStatus[item._id]?.hasIvrReminder}
                              sx={{
                                color: '#43a047',
                                opacity: reminderStatus[item._id]?.hasIvrReminder ? 0.5 : 1
                              }}
                            >
                              <Phone />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete Item">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(item._id)}
                          >
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Box sx={{ py: 4 }}>
                        <InventoryIcon sx={{ fontSize: 60, color: '#e0e0e0', mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                          No items stored yet. Store your first item to get started!
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Store Item Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white' }}>
          Store New Item
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Item Name *"
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={form.category}
                  label="Category"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {categories.map(cat => (
                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Zone</InputLabel>
                <Select
                  value={form.zoneId}
                  label="Zone"
                  onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
                >
                  {zones.map(z => (
                    <MenuItem key={z.zoneId} value={z.zoneId}>{z.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Link to Device (Optional)</InputLabel>
                <Select
                  value={form.deviceId}
                  label="Link to Device (Optional)"
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    if (!deviceId) {
                      // "None" selected
                      setForm({ ...form, deviceId: '' });
                      return;
                    }

                    const device = devices.find(d => d._id === deviceId);
                    if (device) {
                      setForm({
                        ...form,
                        deviceId,
                        itemName: device.deviceName || device.name || form.itemName,
                        description: device.description || form.description
                      });
                    } else {
                      setForm({ ...form, deviceId });
                    }
                  }}
                >
                  <MenuItem value="">
                    <em>None - Enter manually</em>
                  </MenuItem>
                  {devices.map(d => (
                    <MenuItem key={d._id} value={d._id}>
                      {d.deviceName} ({d.deviceType})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Reminder Section */}
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.setReminder}
                    onChange={(e) => setForm({ ...form, setReminder: e.target.checked })}
                  />
                }
                label="Set Reminder"
              />
            </Grid>

            {form.setReminder && (
              <>
                <Grid item xs={12}>
                  <RadioGroup
                    row
                    value={form.reminderType}
                    onChange={(e) => setForm({ ...form, reminderType: e.target.value })}
                  >
                    <FormControlLabel value="SMS" control={<Radio />} label="💬 SMS" />
                    <FormControlLabel value="IVR" control={<Radio />} label="📞 IVR Call" />
                  </RadioGroup>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Reminder Date"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    value={form.reminderDate}
                    onChange={(e) => setForm({ ...form, reminderDate: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Reminder Time</InputLabel>
                    <Select
                      value={form.reminderTime}
                      label="Reminder Time"
                      onChange={(e) => setForm({ ...form, reminderTime: e.target.value })}
                    >
                      {timeSlots.map(time => (
                        <MenuItem key={time} value={time}>{time}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">Store Item</Button>
        </DialogActions>
      </Dialog>

      {/* Quick Reminder Dialog */}
      <Dialog open={reminderDialog} onClose={() => setReminderDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule {form.reminderType} Reminder</DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Item: <strong>{selectedItem?.itemName}</strong>
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Reminder Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.reminderDate}
                onChange={(e) => setForm({ ...form, reminderDate: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Reminder Time</InputLabel>
                <Select
                  value={form.reminderTime}
                  label="Reminder Time"
                  onChange={(e) => setForm({ ...form, reminderTime: e.target.value })}
                >
                  {timeSlots.map(time => (
                    <MenuItem key={time} value={time}>{time}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReminderDialog(false)}>Cancel</Button>
          <Button onClick={handleScheduleReminder} variant="contained">Schedule</Button>
        </DialogActions>
      </Dialog>

      {/* Booking Dialog */}
      <Dialog open={bookingDialog} onClose={() => setBookingDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Booking Slot</DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Item: <strong>{selectedItem?.itemName}</strong>
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={booking.date}
                onChange={(e) => setBooking({ ...booking, date: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Start Time</InputLabel>
                <Select
                  value={booking.startTime}
                  label="Start Time"
                  onChange={(e) => setBooking({ ...booking, startTime: e.target.value })}
                >
                  {timeSlots.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>End Time</InputLabel>
                <Select
                  value={booking.endTime}
                  label="End Time"
                  onChange={(e) => setBooking({ ...booking, endTime: e.target.value })}
                >
                  {timeSlots.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notes (optional)"
                value={booking.notes}
                onChange={(e) => setBooking({ ...booking, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBookingDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateBooking} variant="contained" disabled={!booking.date}>Submit Request</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
