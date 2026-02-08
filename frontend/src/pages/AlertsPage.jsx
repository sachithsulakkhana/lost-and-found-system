import { useState, useEffect } from 'react';
import {
  Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, IconButton, Tooltip, Typography
} from '@mui/material';
import { Done, Warning, Info, Error as ErrorIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data } = await api.get('/alerts');
      setAlerts(data);
    } catch (error) {
      toast.error('Failed to load alerts');
    }
  };

  const handleResolve = async (id) => {
    try {
      await api.put(`/alerts/${id}/resolve`);
      toast.success('Alert resolved');
      fetchAlerts();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to resolve alert');
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'HIGH': 'error',
      'MEDIUM': 'warning',
      'LOW': 'info'
    };
    return colors[severity] || 'default';
  };

  const getSeverityIcon = (severity) => {
    const icons = {
      'HIGH': <ErrorIcon />,
      'MEDIUM': <Warning />,
      'LOW': <Info />
    };
    return icons[severity] || <Info />;
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="fw-bold mb-1">Active Alerts</h2>
          <div className="text-muted">Monitor and manage system alerts and notifications.</div>
        </div>
      </div>

      <Card>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>Severity</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Item/Device</strong></TableCell>
                <TableCell><strong>Message</strong></TableCell>
                <TableCell><strong>Timestamp</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert._id} hover>
                  <TableCell>
                    <Chip
                      icon={getSeverityIcon(alert.severity)}
                      label={alert.severity}
                      size="small"
                      color={getSeverityColor(alert.severity)}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alert.type}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {alert.storedItemId ? (
                      <>
                        <Typography variant="body2" fontWeight="bold">
                          {alert.storedItemId?.itemName || 'Unknown Item'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {alert.storedItemId?.category || 'N/A'} • {alert.storedItemId?.status || 'N/A'}
                        </Typography>
                      </>
                    ) : alert.deviceId ? (
                      <>
                        <Typography variant="body2">{alert.deviceId?.deviceName || 'Unknown'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {alert.deviceId?.deviceType || 'N/A'}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary">N/A</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{alert.message}</Typography>
                    {alert.userId && (
                      <Typography variant="caption" color="text.secondary">
                        Reported by: {alert.userId?.name || 'Unknown'}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(alert.createdAt).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {!alert.isResolved && (
                      <Tooltip title="Resolve Alert">
                        <IconButton size="small" color="success" onClick={() => handleResolve(alert._id)}>
                          <Done />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {alerts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary" py={4}>
                      No active alerts
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  );
}
