# Device Loading 401 Error - Debug Guide

## What We've Done
Enhanced the codebase with debugging to help identify why the `/devices` API call is returning 401 Unauthorized:

### Enhanced Files:
1. **frontend/src/services/api.js** - Added comprehensive logging:
   - Logs every API request with method and URL
   - Shows when token is added or missing
   - Logs 401/403 errors with response details

2. **frontend/src/pages/DeviceLearningPage.jsx** - Added debug panel:
   - Shows token presence (✓ or ✗)
   - Shows number of devices loaded
   - Shows selected device ID
   - Directs to check browser console for logs

## Steps to Diagnose:

### CRITICAL CHECK #1: Is the backend running?
```bash
# In a separate terminal, check if backend is on port 5000:
curl http://localhost:5000/api/health
# Should return 200 OK (or endpoint might not exist, but shouldn't refuse connection)
```

### CRITICAL CHECK #2: Is Vite dev server running with proxy?
```bash
# The frontend frontend should be running on port 3000
# Check if you see the proxy configured:
# In terminal where you ran `npm run dev` in frontend folder
# Should see: "  ➜  Local:   https://localhost:3000"
```

### CRITICAL CHECK #3: Are you logged in?
1. Open browser DevTools (F12)
2. Go to Console tab
3. Type: `localStorage.getItem('token')`
4. Should NOT return `null`
   - If it returns `null` → **You need to log in first!**
   - If it returns a long string → Token is present

### CHECK #4: Check API Logs
1. Open browser DevTools (F12)
2. Go to Console tab
3. Reload the Learning Insights page
4. Look for logs like:
   - `📡 Request: GET /api/devices` → Request is being made correctly
   - `🔐 Auth token added for GET /devices` → Token is being added
   - `⚠️ No token in localStorage for GET /devices` → Token missing (fix: log in again)
   - `❌ 401 Unauthorized - Invalid or missing token` → Token invalid

### CHECK #5: Check Network Tab
1. Open browser DevTools (F12)
2. Go to Network tab
3. Reload the Learning Insights page
4. Look for the `devices` request
5. Click on it and check:
   - **Request Headers**: Should have `Authorization: Bearer eyJhbGc...` header
   - **Response Status**: Should be 401 if auth fails
   - **Response Body**: Will show the exact error message from backend

### CHECK #6: Verify Backend Server Status
In a terminal:
```bash
# Check if backend is running:
ps aux | grep "npm\|node" | grep -v grep
# You should see a process running the backend on port 5000

# Or try to ping the backend directly:
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" http://localhost:5000/api/devices
```

## Most Likely Causes:

1. **❌ Not logged in** → Login first at `/login`

2. **❌ Vite dev server not running** → Run `npm run dev` in the frontend folder

3. **❌ Backend server not running** → Run backend (check backend README)

4. **❌ Token expired** → Log out and log in again

5. **❌ Account not approved** → Backend will return 403 (different error)
   - Check if your user account status is 'ACTIVE' in the database

6. **❌ CORS issue** → Check browser console for CORS error
   - Vite proxy should handle this, but verify it's working

## What the Debug Panel Shows:

```
🔍 Debug Info:
Token: ✓ Present | Devices loaded: 3 | Selected device: 60a7b8c9d1e2f3g4h5i6j7k8
```

- **✓ Present** = Good, token is in localStorage
- **✗ Missing** = Bad, you need to log in first
- **Devices loaded: 0** = API request failed (check console logs)
- **Devices loaded: 3** = Good, devices were fetched successfully

## Next Steps:

1. **Check browser console (F12)** and share the logs starting with `📡 Request`
2. **Verify token is present** using: `localStorage.getItem('token')`
3. **Check Network tab** to see actual request/response
4. **Verify backend is running** with a direct curl request

Once you identify which check is failing, we can fix the root cause!
