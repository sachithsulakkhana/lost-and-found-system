import { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, LinearProgress, IconButton, Tooltip } from '@mui/material';
import { Refresh, Warning, CheckCircle, Info } from '@mui/icons-material';
import api from '../services/api';

function MLRiskWidget() {
  const [riskData, setRiskData] = useState(null);
  const [modelStats, setModelStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskData();
    const interval = setInterval(loadRiskData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadRiskData = async () => {
    try {
      const [heatmapRes, statsRes] = await Promise.all([
        api.get('/ml-risk/heatmap'),
        api.get('/ml-risk/model/stats')
      ]);

      setRiskData(heatmapRes.data);
      setModelStats(statsRes.data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading ML risk data:', error);
      setLoading(false);
    }
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'CRITICAL': return '#dc2626';
      case 'HIGH': return '#ea580c';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#10b981';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading ML Risk Data...</Typography>
          <LinearProgress />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{
      boxShadow: '0 4px 20px 0 rgba(0,0,0,0.12)',
      transition: 'all 0.3s',
      '&:hover': {
        boxShadow: '0 8px 30px 0 rgba(0,0,0,0.15)'
      }
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            <i className="mdi mdi-robot-outline me-2" />
            AI Risk Prediction
          </Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadRiskData}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>

        {modelStats && (
          <Box sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 1,
            background: modelStats.isModelTrained ? '#d1fae5' : '#fee2e2'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {modelStats.isModelTrained ? (
                <CheckCircle sx={{ fontSize: 18, color: '#059669' }} />
              ) : (
                <Warning sx={{ fontSize: 18, color: '#dc2626' }} />
              )}
              <Typography variant="body2" fontWeight="600">
                Model {modelStats.isModelTrained ? 'Trained' : 'Not Trained'}
              </Typography>
            </Box>
            {modelStats.isModelTrained && (
              <Typography variant="caption" color="text.secondary">
                {modelStats.trainingRecords} records | {modelStats.locationsCovered} locations
              </Typography>
            )}
          </Box>
        )}

        {riskData && riskData.grouped && (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Current Risk Levels
            </Typography>

            {[
              { key: 'critical', label: 'Critical', color: '#dc2626' },
              { key: 'high', label: 'High', color: '#ea580c' },
              { key: 'medium', label: 'Medium', color: '#f59e0b' },
              { key: 'low', label: 'Low', color: '#10b981' }
            ].map(({ key, label, color }) => (
              <Box key={key} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">{label}</Typography>
                  <Typography variant="body2" fontWeight="bold" color={color}>
                    {riskData.grouped[key]?.length || 0} zones
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={((riskData.grouped[key]?.length || 0) / (riskData.zones?.length || 1)) * 100}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    background: `${color}20`,
                    '& .MuiLinearProgress-bar': {
                      background: color,
                      borderRadius: 3
                    }
                  }}
                />
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, background: '#f3f4f6' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Info sx={{ fontSize: 16, color: '#6b7280' }} />
            <Typography variant="caption" color="text.secondary">
              Updated: {new Date().toLocaleTimeString()}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default MLRiskWidget;
