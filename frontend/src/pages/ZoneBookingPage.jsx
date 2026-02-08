import { useState, useEffect } from 'react';
import api from '../services/api';

function ZoneBookingPage() {
  const [zones, setZones] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingHour, setBookingHour] = useState(9);
  const [bookingMinute, setBookingMinute] = useState(0);
  const [slotsToBook, setSlotsToBook] = useState(1);
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadZones();
    loadMyBookings();
  }, []);

  useEffect(() => {
    if (selectedZone && bookingDate && bookingHour !== null) {
      loadRiskForBooking();
    }
  }, [selectedZone, bookingDate, bookingHour]);

  const loadZones = async () => {
    try {
      // Load zones from risk API which includes zone data
      const response = await api.get('/risk/zones');
      const zonesData = response.data || [];

      // Try to enrich with ML ensemble risk data
      try {
        const riskResponse = await api.get('/ml-training/heatmap');
        if (riskResponse.data.loaded && riskResponse.data.locations) {
          // Create a map of risk data by location name
          const riskMap = new Map();
          riskResponse.data.locations.forEach(loc => {
            riskMap.set(loc.location, {
              riskLevel: loc.riskLevel,
              riskScore: loc.riskScore,
              confidence: loc.confidence,
              rfPrediction: loc.rfPrediction,
              nnPrediction: loc.nnPrediction
            });
          });

          // Enrich zones with risk data
          const enrichedZones = zonesData.map(zone => {
            const riskData = riskMap.get(zone.name) || {};
            return {
              ...zone,
              riskLevel: riskData.riskLevel || 'LOW',
              riskScore: riskData.riskScore || 0,
              confidence: riskData.confidence || 0,
              rfPrediction: riskData.rfPrediction,
              nnPrediction: riskData.nnPrediction
            };
          });
          setZones(enrichedZones);
        } else {
          setZones(zonesData);
        }
      } catch (riskError) {
        console.warn('Could not load ML risk data, using zones without risk info:', riskError);
        setZones(zonesData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading zones:', error);
      setLoading(false);
    }
  };

  const loadMyBookings = async () => {
    try {
      const response = await api.get('/zone-bookings/my');
      setMyBookings(response.data);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const loadRiskForBooking = async () => {
    try {
      const response = await api.get(`/ml-training/zones/${selectedZone.zoneId}/risk`);
      setRiskData(response.data);
    } catch (error) {
      console.error('Error loading ML risk:', error);
      setRiskData(null);
    }
  };

  const createBooking = async () => {
    if (!selectedZone || !bookingDate) {
      alert('Please select a zone and date');
      return;
    }

    if (slotsToBook < 1 || slotsToBook > selectedZone.availableSlots) {
      alert(`Please select between 1 and ${selectedZone.availableSlots} slots`);
      return;
    }

    try {
      await api.post('/zone-bookings', {
        zoneId: selectedZone.zoneId,
        slotsBooked: slotsToBook,
        bookingDate: bookingDate,
        timeSlot: {
          hour: bookingHour,
          minute: bookingMinute
        }
      });

      alert('Booking created successfully! Waiting for admin approval.');
      setSelectedZone(null);
      setBookingDate('');
      setSlotsToBook(1);
      loadZones();
      loadMyBookings();
    } catch (error) {
      alert('Error creating booking: ' + (error.response?.data?.error || error.message));
    }
  };

  const cancelBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      await api.delete(`/zone-bookings/${bookingId}`);
      alert('Booking cancelled successfully');
      loadMyBookings();
      loadZones();
    } catch (error) {
      alert('Error cancelling booking: ' + (error.response?.data?.error || error.message));
    }
  };

  const requestSMSReminder = async (bookingId) => {
    try {
      await api.post(`/zone-bookings/${bookingId}/reminders/sms`);
      alert('SMS reminder scheduled successfully!');
      loadMyBookings();
    } catch (error) {
      alert('Error scheduling SMS: ' + (error.response?.data?.error || error.message));
    }
  };

  const requestIVRReminder = async (bookingId) => {
    try {
      await api.post(`/zone-bookings/${bookingId}/reminders/ivr`);
      alert('IVR call reminder scheduled successfully!');
      loadMyBookings();
    } catch (error) {
      alert('Error scheduling IVR: ' + (error.response?.data?.error || error.message));
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'APPROVED': return '#10b981';
      case 'PENDING': return '#f59e0b';
      case 'REJECTED': return '#dc2626';
      case 'CANCELLED': return '#6b7280';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Zone Slot Booking</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div>
          <h2>Available Zones</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {zones.map((zone) => (
              <div
                key={zone.zoneId}
                onClick={() => setSelectedZone(zone)}
                style={{
                  padding: '15px',
                  backgroundColor: selectedZone?.zoneId === zone.zoneId ? '#dbeafe' : 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  borderLeft: `5px solid ${getRiskColor(zone.riskLevel)}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0' }}>{zone.name}</h3>
                    <p style={{ margin: '5px 0', fontSize: '14px', color: '#6b7280' }}>
                      Available Slots: <strong>{zone.availableSlots}</strong> / {zone.totalSlots}
                    </p>
                  </div>
                  <div
                    style={{
                      padding: '5px 10px',
                      backgroundColor: getRiskColor(zone.riskLevel) + '20',
                      color: getRiskColor(zone.riskLevel),
                      borderRadius: '5px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    {zone.riskLevel}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2>Create Booking</h2>
          {selectedZone ? (
            <div style={{ padding: '20px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <h3>{selectedZone.name}</h3>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date:</label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '5px',
                    border: '1px solid #ccc'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Time: {bookingHour.toString().padStart(2, '0')}:{bookingMinute.toString().padStart(2, '0')}
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px' }}>Hour</label>
                    <input
                      type="range"
                      min="0"
                      max="23"
                      value={bookingHour}
                      onChange={(e) => setBookingHour(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px' }}>Minute</label>
                    <select
                      value={bookingMinute}
                      onChange={(e) => setBookingMinute(parseInt(e.target.value))}
                      style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
                    >
                      <option value="0">00</option>
                      <option value="15">15</option>
                      <option value="30">30</option>
                      <option value="45">45</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Number of Slots: {slotsToBook}
                </label>
                <input
                  type="range"
                  min="1"
                  max={selectedZone.availableSlots || 1}
                  value={slotsToBook}
                  onChange={(e) => setSlotsToBook(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {riskData && riskData.loaded && (
                <div style={{
                  padding: '15px',
                  backgroundColor: getRiskColor(riskData.riskLevel) + '10',
                  borderRadius: '5px',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: '0 0 10px 0' }} className="d-flex align-items-center gap-2">
                    <i className="mdi mdi-robot-outline" />
                    ML Ensemble Risk Assessment
                  </h4>
                  <p style={{ margin: '5px 0' }}>
                    Risk Level: <strong style={{ color: getRiskColor(riskData.riskLevel) }}>
                      {riskData.riskLevel}
                    </strong>
                  </p>
                  <p style={{ margin: '5px 0' }}>
                    Risk Score: {(riskData.riskScore * 100).toFixed(0)}%
                  </p>
                  {riskData.confidence && (
                    <p style={{ margin: '5px 0', fontSize: '13px', color: '#6b7280' }}>
                      Confidence: {(riskData.confidence * 100).toFixed(0)}%
                    </p>
                  )}
                  {riskData.rfPrediction !== undefined && riskData.nnPrediction !== undefined && (
                    <p style={{ margin: '5px 0', fontSize: '12px', color: '#6b7280' }}>
                      RF: {riskData.rfPrediction} | NN: {riskData.nnPrediction}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={createBooking}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Create Booking
              </button>
            </div>
          ) : (
            <div style={{
              padding: '40px',
              backgroundColor: '#f3f4f6',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              Select a zone to create a booking
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '40px' }}>
        <h2>My Bookings</h2>
        {myBookings.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No bookings yet</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {myBookings.map((booking) => (
              <div
                key={booking._id}
                style={{
                  padding: '15px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  borderLeft: `5px solid ${getStatusColor(booking.status)}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 10px 0' }}>{booking.zoneId?.name || 'Unknown Zone'}</h3>
                    <p style={{ margin: '5px 0' }}>
                      Date: {new Date(booking.bookingDate).toLocaleDateString()}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      Time: {booking.timeSlot.hour.toString().padStart(2, '0')}:
                      {booking.timeSlot.minute.toString().padStart(2, '0')}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      Slots: {booking.slotsBooked}
                    </p>
                    {booking.rejectionReason && (
                      <p style={{ margin: '5px 0', color: '#dc2626', fontSize: '14px' }}>
                        Reason: {booking.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        padding: '5px 10px',
                        backgroundColor: getStatusColor(booking.status) + '20',
                        color: getStatusColor(booking.status),
                        borderRadius: '5px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        marginBottom: '10px'
                      }}
                    >
                      {booking.status}
                    </div>
                    {booking.status === 'APPROVED' && (
                      <div style={{ display: 'flex', gap: '5px', flexDirection: 'column' }}>
                        {!booking.remindersSent?.sms && (
                          <button
                            onClick={() => requestSMSReminder(booking._id)}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Send SMS
                          </button>
                        )}
                        {!booking.remindersSent?.ivr && (
                          <button
                            onClick={() => requestIVRReminder(booking._id)}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '5px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            IVR Call
                          </button>
                        )}
                      </div>
                    )}
                    {(booking.status === 'PENDING' || booking.status === 'APPROVED') && (
                      <button
                        onClick={() => cancelBooking(booking._id)}
                        style={{
                          marginTop: '5px',
                          padding: '5px 10px',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ZoneBookingPage;
