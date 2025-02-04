const express = require('express');
const cron = require('node-cron');
require('dotenv').config();

const worklogRouter = require('./routes/worklog');
const worklogController = require('./controllers/worklogController');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/worklog', worklogRouter);

// Schedule daily email sending (runs at 11 PM every day)
// cron.schedule('0 11 * * *', async () => {
//     try {
//         console.log('Starting daily worklog email task:', new Date().toLocaleString());
//         const today = new Date().toISOString().split('T')[0];
//         console.log('Fetching worklogs for date:', today);
        
//         await worklogController.sendWorklogEmail(today);
//         console.log('Worklog emails sent successfully at:', new Date().toLocaleString());
//     } catch (error) {
//         console.error('Error in daily worklog task:', {
//             timestamp: new Date().toLocaleString(),
//             errorMessage: error.message,
//             stack: error.stack
//         });
//     }
// });

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

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});