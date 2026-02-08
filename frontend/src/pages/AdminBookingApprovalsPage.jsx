import { useState, useEffect } from 'react';
import api from '../services/api';

function AdminBookingApprovalsPage() {
  const [pendingBookings, setPendingBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingBookings();
    loadStats();
  }, []);

  const loadPendingBookings = async () => {
    try {
      const response = await api.get('/zone-bookings/pending');
      setPendingBookings(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading pending bookings:', error);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/zone-bookings/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const approveBooking = async (bookingId) => {
    try {
      await api.post(`/zone-bookings/${bookingId}/approve`);
      alert('Booking approved successfully!');
      loadPendingBookings();
      loadStats();
    } catch (error) {
      alert('Error approving booking: ' + (error.response?.data?.error || error.message));
    }
  };

  const rejectBooking = async (bookingId) => {
    const reason = prompt('Please enter rejection reason:');
    if (!reason) return;

    try {
      await api.post(`/zone-bookings/${bookingId}/reject`, { reason });
      alert('Booking rejected successfully!');
      loadPendingBookings();
      loadStats();
    } catch (error) {
      alert('Error rejecting booking: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Zone Booking Approvals</h1>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginTop: '20px' }}>
          <div style={{ padding: '20px', backgroundColor: '#dbeafe', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#1e40af' }}>Total</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>{stats.total}</p>
          </div>
          <div style={{ padding: '20px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#92400e' }}>Pending</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>{stats.pending}</p>
          </div>
          <div style={{ padding: '20px', backgroundColor: '#d1fae5', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#065f46' }}>Approved</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>{stats.approved}</p>
          </div>
          <div style={{ padding: '20px', backgroundColor: '#fee2e2', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#991b1b' }}>Rejected</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>{stats.rejected}</p>
          </div>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <h2>Pending Approvals ({pendingBookings.length})</h2>

        {pendingBookings.length === 0 ? (
          <div style={{
            padding: '40px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            No pending bookings to review
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '15px', marginTop: '15px' }}>
            {pendingBookings.map((booking) => (
              <div
                key={booking._id}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  borderLeft: '5px solid #f59e0b'
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '20px', alignItems: 'start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 10px 0' }}>User Information</h3>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Name:</strong> {booking.userId?.name || 'Unknown'}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Email:</strong> {booking.userId?.email || 'Unknown'}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Phone:</strong> {booking.userId?.phone || 'Unknown'}
                    </p>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 10px 0' }}>Booking Details</h3>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Zone:</strong> {booking.zoneId?.name || 'Unknown'}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Slots:</strong> {booking.slotsBooked}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Date:</strong> {new Date(booking.bookingDate).toLocaleDateString()}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Time:</strong> {booking.timeSlot.hour.toString().padStart(2, '0')}:
                      {booking.timeSlot.minute.toString().padStart(2, '0')}
                    </p>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 10px 0' }}>Submission</h3>
                    <p style={{ margin: '5px 0', fontSize: '14px', color: '#6b7280' }}>
                      Submitted: {new Date(booking.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button
                      onClick={() => approveBooking(booking._id)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectBooking(booking._id)}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Reject
                    </button>
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

export default AdminBookingApprovalsPage;
