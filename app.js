const express = require('express');
// Import the cron and axios packages
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const worklogRouter = require('./routes/worklog');
const worklogController = require('./controllers/worklogController');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/worklog', worklogRouter);

// Schedule daily email sending (runs at 11 PM every day)
cron.schedule('0 11 * * *', async () => {
    try {
        console.log('Starting daily worklog email task:', new Date().toLocaleString());
        const today = new Date().toISOString().split('T')[0];
        console.log('Fetching worklogs for date:', today);
        
        await worklogController.sendWorklogEmail(today);
        console.log('Worklog emails sent successfully at:', new Date().toLocaleString());
    } catch (error) {
        console.error('Error in daily worklog task:', {
            timestamp: new Date().toLocaleString(),
            errorMessage: error.message,
            stack: error.stack
        });
    }
});

// Test endpoint to trigger email manually
app.get('/api/test-email', async (req, res) => {
    try {
        console.log('Testing worklog email...');
        const today = new Date().toISOString().split('T')[0];
        await worklogController.sendWorklogEmail(today);
        console.log('Test email sent successfully');
        res.json({ success: true, message: 'Test email sent successfully' });
    } catch (error) {
        console.error('Test email failed:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            timestamp: new Date().toLocaleString()
        });
    }
});

// Set up cron job to run every Monday at 9 AM
cron.schedule('0 9 * * 1', async () => {
  console.log('Running weekly worklog fetch cron job');
  
  try {
    // Get current week number
    const currentDate = new Date();
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
    const days = Math.floor((currentDate - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil(days / 7);
    
    // Create logs directory if it doesn't exist
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir);
    }
    
    // Log file path
    const logFile = path.join(logDir, `worklog_fetch_${currentDate.toISOString().split('T')[0]}.log`);
    
    // Log start of job
    fs.appendFileSync(logFile, `Starting worklog fetch at ${new Date().toISOString()}\n`);
    
    // Make the request to fetch all users' worklogs
    const response = await axios.get(`http://localhost:${port}/api/worklog/all-users-worklogs?weekNumber=${weekNumber}`);
    
    // Log success
    fs.appendFileSync(logFile, `Successfully fetched worklogs for week ${weekNumber}\n`);
    fs.appendFileSync(logFile, `Response status: ${response.status}\n`);
    fs.appendFileSync(logFile, `Response data: ${JSON.stringify(response.data)}\n`);
    
    console.log(`Worklog fetch completed for week ${weekNumber}`);
  } catch (error) {
    console.error('Error in worklog fetch cron job:', error);
    
    // Log error
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir);
    }
    
    const logFile = path.join(logDir, `worklog_fetch_error_${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, `Error at ${new Date().toISOString()}: ${error.message}\n`);
    if (error.response) {
      fs.appendFileSync(logFile, `Response status: ${error.response.status}\n`);
      fs.appendFileSync(logFile, `Response data: ${JSON.stringify(error.response.data)}\n`);
    }
  }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});