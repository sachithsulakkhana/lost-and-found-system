import { useEffect, useState } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, IconButton
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function AdminZonesPage() {
  const [zones, setZones] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius: 80 });

  const load = async () => {
    try {
      const { data } = await api.get('/admin/zones');
      setZones(data);
    } catch (e) {
      toast.error('Failed to load zones');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      const lat = parseFloat(form.lat);
      const lng = parseFloat(form.lng);
      const radius = parseFloat(form.radius);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return toast.error('Invalid coordinates');

      // Minimal polygon boundary (required by backend schema). We create a tiny square around the center.
      const d = 0.0003;
      const boundary = {
        type: 'Polygon',
        coordinates: [[
          [lng - d, lat - d],
          [lng + d, lat - d],
          [lng + d, lat + d],
          [lng - d, lat + d],
          [lng - d, lat - d]
        ]]
      };

      await api.post('/admin/zones', {
        name: form.name,
        center: { lat, lng },
        radius,
        boundary
      });
      toast.success('Zone created');
      setOpen(false);
      setForm({ name: '', lat: '', lng: '', radius: 80 });
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create zone');
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this zone?')) return;
    try {
      await api.delete(`/admin/zones/${id}`);
      toast.success('Zone deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete zone');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">Admin - Zones</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)} sx={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
          CREATE ZONE
        </Button>
      </Box>

      <Card>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Center</strong></TableCell>
                <TableCell><strong>Radius</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {zones.map((z) => (
                <TableRow key={z._id} hover>
                  <TableCell>{z.name}</TableCell>
                  <TableCell>{z.center?.lat}, {z.center?.lng}</TableCell>
                  <TableCell>{z.radius || 80}m</TableCell>
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => del(z._id)}><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {zones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary" py={4}>No zones</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Zone</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth label="Zone Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Radius (meters)" value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} variant="contained" disabled={!form.name || !form.lat || !form.lng}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
