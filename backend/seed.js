require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Zone = require('./src/models/Zone');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lost-and-found');
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    await connectDB();

    await User.deleteMany({});
    await Zone.deleteMany({});

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      phone: '+94771111111',
      passwordHash: 'admin123',
      role: 'admin',
      status: 'ACTIVE'
    });
    console.log('✅ Admin user created:', admin.email);

    const security = await User.create({
      name: 'Security Officer',
      email: 'security@example.com',
      phone: '+94772222222',
      passwordHash: 'security123',
      role: 'security',
      status: 'ACTIVE'
    });
    console.log('✅ Security user created:', security.email);

    const student = await User.create({
      name: 'John Student',
      email: 'student@example.com',
      phone: '+94773333333',
      passwordHash: 'student123',
      role: 'student',
      status: 'ACTIVE'
    });
    console.log('✅ Student user created:', student.email);

    // SLIIT Malabe Campus Location
    const campusCenter = { lat: 6.914831936575134, lng: 79.97288012698459 };

    // Helper function to create boundary polygon
    const createBoundary = (lat, lng, radiusMeters) => {
      const latOffset = (radiusMeters / 111320); // 1 degree lat ≈ 111.32 km
      const lngOffset = (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180)));
      return {
        type: 'Polygon',
        coordinates: [[
          [lng - lngOffset, lat - latOffset],
          [lng + lngOffset, lat - latOffset],
          [lng + lngOffset, lat + latOffset],
          [lng - lngOffset, lat + latOffset],
          [lng - lngOffset, lat - latOffset]
        ]]
      };
    };

    const zones = await Zone.insertMany([
      // ==================================================
      // ITEM STORAGE ZONES (4 zones - 5 slots each)
      // These are physical storage locations for items
      // ==================================================
      {
        name: 'New Building Bio Laboratory outside space Storage Cabins',
        center: { lat: 6.9156, lng: 79.973998 },
        radius: 110,
        boundary: createBoundary(6.9156, 79.973998, 110),
        totalSlots: 5,
        availableSlots: 5,
        isActive: true
      },
      {
        name: 'Main building 4th floor B401 Laboratory outside space Storage Cabins',
        center: { lat: 6.915305, lng: 79.974455 },
        radius: 50,
        boundary: createBoundary(6.915305, 79.974455, 50),
        totalSlots: 5,
        availableSlots: 5,
        isActive: true
      },
      {
        name: 'Main Building 5th floor outside space Storage Cabin',
        center: { lat: 6.915142, lng: 79.974625 },
        radius: 100,
        boundary: createBoundary(6.915142, 79.974625, 100),
        totalSlots: 5,
        availableSlots: 5,
        isActive: true
      },
      {
        name: 'Library outdoor Space storage',
        center: { lat: 6.914913, lng: 79.973147 },
        radius: 80,
        boundary: createBoundary(6.914913, 79.973147, 80),
        totalSlots: 5,
        availableSlots: 5,
        isActive: true
      },

      // ==================================================
      // ML PREDICTION ZONES (12 zones from training data)
      // These zones show risk predictions on map
      // ==================================================
      {
        name: 'Bird Nest Study Area',
        center: { lat: 6.9158, lng: 79.9720 },
        radius: 50,
        boundary: createBoundary(6.9158, 79.9720, 50),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'P and S Cafeteria',
        center: { lat: 6.9140, lng: 79.9735 },
        radius: 60,
        boundary: createBoundary(6.9140, 79.9735, 60),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Anohana Canteen',
        center: { lat: 6.9155, lng: 79.9730 },
        radius: 40,
        boundary: createBoundary(6.9155, 79.9730, 40),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Bird Nest Canteen',
        center: { lat: 6.9160, lng: 79.9718 },
        radius: 45,
        boundary: createBoundary(6.9160, 79.9718, 45),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Juice Bar',
        center: { lat: 6.9145, lng: 79.9728 },
        radius: 30,
        boundary: createBoundary(6.9145, 79.9728, 30),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Business Faculty Study Area',
        center: { lat: 6.9150, lng: 79.9740 },
        radius: 70,
        boundary: createBoundary(6.9150, 79.9740, 70),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Library',
        center: { lat: 6.9168, lng: 79.9729 },
        radius: 80,
        boundary: createBoundary(6.9168, 79.9729, 80),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Old Library Space',
        center: { lat: 6.9165, lng: 79.9732 },
        radius: 60,
        boundary: createBoundary(6.9165, 79.9732, 60),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Study Area 4th Floor New Building',
        center: { lat: 6.9148, lng: 79.9745 },
        radius: 50,
        boundary: createBoundary(6.9148, 79.9745, 50),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'Basement Canteen',
        center: { lat: 6.9138, lng: 79.9725 },
        radius: 55,
        boundary: createBoundary(6.9138, 79.9725, 55),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: '3rd Floor Study Area',
        center: { lat: 6.9152, lng: 79.9735 },
        radius: 50,
        boundary: createBoundary(6.9152, 79.9735, 50),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      },
      {
        name: 'New Building Canteen',
        center: { lat: 6.9142, lng: 79.9742 },
        radius: 60,
        boundary: createBoundary(6.9142, 79.9742, 60),
        totalSlots: 0,
        availableSlots: 0,
        isActive: true
      }
    ]);
    console.log(`✅ ${zones.length} zones created`);
    console.log(`   - 4 Item Storage Zones (5 slots each)`);
    console.log(`   - 12 ML Prediction Zones (for risk display)`);

    console.log('\n✅ Seeding completed successfully!');
    console.log('\n📝 Default credentials:');
    console.log('Admin: admin@example.com / admin123');
    console.log('Security: security@example.com / security123');
    console.log('Student: student@example.com / student123');
    console.log('\n📍 Campus Location: SLIIT Malabe (6.914831936575134, 79.97288012698459)');
    console.log('\n🗺️  Zone Types:');
    console.log('   Storage Zones (bookable):');
    console.log('     - New Building Bio Laboratory Storage Cabins');
    console.log('     - Main building 4th floor B401 Storage Cabins');
    console.log('     - Main Building 5th floor Storage Cabin');
    console.log('     - Library outdoor Space storage');
    console.log('   Prediction Zones (ML risk display only):');
    console.log('     - 12 campus locations from ML training data');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedData();
