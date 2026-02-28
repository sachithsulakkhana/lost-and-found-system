# MAC Address Collection Guide

## What Changed

You can now register devices with their **actual MAC addresses** instead of random ones. This ensures proper device tracking and identification.

## How Device Registration Works Now

### When Adding a Device:

1. **Click "Add Device"** button on the My Devices page
2. **Device Name** - Auto-filled with detected device type (e.g., "iPhone", "Android Device", "Windows PC")
3. **MAC Address** - Enter your device's actual MAC address (OPTIONAL - will auto-generate if blank)
4. **Identifier** - Short description (e.g., "iPhone 14", "Samsung Galaxy S23")
5. **Manufacturer** - Auto-filled (e.g., "Apple", "Samsung", "Windows")
6. **Model** - Auto-filled with device model info

### MAC Address Format:
```
Correct format: A4:C3:F0:2D:11:9E
(Hex digits separated by colons)
```

## Finding Your Device's MAC Address

### 📱 iPhone / iPad
1. Open **Settings**
2. Go to **General** → **About**
3. Find the **"WiFi Address"** field
4. Copy the value (example: `A4:C3:F0:2D:11:9E`)

### 🤖 Android
1. Open **Settings**
2. Go to **About Phone** or **About Device**
3. Look for **"Status"** or **"Device Status"**
4. Find **"WiFi MAC Address"** or **"Bluetooth Address"**
   - Alternatively: **Settings** → **WiFi** → Long-press connected network → **Properties**

### 💻 Windows
1. Open **Command Prompt** (cmd)
2. Type: `ipconfig /all`
3. Look for **"Physical Address"** under your network adapter:
   ```
   Ethernet adapter Ethernet:
   Physical Address . . . . . . . . . : AA-BB-CC-DD-EE-FF
   ```
4. Format it with colons: `AA:BB:CC:DD:EE:FF`

### 🍎 Mac
1. Open **Terminal**
2. Type: `ifconfig | grep "ether"`
3. Output example: `ether a4:c3:f0:2d:11:9e`
4. Copy the value

### 🐧 Linux
1. Open **Terminal**
2. Type: `ip link show` or `ifconfig | grep HWaddr`
3. Look for **"link/ether"** or **"HWaddr"** value
4. Copy the value

## Backend Updates

### What the Backend Now Does:

1. **Accepts MAC Address Input**
   - If you provide a MAC address, it will use that
   - If you leave it blank, it generates a random one
   - MAC addresses are validated for correct format

2. **Detects Duplicate MACs**
   - If a MAC is already registered, you'll get an error: "This MAC address is already registered"
   - This prevents double-registration of the same device

3. **Stores with Device Record**
   - The MAC address is stored in the Device database
   - Used for identification in the Learning Insights and Device Monitoring pages

## Frontend Updates

### New Features:

1. **Auto-Detection**
   - When you click "Add Device", the form auto-fills:
     - **Device Name** from browser detection
     - **Manufacturer** from browser detection
     - **Identifier** from browser detection

2. **MAC Address Validation**
   - Checks format: `XX:XX:XX:XX:XX:XX`
   - Shows error if format is invalid
   - Auto-converts to UPPERCASE

3. **Helper Instructions**
   - Instructions shown directly in the form for each device type
   - Platform-specific steps for finding MAC address

4. **Optional Field**
   - MAC address is optional - you can leave blank
   - System will generate a unique identifier if not provided

## Database Updates

### Device Model:
MAC address field already exists in the database:
```javascript
macAddress: { type: String, required: true, unique: true }
```

## Example Workflow

### Registering Your iPhone:

1. Click **"Add Device"** on My Devices page
2. Form auto-fills:
   - Device Name: `iPhone`
   - Manufacturer: `Apple`
   - Model: `iPhone (iOS 17)`
3. Go to your iPhone → Settings → General → About
4. Find WiFi Address (e.g., `A4:C3:F0:2D:11:9E`)
5. Paste in **MAC Address** field
6. Click **Register**
7. Device is now tracked with its actual MAC address!

### Registering Your Vivo Phone:

1. Click **"Add Device"**
2. Form shows device type detected
3. On Vivo phone: Settings → About → Status → WiFi MAC Address
4. Copy and paste the MAC address
5. Click **Register**
6. Now you have your Vivo phone registered separately from iPhone!

## Important Notes

- ✅ Each MAC address can only be registered once
- ✅ MAC addresses are case-insensitive (A4:c3:F0 = A4:C3:F0)
- ✅ Format must be exact: `XX:XX:XX:XX:XX:XX` (12 hex digits + colons)
- ✅ Leave blank if you can't find your MAC address (will auto-generate)
- ✅ WiFi MAC ≠ Bluetooth MAC (usually use WiFi MAC)

## Troubleshooting

### "This MAC address is already registered"
- Another account already registered this MAC
- Use a different device or contact admin

### Can't find MAC address?
- Leave blank when registering - system will auto-generate
- You can manually find it later using steps above

### Wrong device showing in Learning Insights?
- Make sure you're logged in with the correct account
- Each account only sees devices registered under that account
- To switch devices, log out and log in with the other account

## Files Modified

### Frontend:
- `src/pages/DevicesPage.jsx` - Added MAC address field, validation, auto-fill
- `src/services/deviceHelper.js` - Helper functions for device detection

### Backend:
- `src/routes/deviceRoutes.js` - Now accepts MAC address instead of always generating random

## Next Steps

1. Go to **"My Devices"** page
2. Click **"Add Device"**
3. Find your device's MAC address using the guide above
4. Register both iPhone and Vivo with their actual MAC addresses
5. Go to **Learning Insights** and verify the correct devices show up!
