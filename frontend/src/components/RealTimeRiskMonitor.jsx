/**
 * Real-Time Adaptive Risk Monitor Component
 *
 * Displays live risk predictions that update automatically
 * Shows model confidence and learning status
 */

import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Grid,
    Chip,
    LinearProgress,
    Box,
    Button,
    Tooltip,
    IconButton,
    Alert
} from '@mui/material';
import {
    TrendingUp,
    TrendingDown,
    Remove,
    Refresh,
    Info,
    Warning,
    CheckCircle
} from '@mui/icons-material';
import api from '../services/api';

function RealTimeRiskMonitor({ zoneId, zoneName }) {
    const [prediction, setPrediction] = useState(null);
    const [previousRisk, setPreviousRisk] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        fetchPrediction();

        if (autoRefresh) {
            // Refresh every 10 seconds
            const interval = setInterval(fetchPrediction, 10000);
            return () => clearInterval(interval);
        }
    }, [zoneId, autoRefresh]);

    const fetchPrediction = async () => {
        try {
            const response = await api.get(`/adaptive-risk/predict/${zoneId}`);

            const newPrediction = response.data.prediction;

            // Track risk changes
            if (prediction) {
                setPreviousRisk(prediction.riskScore);
            }

            setPrediction(newPrediction);
            setLastUpdate(new Date());
            setLoading(false);
        } catch (error) {
            console.error('Error fetching prediction:', error);
            setLoading(false);
        }
    };

    const getRiskColor = (level) => {
        const colors = {
            LOW: 'success',
            MEDIUM: 'warning',
            HIGH: 'error',
            CRITICAL: 'error'
        };
        return colors[level] || 'default';
    };

    const getRiskTrend = () => {
        if (!previousRisk || !prediction) return null;

        const diff = prediction.riskScore - previousRisk;
        if (Math.abs(diff) < 0.05) return <Remove fontSize="small" />;
        if (diff > 0) return <TrendingUp fontSize="small" color="error" />;
        return <TrendingDown fontSize="small" color="success" />;
    };

    const getConfidenceColor = (confidence) => {
        if (confidence > 0.8) return 'success';
        if (confidence > 0.6) return 'warning';
        return 'error';
    };

    if (loading) {
        return (
            <Card>
                <CardContent>
                    <Typography variant="h6">Loading Risk Assessment...</Typography>
                    <LinearProgress />
                </CardContent>
            </Card>
        );
    }

    if (!prediction) {
        return (
            <Card>
                <CardContent>
                    <Alert severity="error">Failed to load risk prediction</Alert>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card elevation={3}>
            <CardContent>
                {/* Header */}
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" gutterBottom>
                        Real-Time Risk Assessment
                    </Typography>
                    <Box>
                        <Tooltip title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}>
                            <IconButton
                                size="small"
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                color={autoRefresh ? 'primary' : 'default'}
                            >
                                <Refresh />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Model learns from new incidents in real-time">
                            <IconButton size="small">
                                <Info />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Zone Name */}
                {zoneName && (
                    <Typography variant="subtitle1" color="textSecondary" gutterBottom>
                        {zoneName}
                    </Typography>
                )}

                {/* Risk Level Chip */}
                <Box display="flex" alignItems="center" gap={1} marginY={2}>
                    <Chip
                        label={prediction.riskLevel}
                        color={getRiskColor(prediction.riskLevel)}
                        size="large"
                        icon={
                            prediction.riskLevel === 'HIGH' || prediction.riskLevel === 'CRITICAL'
                                ? <Warning />
                                : <CheckCircle />
                        }
                    />
                    {getRiskTrend()}
                </Box>

                {/* Risk Score Progress Bar */}
                <Box marginY={2}>
                    <Box display="flex" justifyContent="space-between" marginBottom={0.5}>
                        <Typography variant="body2">Risk Score</Typography>
                        <Typography variant="body2" fontWeight="bold">
                            {(prediction.riskScore * 100).toFixed(0)}%
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={prediction.riskScore * 100}
                        color={getRiskColor(prediction.riskLevel)}
                        sx={{ height: 8, borderRadius: 1 }}
                    />
                </Box>

                {/* Model Confidence */}
                <Box marginY={2}>
                    <Box display="flex" justifyContent="space-between" marginBottom={0.5}>
                        <Typography variant="body2">Model Confidence</Typography>
                        <Typography variant="body2" fontWeight="bold">
                            {(prediction.confidence * 100).toFixed(0)}%
                        </Typography>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={prediction.confidence * 100}
                        color={getConfidenceColor(prediction.confidence)}
                        sx={{ height: 6, borderRadius: 1 }}
                    />
                </Box>

                {/* Current Conditions */}
                <Grid container spacing={2} marginY={1}>
                    <Grid item xs={6}>
                        <Box
                            padding={1}
                            bgcolor="background.default"
                            borderRadius={1}
                        >
                            <Typography variant="caption" color="textSecondary">
                                Crowd Level
                            </Typography>
                            <Typography variant="h6">
                                {prediction.features.crowdLevel}
                            </Typography>
                            <Typography variant="caption">devices</Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={6}>
                        <Box
                            padding={1}
                            bgcolor="background.default"
                            borderRadius={1}
                        >
                            <Typography variant="caption" color="textSecondary">
                                Weather
                            </Typography>
                            <Typography variant="h6">
                                {prediction.features.weather}
                            </Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={6}>
                        <Box
                            padding={1}
                            bgcolor="background.default"
                            borderRadius={1}
                        >
                            <Typography variant="caption" color="textSecondary">
                                Time
                            </Typography>
                            <Typography variant="h6">
                                {prediction.features.hour}:00
                            </Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={6}>
                        <Box
                            padding={1}
                            bgcolor="background.default"
                            borderRadius={1}
                        >
                            <Typography variant="caption" color="textSecondary">
                                Recent Incidents
                            </Typography>
                            <Typography variant="h6">
                                {prediction.features.recentIncidents}
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>

                {/* Model Info */}
                <Box marginTop={2} padding={1} bgcolor="info.light" borderRadius={1}>
                    <Typography variant="caption" display="block">
                        <strong>Model:</strong> {prediction.modelVersion}
                    </Typography>
                    <Typography variant="caption" display="block">
                        <strong>Last Updated:</strong>{' '}
                        {new Date(prediction.lastUpdated).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" display="block">
                        <strong>Auto-refresh:</strong>{' '}
                        {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                    </Typography>
                </Box>

                {/* Alert if High Risk */}
                {(prediction.riskLevel === 'HIGH' || prediction.riskLevel === 'CRITICAL') && (
                    <Alert severity="warning" sx={{ marginTop: 2 }}>
                        <strong>⚠️ High Risk Alert!</strong>
                        <br />
                        This zone has elevated risk. Consider:
                        <ul style={{ marginTop: 5, marginBottom: 0 }}>
                            <li>Avoid leaving valuables unattended</li>
                            <li>Use secure storage zones</li>
                            <li>Check back items immediately</li>
                        </ul>
                    </Alert>
                )}

                {/* Feedback Button */}
                <Box marginTop={2} display="flex" gap={1}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={fetchPrediction}
                        startIcon={<Refresh />}
                    >
                        Refresh Now
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => window.open(`/risk-history/${zoneId}`, '_blank')}
                    >
                        View History
                    </Button>
                </Box>
            </CardContent>
        </Card>
    );
}

// Component to show all zones
export function AllZonesRiskMonitor() {
    const [predictions, setPredictions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        fetchAllPredictions();

        // Auto-refresh every 15 seconds
        const interval = setInterval(fetchAllPredictions, 15000);
        return () => clearInterval(interval);
    }, []);

    const fetchAllPredictions = async () => {
        try {
            const response = await api.get('/adaptive-risk/predict-all');

            setPredictions(response.data.predictions);
            setLastUpdate(new Date());
            setLoading(false);
        } catch (error) {
            console.error('Error fetching predictions:', error);
            setLoading(false);
        }
    };

    const getRiskColor = (level) => {
        const colors = {
            LOW: 'success',
            MEDIUM: 'warning',
            HIGH: 'error',
            CRITICAL: 'error'
        };
        return colors[level] || 'default';
    };

    if (loading) return <LinearProgress />;

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={2}>
                <Typography variant="h5">All Zones - Real-Time Risk</Typography>
                <Box>
                    <Typography variant="caption" display="block">
                        Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                    </Typography>
                    <Typography variant="caption" display="block" color="textSecondary">
                        Auto-updates every 15 seconds
                    </Typography>
                </Box>
            </Box>

            <Grid container spacing={2}>
                {predictions.map((pred) => (
                    <Grid item xs={12} sm={6} md={4} key={pred.zoneId}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    {pred.zoneName}
                                </Typography>

                                <Chip
                                    label={pred.riskLevel}
                                    color={getRiskColor(pred.riskLevel)}
                                    size="small"
                                    sx={{ marginBottom: 1 }}
                                />

                                <Typography variant="body2" color="textSecondary">
                                    Risk: {(pred.riskScore * 100).toFixed(0)}%
                                </Typography>

                                <Typography variant="body2" color="textSecondary">
                                    Confidence: {(pred.confidence * 100).toFixed(0)}%
                                </Typography>

                                <Typography variant="caption" display="block" marginTop={1}>
                                    Crowd: {pred.features.crowdLevel} | Weather: {pred.features.weather}
                                </Typography>

                                <Button
                                    size="small"
                                    fullWidth
                                    variant="outlined"
                                    sx={{ marginTop: 1 }}
                                    href={`/zone-details/${pred.zoneId}`}
                                >
                                    View Details
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}

export default RealTimeRiskMonitor;
