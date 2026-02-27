# FORGE Auth Testing Playbook

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  mode: 'supportive',
  direct_mode_reason: '',
  ai_provider: 'none',
  azure_api_key: '',
  azure_endpoint: 'https://kyrex-hub-resource.openai.azure.com/openai/v1/',
  azure_model: 'gpt-5.2',
  onboarding_completed: true,
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# Test auth
curl -X GET "$API_URL/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test habits
curl -X GET "$API_URL/api/habits" -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Create habit
curl -X POST "$API_URL/api/habits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"name": "Morning Run", "priority": 3, "context": "Health & fitness"}'
```

## Step 3: Browser Testing
```python
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "morning-forge.preview.emergentagent.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://habit-forge-build.preview.emergentagent.com")
```

## Checklist
- [ ] User document has `user_id` field (custom UUID, not MongoDB _id)
- [ ] Session document has matching `user_id`
- [ ] All queries use `{"_id": 0}` projection
- [ ] Backend returns user data without 401
- [ ] Dashboard loads (not login page)
- [ ] Habit creation works
- [ ] Completion toggle works
- [ ] AI insight generation works (with/without API key)
- [ ] Mood logging works
- [ ] Analytics data loads

## Success Indicators
✅ /api/auth/me returns user data  
✅ Dashboard loads without redirect  
✅ CRUD operations work  
✅ Analytics charts render  
✅ AI Coach page loads  
