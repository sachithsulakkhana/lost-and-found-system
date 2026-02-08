const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const StoredItem = require('../models/StoredItem');
const Zone = require('../models/Zone');
const { requireAuth, requireRole } = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

router.use(requireAuth);

/**
 * Upload CSV file and bulk import stored items
 * CSV Format:
 * itemName,category,description,zoneName
 * "Laptop","Electronics","Dell XPS 15","Library"
 * "Keys","Keys","Hostel keys","Hostel A"
 */
router.post('/upload/items', requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const results = [];
  const errors = [];
  let lineNumber = 0;

  try {
    // Get all zones for lookup
    const zones = await Zone.find({});
    const zoneMap = {};
    zones.forEach(zone => {
      zoneMap[zone.name.toLowerCase()] = zone.zoneId;
    });

    // Parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          lineNumber++;
          try {
            // Validate required fields
            if (!row.itemName || !row.category) {
              errors.push({
                line: lineNumber,
                error: 'Missing required fields: itemName or category',
                row
              });
              return;
            }

            // Find zone by name
            let zoneId = null;
            if (row.zoneName) {
              const zoneLower = row.zoneName.toLowerCase().trim();
              zoneId = zoneMap[zoneLower];
              if (!zoneId) {
                errors.push({
                  line: lineNumber,
                  warning: `Zone '${row.zoneName}' not found, will use first available zone`,
                  row
                });
                zoneId = zones.length > 0 ? zones[0].zoneId : null;
              }
            } else {
              zoneId = zones.length > 0 ? zones[0].zoneId : null;
            }

            results.push({
              itemName: row.itemName.trim(),
              category: row.category.trim(),
              description: row.description ? row.description.trim() : '',
              zoneId,
              ownerId: req.user._id,
              status: 'STORED',
              storageDate: new Date()
            });
          } catch (err) {
            errors.push({
              line: lineNumber,
              error: err.message,
              row
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Bulk insert items
    let insertedItems = [];
    if (results.length > 0) {
      insertedItems = await StoredItem.insertMany(results);
    }

    // Delete uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Successfully imported ${insertedItems.length} items`,
      imported: insertedItems.length,
      errors: errors.length,
      details: {
        items: insertedItems,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    // Clean up file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.error('CSV upload error:', error);
    res.status(500).json({
      error: 'Failed to process CSV file',
      message: error.message
    });
  }
});

/**
 * Download CSV template
 */
router.get('/template/items', (req, res) => {
  const csvTemplate = `itemName,category,description,zoneName
"Laptop","Electronics","Dell XPS 15 laptop","Library"
"Mobile Phone","Electronics","iPhone 13 Pro","Main Gate"
"Keys","Keys","Hostel room keys","Hostel A"
"Water Bottle","Personal","Blue water bottle","Cafeteria"
"Textbook","Documents","Engineering Mathematics textbook","Library"`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=items_template.csv');
  res.send(csvTemplate);
});

/**
 * Upload CSV for risk analysis data
 * CSV Format: location,specificLocation,time,itemType,crowdLevel,lostCount,weather,dayType
 */
router.post('/upload/risk-data', requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const results = [];

  try {
    // Validate CSV format
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          results.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Save to data directory
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const riskDataPath = path.join(dataDir, 'risk_data.csv');
    fs.copyFileSync(filePath, riskDataPath);

    // Load into CSV Risk Service
    const csvRiskService = require('../services/csvRiskService');
    await csvRiskService.loadCSVData(riskDataPath);

    // Delete uploaded file
    fs.unlinkSync(filePath);

    const stats = csvRiskService.getStatistics();

    res.json({
      success: true,
      message: 'Risk data uploaded and processed successfully',
      count: results.length,
      columns: results.length > 0 ? Object.keys(results[0]) : [],
      statistics: stats,
      sample: results.slice(0, 5)
    });
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({
      error: 'Failed to process risk data CSV',
      message: error.message
    });
  }
});

/**
 * Download risk data template
 */
router.get('/template/risk-data', (req, res) => {
  const csvTemplate = `location,specificLocation,time,itemType,crowdLevel,lostCount,weather,dayType
"Library","Library - 1st Floor","13:40","laptop","high",10,"sunny","weekday"
"Bird Nest Canteen","Bird Nest Canteen","14:30","phone","medium",5,"cloudy","weekday"
"Juice Bar","Juice Bar","09:15","keys","low",2,"sunny","weekday"
"Study Area 4th Floor New Building","Study Area 4th Floor New Building","16:45","waterbottle","medium",3,"rainy","weekend"
"Business Faculty Study Area","Business Faculty Study Area","11:20","wallet","high",8,"windy","weekday"`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=risk_data_template.csv');
  res.send(csvTemplate);
});

module.exports = router;
